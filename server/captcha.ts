import { createHash, createHmac } from "node:crypto"
import { generateChallenge, validateChallenge } from "capjs-core"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"
import { env } from "./env"
import { redis, rateLimit } from "./redis"

export const captchaPaths: Record<string, string> = {
  "/sign-in/email": "login",
  "/sign-up/email": "register",
  "/request-password-reset": "forgot",
  "/reset-password": "reset",
  "/send-verification-email": "verify",
  "/passkey/generate-authenticate-options": "login",
}
const scopeSchema = z.enum(["login", "register", "forgot", "reset", "verify"])
// Derive a separate key without adding deployment secrets or exposing the auth key.
const secret = createHmac("sha256", env.BETTER_AUTH_SECRET)
  .update("minehub:cap:v1")
  .digest("hex")
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")

export async function consumeCaptcha(token: unknown, scope: string) {
  if (typeof token !== "string" || token.length > 512) return false
  const parts = token.split(":")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false
  // GETDEL makes verification atomic, even across simultaneous API requests.
  const stored = await redis.getDel(`cap:token:${parts[0]}:${digest(parts[1])}`)
  return stored === scope
}

export const captcha = new Hono()
captcha.use("*", bodyLimit({ maxSize: 16 * 1024 }))
captcha.use("*", async (c, next) => {
  if (c.req.header("origin") !== new URL(env.BETTER_AUTH_URL).origin)
    return c.json({ message: "请求来源不受信任" }, 403)
  if (
    !(await rateLimit(
      `cap:${digest(c.req.header("x-minehub-client-ip") ?? "unknown")}`,
      30,
      60
    ))
  )
    return c.json({ message: "验证请求过于频繁，请稍后重试" }, 429)
  await next()
})
captcha.post("/:scope/challenge", async (c) => {
  const scope = scopeSchema.parse(c.req.param("scope"))
  return c.json(await generateChallenge(secret, { scope, expiresMs: 300_000 }))
})
captcha.post("/:scope/redeem", async (c) => {
  const scope = scopeSchema.parse(c.req.param("scope"))
  const body = await c.req.json()
  const result = await validateChallenge(secret, body, {
    scope,
    tokenTtlMs: 300_000,
    consumeNonce: async (signature, ttlMs) =>
      (await redis.set(`cap:nonce:${signature}`, "1", {
        NX: true,
        PX: Math.max(1, ttlMs),
      })) === "OK",
  })
  if (!result.success)
    return c.json({ success: false, message: "验证失败，请重试" }, 400)
  await redis.set(`cap:token:${result.tokenKey}`, scope, {
    PX: Math.max(1, result.expires - Date.now()),
  })
  // tokenKey is a server-side verifier and must never be sent to the browser.
  return c.json({ success: true, token: result.token, expires: result.expires })
})
