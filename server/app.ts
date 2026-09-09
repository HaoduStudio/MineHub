import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { secureHeaders } from "hono/secure-headers"
import { HTTPException } from "hono/http-exception"
import { getConnInfo } from "@hono/node-server/conninfo"
import { serveStatic } from "@hono/node-server/serve-static"
import { ZodError } from "zod"
import { auth } from "./auth"
import { db } from "./db"
import { env } from "./env"
import { redis, rateLimit } from "./redis"
import { readTexture } from "./textures"
import { player } from "./routes/player"
import { adminApi } from "./routes/admin"
import { yggdrasil } from "./yggdrasil"
import { fail, sha256 } from "./security"

export const app = new Hono()
app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }))
app.use(
  "*",
  bodyLimit({
    maxSize: 12 * 1024 * 1024,
    onError: (c) => c.json({ message: "请求内容过大" }, 413),
  })
)
app.use("*", async (c, next) => {
  let ip: string
  try {
    ip = getConnInfo(c).remote.address ?? "unknown"
  } catch {
    ip = "local-test"
  }
  if (env.TRUST_PROXY === "true") ip = c.req.header("x-real-ip") ?? ip
  c.req.raw.headers.set("x-minehub-client-ip", ip)
  c.header(
    "X-Authlib-Injector-API-Location",
    `${env.BETTER_AUTH_URL}/api/yggdrasil/`
  )
  await next()
})
app.get("/health/live", (c) => c.json({ status: "ok" }))
app.get("/health/ready", async (c) => {
  try {
    await db.$queryRaw`SELECT 1`
    if (!redis.isReady) return c.json({ status: "unavailable" }, 503)
    return c.json({ status: "ok" })
  } catch {
    return c.json({ status: "unavailable" }, 503)
  }
})
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store")
  const game = c.req.path.startsWith("/api/yggdrasil")
  if (!redis.isReady)
    return c.json(
      game
        ? {
            error: "ServiceUnavailableException",
            errorMessage: "Authentication service unavailable.",
          }
        : { message: "服务暂不可用，请稍后重试" },
      503
    )
  if (
    !(await rateLimit(
      `ip:${sha256(c.req.header("x-minehub-client-ip") ?? "unknown")}`,
      600,
      60
    ))
  )
    return c.json(
      game
        ? {
            error: "ForbiddenOperationException",
            errorMessage: "Too many requests.",
          }
        : { message: "请求过于频繁，请稍后重试" },
      429
    )
  await next()
})
app.use("/api/v1/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (
      c.req.header("origin") !== new URL(env.BETTER_AUTH_URL).origin ||
      c.req.header("x-minehub-request") !== "1"
    )
      fail(403, "请求来源不受信任")
  }
  await next()
})
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
app.route("/api/v1/admin", adminApi)
app.route("/api/v1", player)
app.route("/api/yggdrasil", yggdrasil)
app.get("/textures/:hash", async (c) => {
  const bytes = await readTexture(c.req.param("hash"))
  c.header("Content-Type", "image/png")
  c.header("X-Content-Type-Options", "nosniff")
  c.header("Cache-Control", "public, max-age=0, must-revalidate")
  return c.body(new Uint8Array(bytes))
})
app.all("/api/*", (c) => c.json({ message: "接口不存在" }, 404))
app.use("*", serveStatic({ root: "./dist" }))
app.get("*", serveStatic({ path: "./dist/index.html" }))
app.onError((error, c) => {
  if (error instanceof SyntaxError)
    return c.json({ message: "请求格式无效" }, 400)
  if (error instanceof HTTPException)
    return c.json({ message: error.message }, error.status)
  if (error instanceof ZodError)
    return c.json(
      {
        message: error.issues[0]?.message ?? "输入无效",
        fields: error.flatten().fieldErrors,
      },
      400
    )
  if ("code" in error && error.code === "P2002")
    return c.json({ message: "名称或记录已存在" }, 409)
  if ("code" in error && error.code === "P2025")
    return c.json({ message: "记录不存在" }, 404)
  if (
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  )
    return c.json({ message: error.message }, 400)
  console.error("Request failed", c.req.method, c.req.path, error.name)
  if (env.NODE_ENV === "test") console.error(error.message)
  if (c.req.path.startsWith("/api/yggdrasil"))
    return c.json(
      {
        error: "ServiceUnavailableException",
        errorMessage: "Authentication service unavailable.",
      },
      503
    )
  return c.json({ message: "服务暂不可用，请稍后重试" }, 503)
})
