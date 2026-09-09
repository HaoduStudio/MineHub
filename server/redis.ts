import { createClient } from "redis"
import { env } from "./env"

export const redis = createClient({
  url: env.REDIS_URL,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 3000) },
  disableOfflineQueue: true,
})
redis.on("error", () => {})
export async function connectRedis() {
  if (!redis.isOpen) await redis.connect()
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  if (!redis.isReady) throw new Error("REDIS_UNAVAILABLE")
  const count = Number(
    await redis.eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n",
      { keys: [`limit:${key}`], arguments: [String(seconds)] }
    )
  )
  return count <= limit
}
