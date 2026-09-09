import { describe, expect, it, vi, afterEach } from "vite-plus/test"
import { fetchHitokoto, parseHitokoto } from "../src/lib/hitokoto"

afterEach(() => vi.unstubAllGlobals())

describe("auth caption quotes", () => {
  it("reads official JSON and third-party plain text", () => {
    expect(parseHitokoto('{"hitokoto":" 星河长明 ","from":"诗"}')).toBe(
      "星河长明"
    )
    expect(parseHitokoto("  第三方一言\n")).toBe("第三方一言")
    expect(parseHitokoto('"JSON 字符串"')).toBe("JSON 字符串")
  })
  it("rejects error pages and missing or invalid quote fields", () => {
    for (const body of [
      "",
      "  ",
      "<html>Bad Gateway</html>",
      '{"error":"failed"}',
      '{"hitokoto":42}',
      "{broken",
      "null",
    ])
      expect(() => parseHitokoto(body)).toThrow()
    expect(parseHitokoto("字".repeat(600))).toHaveLength(500)
  })
  it("does not send credentials or referrer to quote providers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"hitokoto":"hello"}'))
    vi.stubGlobal("fetch", fetch)
    expect(
      await fetchHitokoto(
        "https://example.test/?c=a",
        new AbortController().signal
      )
    ).toBe("hello")
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://example.test/?c=a"),
      expect.objectContaining({
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: expect.any(AbortSignal),
      })
    )
  })
  it("rejects unsuccessful responses and non-HTTP URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("failure", { status: 503 }))
    )
    await expect(
      fetchHitokoto("https://example.test", new AbortController().signal)
    ).rejects.toThrow()
    await expect(
      fetchHitokoto("javascript:alert(1)", new AbortController().signal)
    ).rejects.toThrow()
  })
})
