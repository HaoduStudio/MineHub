export const DEFAULT_HITOKOTO_URL = "https://v1.hitokoto.cn/"

export function parseHitokoto(body: string): string {
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    if (/^\s*[<{[]/.test(body)) throw new Error("无效的一言响应")
    value = body
  }
  const text =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "hitokoto" in value
        ? value.hitokoto
        : undefined
  if (typeof text !== "string" || !text.trim())
    throw new Error("一言响应缺少文本")
  return text.trim().slice(0, 500)
}

export async function fetchHitokoto(url: string, signal: AbortSignal) {
  const endpoint = new URL(url)
  if (!["https:", "http:"].includes(endpoint.protocol))
    throw new Error("一言 API 需使用 HTTP 或 HTTPS")
  const response = await fetch(endpoint, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json, text/plain" },
  })
  if (!response.ok) throw new Error("一言暂时不可用")
  return parseHitokoto(await response.text())
}
