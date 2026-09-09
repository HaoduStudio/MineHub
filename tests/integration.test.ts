import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test"
import { createHmac, verify } from "node:crypto"
import sharp from "sharp"
import { app } from "../server/app"
import { auth } from "../server/auth"
import { db, settings } from "../server/db"
import { redis, connectRedis } from "../server/redis"
import { env } from "../server/env"
import { initSigning, publicKey } from "../server/signing"
import { captchaPaths } from "../server/captcha"
import { solveCaptcha } from "./captcha-helper"

const { mailbox } = vi.hoisted(() => ({
  mailbox: [] as { email: string; body: string }[],
}))
vi.mock("../server/mail", () => ({
  sendMail: async (email: string, _subject: string, body: string) => {
    mailbox.push({ email, body })
  },
  mail: { verify: async () => true },
}))

class Client {
  cookies = new Map<string, string>()
  async call(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST"
  ) {
    const headers = new Headers({
      origin: env.BETTER_AUTH_URL,
      "x-minehub-request": "1",
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    })
    if (body !== undefined && !(body instanceof FormData))
      headers.set("content-type", "application/json")
    const captchaScope = captchaPaths[path.replace(/^\/api\/auth/, "")]
    if (captchaScope) {
      const challenge = await this.call(
        `/api/captcha/${captchaScope}/challenge`,
        {}
      )
      const redeemed = await this.call(
        `/api/captcha/${captchaScope}/redeem`,
        solveCaptcha(challenge.data)
      )
      expect(redeemed.status, JSON.stringify(redeemed.data)).toBe(200)
      headers.set("x-captcha-token", redeemed.data.token)
    }
    const response = await app.request(`${env.BETTER_AUTH_URL}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";")
      const at = pair.indexOf("=")
      this.cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
    const text = await response.text()
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
      headers: response.headers,
    }
  }
}

function totp(base32: string) {
  const bits = base32
    .replace(/=+$/, "")
    .toUpperCase()
    .split("")
    .map((c) =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0")
    )
    .join("")
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const count = Buffer.alloc(8)
  count.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac("sha1", key).update(count).digest(),
    offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0"
  )
}

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "PostgreSQL and Redis integration",
  () => {
    const owner = new Client(),
      stranger = new Client(),
      admin = new Client(),
      guest = new Client()
    const password = "MineHub-test-password-2026!"
    let ownerId: string,
      adminId: string,
      characterId: string,
      credentialId: string,
      gamePassword: string,
      textureId: string,
      textureHash: string,
      token: string,
      clientToken: string
    let adminSecret: string, backupCode: string
    beforeAll(async () => {
      if (!new URL(env.DATABASE_URL).pathname.endsWith("_test"))
        throw new Error(
          "Integration tests require a separate database ending in _test"
        )
      await db.$connect()
      await connectRedis()
      await initSigning()
      await db.$executeRawUnsafe(
        'TRUNCATE TABLE "User", "Verification", "RateLimit", "Character", "Texture", "TextureBlob", "GameServer", "Announcement", "ImportBatch", "LegacyIdentity", "Claim", "Report", "SiteSettings", "AuditLog" CASCADE'
      )
      await settings()
      await db.siteSettings.update({
        where: { id: "site" },
        data: { migrationEnabled: false },
      })
      const ctx = await auth.$context
      const hash = await ctx.password.hash(password)
      for (const [client, name, role] of [
        [owner, "owner", "user"],
        [stranger, "stranger", "user"],
        [admin, "administrator", "admin"],
      ] as const) {
        const id = crypto.randomUUID()
        await db.user.create({
          data: {
            id,
            name,
            email: `${name}@example.test`,
            emailVerified: true,
            role,
            accounts: {
              create: {
                id: crypto.randomUUID(),
                providerId: "credential",
                accountId: id,
                password: hash,
              },
            },
          },
        })
        const login = await client.call("/api/auth/sign-in/email", {
          email: `${name}@example.test`,
          password,
        })
        expect(login.status, JSON.stringify(login.data)).toBe(200)
        if (client === owner) ownerId = id
        if (client === admin) adminId = id
      }
    }, 30000)
    beforeEach(async () => {
      await db.rateLimit.deleteMany()
    })
    afterAll(async () => {
      if (redis.isOpen) redis.destroy()
      await db.$disconnect()
    })

    it("requires Cap verification on every protected auth API", async () => {
      for (const path of Object.keys(captchaPaths)) {
        const response = await app.request(
          `${env.BETTER_AUTH_URL}/api/auth${path}`,
          {
            method: path.includes("generate-authenticate") ? "GET" : "POST",
            headers: {
              origin: env.BETTER_AUTH_URL,
              "content-type": "application/json",
            },
            ...(path.includes("generate-authenticate")
              ? {}
              : {
                  body: JSON.stringify({
                    name: "Captcha test",
                    email: "owner@example.test",
                    password,
                    newPassword: password,
                    token: "invalid",
                    callbackURL: "/login",
                  }),
                }),
          }
        )
        expect(response.status, path).toBe(403)
        expect((await response.json()).code, path).toBe("CAPTCHA_REQUIRED")
      }
    })

    it("registers, rejects unverified email, and consumes the verification link", async () => {
      const client = new Client()
      expect(
        (
          await client.call("/api/auth/sign-up/email", {
            name: "新人",
            email: "new@example.test",
            password,
            callbackURL: "/app",
          })
        ).status
      ).toBe(200)
      expect(
        (
          await client.call("/api/auth/sign-in/email", {
            email: "new@example.test",
            password,
          })
        ).status
      ).toBe(403)
      const url = mailbox
        .find((m) => m.email === "new@example.test")!
        .body.match(/https?:\/\/\S+/)![0]
      expect(
        (await client.call(new URL(url).pathname + new URL(url).search)).status
      ).toBe(302)
      expect(
        (
          await client.call("/api/auth/sign-in/email", {
            email: "new@example.test",
            password,
          })
        ).status
      ).toBe(200)
      expect(
        (await client.call("/api/auth/verify-email?token=expired")).status
      ).toBeGreaterThanOrEqual(300)
    })
    it("requires server-side ownership, trusted origins and administrator TOTP", async () => {
      expect((await guest.call("/api/v1/characters")).status).toBe(401)
      expect((await owner.call("/api/v1/admin/users")).status).toBe(403)
      expect((await admin.call("/api/v1/admin/users")).status).toBe(403)
      expect((await admin.call("/api/auth/admin/list-users")).status).toBe(403)
      expect(
        (
          await app.request("/api/v1/characters", {
            method: "POST",
            body: "{}",
            headers: { origin: "https://untrusted.test" },
          })
        ).status
      ).toBe(403)
      const result = await owner.call("/api/v1/characters", {
        name: "TestPlayer",
      })
      expect(result.status).toBe(201)
      characterId = result.data.id
      expect(
        (
          await stranger.call(
            `/api/v1/characters/${characterId}`,
            { name: "StolenName" },
            "PATCH"
          )
        ).status
      ).toBe(404)
      expect(
        (await stranger.call("/api/v1/characters", { name: "testplayer" }))
          .status
      ).toBe(409)
    })
    it("enables and verifies administrator TOTP, protecting native plugin routes", async () => {
      const enable = await admin.call("/api/auth/two-factor/enable", {
        password,
      })
      expect(enable.status, JSON.stringify(enable.data)).toBe(200)
      adminSecret = new URL(enable.data.totpURI).searchParams.get("secret")!
      backupCode = enable.data.backupCodes[0]
      expect((await admin.call("/api/v1/admin/users")).status).toBe(403)
      const result = await admin.call("/api/auth/two-factor/verify-totp", {
        code: totp(adminSecret),
      })
      expect(result.status, JSON.stringify(result.data)).toBe(200)
      expect((await admin.call("/api/v1/admin/users")).status).toBe(200)
      expect(
        (await admin.call("/api/auth/two-factor/disable", { password })).status
      ).toBe(403)
      expect(
        (
          await admin.call("/api/auth/admin/create-user", {
            email: "bypass@example.test",
            password,
            name: "Bypass",
          })
        ).status
      ).toBe(403)
      expect(
        (
          await admin.call("/api/v1/admin/users/actions", {
            ids: [adminId],
            action: "ban",
          })
        ).status
      ).toBe(409)
    })
    it("uses one-time recovery codes on subsequent sign-in", async () => {
      const client = new Client()
      const login = await client.call("/api/auth/sign-in/email", {
        email: "administrator@example.test",
        password,
      })
      expect(login.data.twoFactorRedirect).toBe(true)
      expect((await client.call("/api/v1/admin/users")).status).toBe(401)
      expect(
        (
          await client.call("/api/auth/two-factor/verify-backup-code", {
            code: backupCode,
          })
        ).status
      ).toBe(200)
      expect((await client.call("/api/v1/admin/users")).status).toBe(200)
      expect(
        (
          await client.call("/api/auth/two-factor/verify-backup-code", {
            code: backupCode,
          })
        ).status
      ).toBe(401)
    })
    it("validates upload bytes and preserves access boundaries", async () => {
      const upload = async (bytes: Uint8Array, name: string) => {
        const form = new FormData()
        form.set(
          "file",
          new File([new Uint8Array(bytes)], "skin.png", { type: "image/png" })
        )
        form.set("name", name)
        form.set("kind", "skin")
        form.set("public", "false")
        return owner.call("/api/v1/textures", form)
      }
      expect(
        (await upload(new TextEncoder().encode("not PNG"), "Invalid")).status
      ).toBe(400)
      expect(
        (
          await upload(
            await sharp({
              create: { width: 32, height: 32, channels: 4, background: "red" },
            })
              .png()
              .toBuffer(),
            "Wrong size"
          )
        ).status
      ).toBe(400)
      const result = await upload(
        await sharp({
          create: { width: 64, height: 64, channels: 4, background: "#6366f1" },
        })
          .png()
          .toBuffer(),
        "Test skin"
      )
      expect(result.status, JSON.stringify(result.data)).toBe(201)
      textureId = result.data.id
      textureHash = result.data.hash
      expect(
        (await stranger.call(`/api/v1/textures/${textureId}`)).status
      ).toBe(404)
      expect(
        (
          await owner.call(
            `/api/v1/characters/${characterId}`,
            { skinId: textureId },
            "PATCH"
          )
        ).status
      ).toBe(200)
      expect(
        (
          await owner.call(
            `/api/v1/textures/${textureId}`,
            { public: true },
            "PATCH"
          )
        ).status
      ).toBe(200)
      expect(
        (await stranger.call(`/api/v1/textures/${textureId}/favorite`, {}))
          .status
      ).toBe(200)
      expect(
        (
          await stranger.call(
            `/api/v1/textures/${textureId}`,
            { name: "Stolen" },
            "PATCH"
          )
        ).status
      ).toBe(404)
    })
    it("switches avatars between uploads and skins, serving and cleaning up files", async () => {
      const form = new FormData()
      form.set(
        "file",
        new File(
          [
            await sharp({
              create: {
                width: 300,
                height: 200,
                channels: 4,
                background: "#f59e0b",
              },
            })
              .png()
              .toBuffer(),
          ],
          "avatar.png",
          { type: "image/png" }
        )
      )
      expect((await owner.call("/api/v1/me/avatar", form)).status).toBe(200)
      let me = await owner.call("/api/v1/me")
      expect(me.data.user.avatarKind).toBe("upload")
      const avatarHash = me.data.user.avatarHash
      expect(avatarHash).toMatch(/^[a-f0-9]{64}$/)
      expect(
        (await app.request(`${env.BETTER_AUTH_URL}/avatars/${avatarHash}`))
          .status
      ).toBe(200)
      expect(
        (await app.request(`${env.BETTER_AUTH_URL}/avatars/not-a-hash`)).status
      ).toBe(404)
      expect(
        (await owner.call("/api/v1/me/avatar/skin", { textureId })).status
      ).toBe(200)
      me = await owner.call("/api/v1/me")
      expect(me.data.user.avatarKind).toBe("skin")
      expect(me.data.user.avatarTextureId).toBe(textureId)
      expect(me.data.avatarTextureHash).toBe(textureHash)
      expect(
        (await app.request(`${env.BETTER_AUTH_URL}/avatars/${avatarHash}`))
          .status
      ).toBe(404)
      expect(
        (
          await stranger.call("/api/v1/me/avatar/skin", {
            textureId: "missing",
          })
        ).status
      ).toBe(404)
      expect(
        (await owner.call("/api/v1/me/avatar", undefined, "DELETE")).status
      ).toBe(200)
      me = await owner.call("/api/v1/me")
      expect(me.data.user.avatarKind).toBeNull()
      expect(me.data.avatarTextureHash).toBeNull()
    })
    it("issues independent game credentials and validates signed skin profiles", async () => {
      const credential = await owner.call("/api/v1/credentials", {
        name: "Test launcher",
      })
      expect(credential.status).toBe(201)
      gamePassword = credential.data.password
      credentialId = credential.data.id
      const result = await guest.call(
        "/api/yggdrasil/authserver/authenticate",
        {
          username: "owner@example.test",
          password: gamePassword,
          requestUser: true,
        }
      )
      expect(result.status, JSON.stringify(result.data)).toBe(200)
      token = result.data.accessToken
      clientToken = result.data.clientToken
      expect(result.data.selectedProfile.id).toBe(
        characterId.replaceAll("-", "")
      )
      expect(
        (
          await guest.call("/api/yggdrasil/authserver/validate", {
            accessToken: token,
            clientToken,
          })
        ).status
      ).toBe(204)
      expect(
        (
          await guest.call("/api/yggdrasil/authserver/authenticate", {
            username: "owner@example.test",
            password,
          })
        ).status
      ).toBe(403)
      const join = await guest.call(
        "/api/yggdrasil/sessionserver/session/minecraft/join",
        {
          accessToken: token,
          selectedProfile: characterId.replaceAll("-", ""),
          serverId: "123abc",
        }
      )
      expect(join.status).toBe(204)
      const joined = await guest.call(
        "/api/yggdrasil/sessionserver/session/minecraft/hasJoined?username=TestPlayer&serverId=123abc"
      )
      expect(joined.status).toBe(200)
      const property = joined.data.properties[0]
      expect(
        verify(
          "RSA-SHA1",
          Buffer.from(property.value),
          publicKey(),
          Buffer.from(property.signature, "base64")
        )
      ).toBe(true)
      expect(
        JSON.parse(Buffer.from(property.value, "base64").toString()).textures
          .SKIN.url
      ).toContain(textureHash)
      expect(
        (
          await guest.call(
            "/api/yggdrasil/sessionserver/session/minecraft/hasJoined?username=TestPlayer&serverId=123abc&ip=8.8.8.8"
          )
        ).status
      ).toBe(204)
    })
    it("invalidates renamed profiles until refresh and prevents concurrent token replay", async () => {
      expect(
        (
          await owner.call(
            `/api/v1/characters/${characterId}`,
            { name: "RenamedPlayer" },
            "PATCH"
          )
        ).status
      ).toBe(200)
      expect(
        (
          await guest.call("/api/yggdrasil/authserver/validate", {
            accessToken: token,
            clientToken,
          })
        ).status
      ).toBe(403)
      const refreshed = await Promise.all(
        [1, 2].map(() =>
          guest.call("/api/yggdrasil/authserver/refresh", {
            accessToken: token,
            clientToken,
          })
        )
      )
      expect(refreshed.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 403,
      ])
      expect(
        refreshed.find((r) => r.status === 200)!.data.selectedProfile.name
      ).toBe("RenamedPlayer")
      token = refreshed.find((r) => r.status === 200)!.data.accessToken
      expect(
        (
          await owner.call(
            `/api/v1/credentials/${credentialId}`,
            undefined,
            "DELETE"
          )
        ).status
      ).toBe(200)
      expect(
        (
          await guest.call("/api/yggdrasil/authserver/validate", {
            accessToken: token,
          })
        ).status
      ).toBe(403)
    })
    it("supports explicit profile selection for accounts with several characters", async () => {
      const second = await owner.call("/api/v1/characters", {
        name: "OtherPlayer",
      })
      expect(second.status).toBe(201)
      const credential = await owner.call("/api/v1/credentials", {
        name: "Multi profile",
      })
      const login = await guest.call("/api/yggdrasil/authserver/authenticate", {
        username: "owner@example.test",
        password: credential.data.password,
      })
      expect(login.data.availableProfiles).toHaveLength(2)
      expect(login.data.selectedProfile).toBeUndefined()
      const select = await guest.call("/api/yggdrasil/authserver/refresh", {
        accessToken: login.data.accessToken,
        clientToken: login.data.clientToken,
        selectedProfile: { id: second.data.id.replaceAll("-", "") },
      })
      expect(select.status).toBe(200)
      expect(select.data.selectedProfile.name).toBe("OtherPlayer")
    })
    it("imports idempotently, reserves old names and atomically resolves competing claims", async () => {
      await db.gameServer.create({
        data: {
          key: "old",
          name: "Old server",
          address: "example.test",
          queryHost: "example.test",
        },
      })
      const rows = [
        {
          serverKey: "old",
          name: "OldPlayer",
          uuid: "b50ad385829d3141a2167e7d7539ba7f",
        },
      ]
      const preview = await admin.call("/api/v1/admin/imports/preview", rows)
      expect(preview.status).toBe(200)
      const result = await admin.call("/api/v1/admin/imports/commit", {
        rows,
        digest: preview.data.digest,
      })
      expect(result.status, JSON.stringify(result.data)).toBe(200)
      expect(
        (
          await admin.call("/api/v1/admin/imports/commit", {
            rows,
            digest: preview.data.digest,
          })
        ).status
      ).toBe(200)
      expect(
        (await owner.call("/api/v1/characters", { name: "OldPlayer" })).status
      ).toBe(409)
      const first = await owner.call("/api/v1/claims", {
        serverKey: "old",
        name: "OldPlayer",
        evidence: "I can provide the old account records.",
      })
      const second = await stranger.call("/api/v1/claims", {
        serverKey: "old",
        name: "OldPlayer",
        evidence: "I claim the same old server profile.",
      })
      expect(first.status).toBe(201)
      expect(second.status).toBe(201)
      const resolve = await Promise.all(
        [first.data.id, second.data.id].map((id) =>
          admin.call(`/api/v1/admin/claims/${id}/resolve`, {
            approve: true,
            resolution: "Verified historical ownership records",
          })
        )
      )
      expect(resolve.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ])
      const winner = await db.character.findUniqueOrThrow({
        where: { id: "b50ad385-829d-3141-a216-7e7d7539ba7f" },
      })
      expect(winner.userId).toBeTruthy()
      const winnerClient = winner.userId === ownerId ? owner : stranger
      expect(
        (
          await winnerClient.call(
            `/api/v1/characters/${winner.id}`,
            { name: "OldRenamed" },
            "PATCH"
          )
        ).status
      ).toBe(200)
      expect(
        (await stranger.call("/api/v1/characters", { name: "OldPlayer" }))
          .status
      ).toBe(409)
    })
    it("reports without auto-removal, then blocks downloads and unequips all references", async () => {
      const report = await stranger.call(
        `/api/v1/textures/${textureId}/report`,
        { reason: "Inappropriate content for review" }
      )
      expect(report.status).toBe(201)
      expect((await app.request(`/textures/${textureHash}`)).status).toBe(200)
      expect(
        (
          await admin.call(`/api/v1/admin/reports/${report.data.id}/resolve`, {
            block: true,
            resolution: "Content reviewed and removed",
          })
        ).status
      ).toBe(200)
      expect((await app.request(`/textures/${textureHash}`)).status).toBe(404)
      expect(
        (await db.character.findUniqueOrThrow({ where: { id: characterId } }))
          .skinId
      ).toBeNull()
      expect(
        (
          await owner.call(
            `/api/v1/characters/${characterId}`,
            { skinId: textureId },
            "PATCH"
          )
        ).status
      ).toBe(403)
    })
    it("rejects malformed PNG data and enforces upload and model limits", async () => {
      const form = new FormData()
      form.set(
        "file",
        new File(
          [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
          "broken.png"
        )
      )
      form.set("name", "Broken")
      form.set("kind", "skin")
      expect((await owner.call("/api/v1/textures", form)).status).toBe(400)
      form.set("file", new File([new Uint8Array(1048577)], "large.png"))
      expect((await owner.call("/api/v1/textures", form)).status).toBe(400)
      expect(
        (
          await guest.call(
            "/api/yggdrasil/sessionserver/session/minecraft/profile/invalid-uuid"
          )
        ).status
      ).toBe(400)
      expect(
        (
          await admin.call(`/api/v1/admin/textures/${textureId}/moderate`, {
            blocked: false,
            reason: "Restored after review",
          })
        ).status
      ).toBe(200)
      expect(
        (
          await owner.call(
            `/api/v1/textures/${textureId}`,
            { model: "slim" },
            "PATCH"
          )
        ).status
      ).toBe(200)
      expect(
        (await owner.call(`/api/v1/textures/${textureId}`)).data.model
      ).toBe("slim")
    })
    it("requires a recent session to create a game password", async () => {
      await db.session.updateMany({
        where: { userId: ownerId },
        data: { createdAt: new Date(Date.now() - 3600000) },
      })
      expect(
        (await owner.call("/api/v1/credentials", { name: "Stale session" }))
          .status
      ).toBe(403)
      await db.session.updateMany({
        where: { userId: ownerId },
        data: { createdAt: new Date() },
      })
    })
    it("preserves deleted names and rejects import conflicts after rename", async () => {
      const character = await stranger.call("/api/v1/characters", {
        name: "DeleteReserved",
      })
      expect(character.status).toBe(201)
      expect(
        (
          await stranger.call(
            `/api/v1/characters/${character.data.id}`,
            undefined,
            "DELETE"
          )
        ).status
      ).toBe(200)
      expect(
        (await stranger.call("/api/v1/characters", { name: "DeleteReserved" }))
          .status
      ).toBe(409)
      const rows = [
        { serverKey: "old", name: "OldPlayer", uuid: crypto.randomUUID() },
      ]
      const preview = await admin.call("/api/v1/admin/imports/preview", rows)
      expect(preview.data.issues.length).toBeGreaterThan(0)
      expect(
        (
          await admin.call("/api/v1/admin/imports/commit", {
            rows,
            digest: preview.data.digest,
          })
        ).status
      ).toBe(409)
    })
    it("changes email through both mailboxes and revokes game credentials", async () => {
      const credential = await stranger.call("/api/v1/credentials", {
        name: "Email change",
      })
      expect(credential.status).toBe(201)
      expect(
        (
          await stranger.call("/api/auth/change-email", {
            newEmail: "changed@example.test",
            callbackURL: "/app/settings",
          })
        ).status
      ).toBe(200)
      const follow = async (email: string) => {
        const url = mailbox
          .filter((m) => m.email === email)
          .at(-1)!
          .body.match(/https?:\/\/\S+/)![0]
        return guest.call(new URL(url).pathname + new URL(url).search)
      }
      await follow("stranger@example.test")
      expect(mailbox.some((m) => m.email === "changed@example.test")).toBe(true)
      await follow("changed@example.test")
      const user = await db.user.findUniqueOrThrow({
        where: { email: "changed@example.test" },
      })
      expect(user.emailVerified).toBe(true)
      expect(
        await db.gameCredential.count({
          where: { userId: user.id, revokedAt: null },
        })
      ).toBe(0)
    })
    it("bans accounts and revokes both web sessions and game access", async () => {
      const user = await db.user.findUniqueOrThrow({
        where: { email: "changed@example.test" },
      })
      expect(
        (
          await admin.call("/api/v1/admin/users/actions", {
            ids: [user.id],
            action: "ban",
            reason: "Integration test",
          })
        ).status
      ).toBe(200)
      expect((await stranger.call("/api/v1/me")).status).toBe(401)
      expect(
        (
          await stranger.call("/api/auth/sign-in/email", {
            email: user.email,
            password,
          })
        ).status
      ).toBe(403)
    })
    it("resets passwords, revokes game credentials and consumes reset tokens once", async () => {
      const reset = await guest.call("/api/auth/request-password-reset", {
        email: "owner@example.test",
        redirectTo: `${env.BETTER_AUTH_URL}/reset-password`,
      })
      expect(reset.status).toBe(200)
      const url = mailbox
        .filter((m) => m.email === "owner@example.test")
        .at(-1)!
        .body.match(/https?:\/\/\S+/)![0]
      const landing = await guest.call(
        new URL(url).pathname + new URL(url).search
      )
      const resetToken = new URL(
        landing.headers.get("location")!,
        env.BETTER_AUTH_URL
      ).searchParams.get("token")
      expect(
        (
          await guest.call("/api/auth/reset-password", {
            token: resetToken,
            newPassword: "MineHub-changed-password-2026!",
          })
        ).status
      ).toBe(200)
      expect(
        await db.gameCredential.count({
          where: { userId: ownerId, revokedAt: null },
        })
      ).toBe(0)
      expect((await owner.call("/api/v1/me")).status).toBe(401)
      expect(
        (
          await guest.call("/api/auth/reset-password", {
            token: resetToken,
            newPassword: password,
          })
        ).status
      ).toBe(400)
    })
    it("publishes auth page artwork with an admin-controlled cache window", async () => {
      const current = await settings()
      const patch = await admin.call(
        "/api/v1/admin/settings",
        {
          ...current,
          authImageLight: "https://art.example.test/day.jpg",
          authImageDark: "",
          authImageCacheMinutes: 5,
        },
        "PATCH"
      )
      expect(patch.status, JSON.stringify(patch.data)).toBe(200)
      const published = await guest.call("/api/v1/public/settings")
      expect(published.data.authImageLight).toBe(
        "https://art.example.test/day.jpg"
      )
      expect(published.data.authImageDark).toBe("")
      expect(published.headers.get("cache-control")).toBe("public, max-age=300")
      expect(
        (
          await admin.call(
            "/api/v1/admin/settings",
            { ...patch.data, authImageLight: "not-a-url" },
            "PATCH"
          )
        ).status
      ).toBe(400)
      const uncached = await admin.call(
        "/api/v1/admin/settings",
        { ...patch.data, authImageCacheMinutes: 0 },
        "PATCH"
      )
      expect(uncached.status).toBe(200)
      expect(
        (await guest.call("/api/v1/public/settings")).headers.get(
          "cache-control"
        )
      ).toBe("no-store")
    })
    it("persists and publishes caption modes and validates provider settings", async () => {
      const current = await settings()
      for (const mode of ["hidden", "site", "custom", "hitokoto"]) {
        const patch = await admin.call(
          "/api/v1/admin/settings",
          {
            ...current,
            authCaptionMode: mode,
            authCaptionText: "自定义文案",
            authHitokotoUrl: "https://quotes.example.test/?encode=text",
          },
          "PATCH"
        )
        expect(patch.status, JSON.stringify(patch.data)).toBe(200)
        const published = await guest.call("/api/v1/public/settings")
        expect(published.data.authCaptionMode).toBe(mode)
        expect(published.data.authCaptionText).toBe("自定义文案")
        expect(published.data.authHitokotoUrl).toBe(
          "https://quotes.example.test/?encode=text"
        )
      }
      for (const invalid of [
        { authCaptionMode: "invalid" },
        { authCaptionText: "x".repeat(501) },
        { authHitokotoUrl: "javascript:alert(1)" },
        { authHitokotoUrl: "not-a-url" },
      ]) {
        expect(
          (
            await admin.call(
              "/api/v1/admin/settings",
              { ...current, ...invalid },
              "PATCH"
            )
          ).status
        ).toBe(400)
      }
    })
    it("stores admin theme colours and rejects malformed hex values", async () => {
      const current = await settings()
      const patch = await admin.call(
        "/api/v1/admin/settings",
        { ...current, themeColorLight: "#1447e6", themeColorDark: "" },
        "PATCH"
      )
      expect(patch.status, JSON.stringify(patch.data)).toBe(200)
      expect(patch.data.themeColorLight).toBe("#1447e6")
      const published = await guest.call("/api/v1/public/settings")
      expect(published.data.themeColorLight).toBe("#1447e6")
      expect(published.data.themeColorDark).toBe("")
      for (const themeColorLight of ["#12345", "red", "#gggggg", "#1234567"])
        expect(
          (
            await admin.call(
              "/api/v1/admin/settings",
              { ...patch.data, themeColorLight },
              "PATCH"
            )
          ).status,
          themeColorLight
        ).toBe(400)
      expect(
        (
          await admin.call(
            "/api/v1/admin/settings",
            { ...patch.data, themeColorLight: "", themeColorDark: "#94b6ff" },
            "PATCH"
          )
        ).status
      ).toBe(200)
      const cleared = await admin.call(
        "/api/v1/admin/settings",
        { ...patch.data, themeColorLight: "", themeColorDark: "" },
        "PATCH"
      )
      expect(cleared.status, JSON.stringify(cleared.data)).toBe(200)
      const reset = await guest.call("/api/v1/public/settings")
      expect(reset.data.themeColorLight).toBe("")
      expect(reset.data.themeColorDark).toBe("")
    })
    it("stores optional ICP and police filing numbers and clears them", async () => {
      const current = await settings()
      const patch = await admin.call(
        "/api/v1/admin/settings",
        {
          ...current,
          icpNumber: "京ICP备00000000号-1",
          policeNumber: "京公网安备00000000000000号",
        },
        "PATCH"
      )
      expect(patch.status, JSON.stringify(patch.data)).toBe(200)
      expect(patch.data.icpNumber).toBe("京ICP备00000000号-1")
      const published = await guest.call("/api/v1/public/settings")
      expect(published.data.icpNumber).toBe("京ICP备00000000号-1")
      expect(published.data.policeNumber).toBe("京公网安备00000000000000号")
      expect(
        (
          await admin.call(
            "/api/v1/admin/settings",
            { ...patch.data, icpNumber: "x".repeat(65) },
            "PATCH"
          )
        ).status
      ).toBe(400)
      const cleared = await admin.call(
        "/api/v1/admin/settings",
        { ...patch.data, icpNumber: "", policeNumber: "" },
        "PATCH"
      )
      expect(cleared.status, JSON.stringify(cleared.data)).toBe(200)
      const reset = await guest.call("/api/v1/public/settings")
      expect(reset.data.icpNumber).toBe("")
      expect(reset.data.policeNumber).toBe("")
    })
    it("fails closed with protocol-shaped errors when Redis is unavailable", async () => {
      redis.destroy()
      const response = await guest.call("/api/yggdrasil/authserver/validate", {
        accessToken: token,
      })
      expect(response.status).toBe(503)
      expect(response.data.error).toBe("ServiceUnavailableException")
      expect((await guest.call("/health/ready")).status).toBe(503)
      await connectRedis()
    })
  }
)
