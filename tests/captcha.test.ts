import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { captcha, consumeCaptcha } from "../server/captcha"
import { solveCaptcha } from "./captcha-helper"

const { records, ready, limit } = vi.hoisted(() => ({
  records: new Map<string, { value: string; expires: number }>(),
  ready: { value: true },
  limit: { value: true },
}))
vi.mock("../server/env", () => ({
  env: {
    BETTER_AUTH_URL: "http://localhost:5173",
    BETTER_AUTH_SECRET: "captcha-test-secret-at-least-thirty-two-characters",
  },
}))
vi.mock("../server/redis", () => ({
  rateLimit: async () => limit.value,
  redis: {
    set: async (
      key: string,
      value: string,
      options: { NX?: boolean; PX: number }
    ) => {
      if (!ready.value) throw new Error("Redis unavailable")
      if (options.NX && (records.get(key)?.expires ?? 0) > Date.now())
        return null
      records.set(key, { value, expires: Date.now() + options.PX })
      return "OK"
    },
    getDel: async (key: string) => {
      if (!ready.value) throw new Error("Redis unavailable")
      const record = records.get(key)
      records.delete(key)
      return record && record.expires > Date.now() ? record.value : null
    },
  },
}))
const call = (path: string, body?: unknown, origin = "http://localhost:5173") =>
  captcha.request(path, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
async function redeem(scope = "login") {
  const challenge = await (await call(`/${scope}/challenge`)).json()
  const solution = solveCaptcha(challenge)
  const response = await call(`/${scope}/redeem`, solution)
  expect(response.status).toBe(200)
  return { solution, result: await response.json() }
}

describe("Cap proof-of-work and API tokens", () => {
  beforeEach(() => {
    records.clear()
    ready.value = true
    limit.value = true
  })
  it("solves a real challenge and permits exactly one concurrent consumption", async () => {
    const { result } = await redeem()
    expect(result.tokenKey).toBeUndefined()
    expect(
      await Promise.all([
        consumeCaptcha(result.token, "login"),
        consumeCaptcha(result.token, "login"),
      ])
    ).toEqual([true, false])
  })
  it("rejects replayed challenges, invalid solutions and cross-scope tokens", async () => {
    const { solution, result } = await redeem()
    expect((await call("/login/redeem", solution)).status).toBe(400)
    expect((await call("/register/redeem", solution)).status).toBe(400)
    expect(
      (await call("/login/redeem", { ...solution, solutions: [] })).status
    ).toBe(400)
    expect(await consumeCaptcha(result.token, "register")).toBe(false)
  })
  it("expires tokens and rejects missing, forged or oversized tokens", async () => {
    const { result } = await redeem()
    for (const record of records.values()) record.expires = Date.now() - 1
    expect(await consumeCaptcha(result.token, "login")).toBe(false)
    for (const token of [null, "", "forged:token", "x".repeat(513)])
      expect(await consumeCaptcha(token, "login")).toBe(false)
  })
  it("rejects foreign origins and rate-limited challenge requests", async () => {
    expect(
      (await call("/login/challenge", {}, "https://evil.example")).status
    ).toBe(403)
    limit.value = false
    expect((await call("/login/challenge")).status).toBe(429)
  })
  it("fails closed when the token store is unavailable", async () => {
    const { result } = await redeem()
    ready.value = false
    await expect(consumeCaptcha(result.token, "login")).rejects.toThrow(
      "Redis unavailable"
    )
  })
})
