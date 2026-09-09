import { serve } from "@hono/node-server"
import { app } from "./app"
import { env } from "./env"
import { db, settings } from "./db"
import { connectRedis, redis } from "./redis"
import { initSigning } from "./signing"
import { startPolling } from "./servers"

console.log("Initializing MineHub API")
await initSigning()
await db.$connect()
await settings()
void connectRedis().catch(() => console.warn("Redis connecting"))
const stopPolling = startPolling()
const server = serve(
  { fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" },
  () => console.log(`MineHub API listening on ${env.PORT}`)
)
const stop = async () => {
  stopPolling()
  server.close()
  if (redis.isOpen) redis.destroy()
  await db.$disconnect()
  process.exit(0)
}
process.on("SIGINT", () => void stop())
process.on("SIGTERM", () => void stop())
