import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { HTTPException } from "hono/http-exception"
import type { Context } from "hono"
import { z } from "zod"
import { db } from "./db"
import type { Prisma } from "./generated/prisma/client"

export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex")
export const secret = () => randomBytes(32).toString("base64url")
export const uuidCompact = (id: string) => id.replaceAll("-", "")
export function uuidDashed(id: string) {
  const value = id.replaceAll("-", "").toLowerCase()
  if (!/^[a-f0-9]{32}$/.test(value))
    throw new HTTPException(400, { message: "UUID 无效" })
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}
export function secureEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
export const characterName = z
  .string()
  .regex(/^[A-Za-z0-9_]{3,16}$/, "使用 3–16 位字母、数字或下划线")
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).default(""),
})
export const paging = (c: Context) => {
  const value = pageQuery.parse(c.req.query())
  return { ...value, skip: (value.page - 1) * value.limit }
}
export function audit(
  actorId: string | null,
  action: string,
  target: string,
  details: Prisma.InputJsonValue = {}
) {
  return db.auditLog.create({ data: { actorId, action, target, details } })
}
export async function revokeGame(userId: string) {
  await db.$transaction(async (tx) => {
    await tx.gameCredential.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await tx.gameToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  })
}
export function fail(
  status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
  message: string
): never {
  throw new HTTPException(status, { message })
}
