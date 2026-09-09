import { createHash } from "node:crypto"
import { z } from "zod"

export const importRow = z.object({
  serverKey: z.string().regex(/^[a-z0-9_-]{1,48}$/),
  name: z.string().regex(/^[A-Za-z0-9_]{3,16}$/),
  uuid: z
    .string()
    .regex(
      /^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12})$/
    ),
})
export function normalizeUuid(value: string) {
  const id = value.replaceAll("-", "").toLowerCase()
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
}
export function parseManifest(input: unknown) {
  const rows = z
    .array(importRow)
    .min(1)
    .max(10000)
    .parse(input)
    .map((row) => ({
      ...row,
      uuid: normalizeUuid(row.uuid),
      nameKey: row.name.toLowerCase(),
    }))
  const names = new Map<string, string>()
  const ids = new Map<string, string>()
  const issues: { row: number; message: string }[] = []
  rows.forEach((row, index) => {
    if (names.has(row.nameKey) && names.get(row.nameKey) !== row.uuid)
      issues.push({ row: index + 1, message: "同名角色对应不同 UUID" })
    if (ids.has(row.uuid) && ids.get(row.uuid) !== row.name)
      issues.push({ row: index + 1, message: "同一 UUID 的原名不一致" })
    names.set(row.nameKey, row.uuid)
    ids.set(row.uuid, row.name)
  })
  const unique = [
    ...new Map(rows.map((r) => [`${r.serverKey}:${r.uuid}`, r])).values(),
  ]
  const digest = createHash("sha256")
    .update(
      JSON.stringify(
        [...unique].sort((a, b) =>
          `${a.serverKey}:${a.uuid}`.localeCompare(`${b.serverKey}:${b.uuid}`)
        )
      )
    )
    .digest("hex")
  return { rows: unique, issues, digest }
}
export function isTextureSize(kind: string, width: number, height: number) {
  return (
    width === 64 &&
    (kind === "skin"
      ? height === 32 || height === 64
      : kind === "cape" && height === 32)
  )
}
export function isActiveUser(user: {
  banned: boolean | null
  banExpires: Date | null
  emailVerified: boolean
}) {
  return (
    user.emailVerified &&
    (!user.banned ||
      (user.banExpires !== null && user.banExpires <= new Date()))
  )
}
