import net from "node:net"
import { lookup } from "node:dns/promises"
import { env } from "./env"
import { db } from "./db"

const blocked = new net.BlockList()
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, bits, "ipv4")
for (const [ip, bits] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(ip, bits, "ipv6")
export const privateAddress = (address: string) =>
  blocked.check(address, net.isIPv6(address) ? "ipv6" : "ipv4")
function varint(value: number) {
  const bytes: number[] = []
  do {
    let next = value & 127
    value >>>= 7
    if (value) next |= 128
    bytes.push(next)
  } while (value)
  return Buffer.from(bytes)
}
function readVarint(buffer: Buffer, offset: number): [number, number] | null {
  let value = 0
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buffer.length) return null
    const byte = buffer[offset + i]
    value |= (byte & 127) << (7 * i)
    if (!(byte & 128)) return [value >>> 0, offset + i + 1]
  }
  throw new Error("Invalid status packet")
}
export async function queryServer(host: string, port: number) {
  const startedAt = Date.now()
  let lookupTimer: ReturnType<typeof setTimeout> | undefined
  const addresses = await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => {
      lookupTimer = setTimeout(() => reject(new Error("DNS timeout")), 3000)
    }),
  ]).finally(() => clearTimeout(lookupTimer))
  if (
    !addresses.length ||
    (env.SERVER_QUERY_ALLOW_PRIVATE !== "true" &&
      addresses.some((a) => privateAddress(a.address)))
  )
    throw new Error("Query address not allowed")
  const address = addresses[0]
  return new Promise<{ online: number; maxPlayers: number }>(
    (resolve, reject) => {
      const socket = net.connect({
        host: address.address,
        port,
        family: address.family,
      })
      const timer = setTimeout(
        () => {
          socket.destroy()
          reject(new Error("Server timeout"))
        },
        Math.max(1, 3000 - (Date.now() - startedAt))
      )
      let data = Buffer.alloc(0)
      const finish = (
        error?: Error,
        result?: { online: number; maxPlayers: number }
      ) => {
        clearTimeout(timer)
        socket.destroy()
        if (error) reject(error)
        else if (result) resolve(result)
      }
      socket.on("connect", () => {
        const hostname = Buffer.from(host)
        const portBytes = Buffer.alloc(2)
        portBytes.writeUInt16BE(port)
        const packet = Buffer.concat([
          varint(0),
          varint(767),
          varint(hostname.length),
          hostname,
          portBytes,
          varint(1),
        ])
        socket.write(
          Buffer.concat([varint(packet.length), packet, Buffer.from([1, 0])])
        )
      })
      socket.on("error", (error) => finish(error))
      socket.on("end", () => finish(new Error("Incomplete server response")))
      socket.on("data", (chunk) => {
        try {
          data = Buffer.concat([data, chunk])
          if (data.length > 1048576)
            return finish(new Error("Status too large"))
          const length = readVarint(data, 0)
          if (!length) return
          if (length[0] > 1048576) return finish(new Error("Status too large"))
          if (data.length < length[0] + length[1]) return
          const id = readVarint(data, length[1])
          if (!id || id[0] !== 0) return finish(new Error("Invalid status"))
          const text = readVarint(data, id[1])
          if (!text || text[0] + text[1] > length[0] + length[1])
            return finish(new Error("Invalid status"))
          const result = JSON.parse(
            data.subarray(text[1], text[1] + text[0]).toString()
          )
          if (
            !Number.isInteger(result.players?.online) ||
            !Number.isInteger(result.players?.max) ||
            result.players.online < 0 ||
            result.players.max < 0
          )
            return finish(new Error("Invalid player count"))
          finish(undefined, {
            online: result.players.online,
            maxPlayers: result.players.max,
          })
        } catch {
          finish(new Error("Invalid status response"))
        }
      })
    }
  )
}
export async function refreshServer(id: string) {
  const server = await db.gameServer.findUniqueOrThrow({ where: { id } })
  try {
    const result = await queryServer(server.queryHost, server.queryPort)
    return await db.gameServer.update({
      where: { id },
      data: { status: "online", ...result, checkedAt: new Date() },
    })
  } catch (error) {
    const offline =
      (error as NodeJS.ErrnoException).code === "ECONNREFUSED" ||
      (error as Error).message === "Server timeout"
    return db.gameServer.update({
      where: { id },
      data: {
        status: offline ? "offline" : "error",
        online: null,
        maxPlayers: null,
        checkedAt: new Date(),
      },
    })
  }
}
export function startPolling() {
  let active = false
  const run = async () => {
    if (active) return
    active = true
    try {
      for (const server of await db.gameServer.findMany({
        where: { hidden: false },
        select: { id: true },
      }))
        await refreshServer(server.id)
    } catch {
      console.warn("Server polling unavailable")
    } finally {
      active = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), 60000)
  return () => clearInterval(timer)
}
