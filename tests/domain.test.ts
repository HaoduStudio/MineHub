import { describe, expect, it } from "vite-plus/test"
import {
  parseManifest,
  isTextureSize,
  normalizeUuid,
  isActiveUser,
} from "../server/domain"

describe("identity manifest", () => {
  const row = {
    serverKey: "survival",
    name: "Steve",
    uuid: "b50ad385829d3141a2167e7d7539ba7f",
  }
  it("preserves offline UUID and canonicalizes representation", () => {
    expect(parseManifest([row]).rows[0].uuid).toBe(
      "b50ad385-829d-3141-a216-7e7d7539ba7f"
    )
    expect(normalizeUuid(row.uuid.toUpperCase())).toBe(
      "b50ad385-829d-3141-a216-7e7d7539ba7f"
    )
  })
  it("rejects same-name conflicting identities across servers", () => {
    const result = parseManifest([
      row,
      { ...row, serverKey: "creative", uuid: crypto.randomUUID() },
    ])
    expect(result.issues).toEqual([
      { row: 2, message: "同名角色对应不同 UUID" },
    ])
  })
  it("rejects a UUID with inconsistent original name", () => {
    expect(parseManifest([row, { ...row, name: "steve" }]).issues).toHaveLength(
      1
    )
  })
  it("has stable idempotency digest independent of order", () => {
    const second = { ...row, serverKey: "creative" }
    expect(parseManifest([row, second]).digest).toBe(
      parseManifest([second, row]).digest
    )
    expect(parseManifest([row, row]).rows).toHaveLength(1)
  })
  it("does not infer a UUID from a name or accept unsafe names", () => {
    expect(() =>
      parseManifest([{ serverKey: "survival", name: "Steve" }])
    ).toThrow()
    expect(() => parseManifest([{ ...row, name: "../../world" }])).toThrow()
  })
})
describe("texture dimensions", () => {
  it("accepts standard and legacy skins", () => {
    expect(isTextureSize("skin", 64, 64)).toBe(true)
    expect(isTextureSize("skin", 64, 32)).toBe(true)
  })
  it("rejects oversized, malformed and incorrect cape dimensions", () => {
    expect(isTextureSize("skin", 64000, 64000)).toBe(false)
    expect(isTextureSize("cape", 64, 64)).toBe(false)
    expect(isTextureSize("cape", 64, 32)).toBe(true)
  })
})
describe("game entitlement", () => {
  it("requires verified email and rejects current bans", () => {
    expect(
      isActiveUser({ emailVerified: false, banned: false, banExpires: null })
    ).toBe(false)
    expect(
      isActiveUser({ emailVerified: true, banned: true, banExpires: null })
    ).toBe(false)
    expect(
      isActiveUser({
        emailVerified: true,
        banned: true,
        banExpires: new Date(Date.now() - 1000),
      })
    ).toBe(true)
  })
})
