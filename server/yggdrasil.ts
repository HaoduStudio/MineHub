import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z, ZodError } from "zod"
import { db, settings } from "./db"
import { env } from "./env"
import { redis, rateLimit } from "./redis"
import {
  sha256,
  secret,
  secureEqual,
  uuidCompact,
  uuidDashed,
} from "./security"
import { publicKey, signTexture } from "./signing"
import { isActiveUser } from "./domain"
import type { Character, Texture } from "./generated/prisma/client"

class YggError extends Error {
  constructor(
    public status: 400 | 403 | 503,
    message = "Invalid token.",
    public type = "ForbiddenOperationException"
  ) {
    super(message)
  }
}
function invalid(): never {
  throw new YggError(403)
}
function credentialError(): never {
  throw new YggError(403, "Invalid credentials. Invalid username or password.")
}
const tokenInput = z.object({
  accessToken: z.string().min(1).max(4096),
  clientToken: z.string().max(4096).optional(),
  requestUser: z.boolean().optional(),
  selectedProfile: z
    .object({ id: z.string(), name: z.string().optional() })
    .optional(),
})
const characterInclude = {
  skin: { include: { blob: true } },
  cape: { include: { blob: true } },
} as const

export async function gameCredential(username: string, password: string) {
  if (
    !(await rateLimit(`game-account:${sha256(username.toLowerCase())}`, 10, 60))
  )
    credentialError()
  const [prefix, id, value] = password.split(".")
  const credential =
    prefix === "mhg" && id && value
      ? await db.gameCredential.findUnique({
          where: { id },
          include: { user: true },
        })
      : null
  if (
    !credential ||
    credential.revokedAt ||
    credential.user.email.toLowerCase() !== username.toLowerCase() ||
    !isActiveUser(credential.user) ||
    !secureEqual(credential.secretHash, sha256(value))
  )
    credentialError()
  await db.gameCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  })
  return credential
}
async function getToken(value: string, clientToken?: string, refresh = false) {
  const token = await db.gameToken.findUnique({
    where: { tokenHash: sha256(value) },
    include: {
      user: true,
      credential: true,
      character: { include: characterInclude },
    },
  })
  if (
    !token ||
    token.revokedAt ||
    token.expiresAt <= new Date() ||
    token.credential.revokedAt ||
    !isActiveUser(token.user) ||
    (clientToken !== undefined && token.clientToken !== clientToken) ||
    (!refresh && token.refreshRequired)
  )
    invalid()
  if (
    token.character &&
    (token.character.userId !== token.userId ||
      token.character.deletedAt ||
      token.character.disabled)
  )
    invalid()
  return token
}
function brief(character: Character) {
  return { id: uuidCompact(character.id), name: character.name }
}
function profile(
  character: Character & {
    skin: (Texture & { blob: { blocked: boolean } }) | null
    cape: (Texture & { blob: { blocked: boolean } }) | null
  },
  signed: boolean
) {
  const textures: Record<
    string,
    { url: string; metadata?: { model: string } }
  > = {}
  if (character.skin && !character.skin.blob.blocked)
    textures.SKIN = {
      url: `${env.BETTER_AUTH_URL}/textures/${character.skin.hash}`,
      metadata: { model: character.skin.model },
    }
  if (character.cape && !character.cape.blob.blocked)
    textures.CAPE = {
      url: `${env.BETTER_AUTH_URL}/textures/${character.cape.hash}`,
    }
  const value = Buffer.from(
    JSON.stringify({
      timestamp: Date.now(),
      profileId: uuidCompact(character.id),
      profileName: character.name,
      textures,
    })
  ).toString("base64")
  return {
    ...brief(character),
    properties: [
      {
        name: "textures",
        value,
        ...(signed ? { signature: signTexture(value) } : {}),
      },
    ],
  }
}

export const yggdrasil = new Hono()
yggdrasil.onError((error, c) => {
  if (
    error instanceof SyntaxError ||
    (error instanceof HTTPException && error.status === 400)
  )
    return c.json(
      { error: "IllegalArgumentException", errorMessage: "Invalid request." },
      400
    )
  if (error instanceof ZodError)
    return c.json(
      { error: "IllegalArgumentException", errorMessage: "Invalid request." },
      400
    )
  if (error instanceof YggError)
    return c.json(
      { error: error.type, errorMessage: error.message },
      error.status
    )
  return c.json(
    {
      error: "ServiceUnavailableException",
      errorMessage: "Authentication service unavailable.",
    },
    503
  )
})
yggdrasil.use("*", async (c, next) => {
  if (!redis.isReady)
    throw new YggError(
      503,
      "Authentication service unavailable.",
      "ServiceUnavailableException"
    )
  c.header("Cache-Control", "no-store")
  await next()
})
yggdrasil.get("/", async (c) =>
  c.json({
    meta: {
      serverName: (await settings()).name,
      implementationName: "MineHub",
      implementationVersion: "0.0.1",
      links: {
        homepage: env.BETTER_AUTH_URL,
        register: `${env.BETTER_AUTH_URL}/register`,
      },
      "feature.non_email_login": false,
      "feature.no_mojang_namespace": true,
      "feature.usernameCheck": true,
    },
    skinDomains: [new URL(env.BETTER_AUTH_URL).hostname],
    signaturePublickey: publicKey(),
  })
)
yggdrasil.post("/authserver/authenticate", async (c) => {
  const input = z
    .object({
      username: z.email(),
      password: z.string().max(512),
      clientToken: z.string().max(4096).optional(),
      requestUser: z.boolean().optional(),
      agent: z
        .object({ name: z.literal("Minecraft"), version: z.literal(1) })
        .optional(),
    })
    .parse(await c.req.json())
  const credential = await gameCredential(input.username, input.password)
  const characters = await db.character.findMany({
    where: { userId: credential.userId, disabled: false, deletedAt: null },
    orderBy: { createdAt: "asc" },
  })
  const selected = characters.length === 1 ? characters[0] : null
  const accessToken = secret()
  const clientToken = input.clientToken ?? uuidCompact(crypto.randomUUID())
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${credential.userId}))`
    const current = await tx.gameCredential.findUnique({
      where: { id: credential.id },
      include: { user: true },
    })
    if (!current || current.revokedAt || !isActiveUser(current.user))
      credentialError()
    const active = await tx.gameToken.findMany({
      where: { userId: credential.userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    })
    if (active.length >= 10)
      await tx.gameToken.updateMany({
        where: { id: { in: active.slice(9).map((t) => t.id) } },
        data: { revokedAt: new Date() },
      })
    await tx.gameToken.create({
      data: {
        tokenHash: sha256(accessToken),
        clientToken,
        credentialId: credential.id,
        userId: credential.userId,
        characterId: selected?.id,
        expiresAt: new Date(Date.now() + 15 * 86400000),
      },
    })
  })
  return c.json({
    accessToken,
    clientToken,
    availableProfiles: characters.map(brief),
    ...(selected ? { selectedProfile: brief(selected) } : {}),
    ...(input.requestUser
      ? { user: { id: uuidCompact(credential.userId), properties: [] } }
      : {}),
  })
})
yggdrasil.post("/authserver/refresh", async (c) => {
  const input = tokenInput.parse(await c.req.json())
  const previous = await getToken(input.accessToken, input.clientToken, true)
  if (previous.characterId && input.selectedProfile)
    throw new YggError(
      400,
      "Access token already has a profile assigned.",
      "IllegalArgumentException"
    )
  const character = input.selectedProfile
    ? await db.character.findFirst({
        where: {
          id: uuidDashed(input.selectedProfile.id),
          userId: previous.userId,
          deletedAt: null,
          disabled: false,
        },
      })
    : previous.character
  if (input.selectedProfile && !character) invalid()
  const accessToken = secret()
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${previous.userId}))`
    const old = await tx.gameToken.updateMany({
      where: {
        id: previous.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    })
    if (old.count !== 1) invalid()
    await tx.gameToken.create({
      data: {
        tokenHash: sha256(accessToken),
        clientToken: previous.clientToken,
        credentialId: previous.credentialId,
        userId: previous.userId,
        characterId: character?.id,
        expiresAt: new Date(Date.now() + 15 * 86400000),
      },
    })
  })
  return c.json({
    accessToken,
    clientToken: previous.clientToken,
    ...(character ? { selectedProfile: brief(character) } : {}),
    ...(input.requestUser
      ? { user: { id: uuidCompact(previous.userId), properties: [] } }
      : {}),
  })
})
yggdrasil.post("/authserver/validate", async (c) => {
  const input = tokenInput.parse(await c.req.json())
  await getToken(input.accessToken, input.clientToken)
  return c.body(null, 204)
})
yggdrasil.post("/authserver/invalidate", async (c) => {
  const input = tokenInput.parse(await c.req.json())
  await db.gameToken.updateMany({
    where: {
      tokenHash: sha256(input.accessToken),
      ...(input.clientToken !== undefined
        ? { clientToken: input.clientToken }
        : {}),
    },
    data: { revokedAt: new Date() },
  })
  return c.body(null, 204)
})
yggdrasil.post("/authserver/signout", async (c) => {
  const input = z
    .object({ username: z.email(), password: z.string().max(512) })
    .parse(await c.req.json())
  const credential = await gameCredential(input.username, input.password)
  await db.gameToken.updateMany({
    where: { userId: credential.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return c.body(null, 204)
})
yggdrasil.post("/sessionserver/session/minecraft/join", async (c) => {
  const input = z
    .object({
      accessToken: z.string().max(4096),
      selectedProfile: z.string(),
      serverId: z.string().regex(/^-?[a-fA-F0-9]{1,40}$/),
    })
    .parse(await c.req.json())
  const token = await getToken(input.accessToken)
  if (
    !token.characterId ||
    uuidCompact(token.characterId) !==
      uuidCompact(input.selectedProfile).toLowerCase()
  )
    invalid()
  await redis.set(
    `join:${input.serverId}:${token.characterId}`,
    JSON.stringify({
      tokenHash: token.tokenHash,
      ip: c.req.header("x-minehub-client-ip") ?? "",
    }),
    { EX: 30 }
  )
  return c.body(null, 204)
})
yggdrasil.get("/sessionserver/session/minecraft/hasJoined", async (c) => {
  const character = await db.character.findFirst({
    where: {
      nameKey: (c.req.query("username") ?? "").toLowerCase(),
      deletedAt: null,
      disabled: false,
    },
    include: characterInclude,
  })
  if (!character) return c.body(null, 204)
  const data = await redis.get(
    `join:${c.req.query("serverId")}:${character.id}`
  )
  if (!data) return c.body(null, 204)
  const proof = JSON.parse(data) as { tokenHash: string; ip: string }
  const token = await db.gameToken.findUnique({
    where: { tokenHash: proof.tokenHash },
    include: { user: true, credential: true },
  })
  if (
    !token ||
    token.revokedAt ||
    token.expiresAt <= new Date() ||
    token.refreshRequired ||
    token.credential.revokedAt ||
    !isActiveUser(token.user) ||
    character.userId !== token.userId ||
    (c.req.query("ip") && c.req.query("ip") !== proof.ip)
  )
    return c.body(null, 204)
  return c.json(profile(character, true))
})
yggdrasil.get("/sessionserver/session/minecraft/profile/:uuid", async (c) => {
  const character = await db.character.findUnique({
    where: { id: uuidDashed(c.req.param("uuid")) },
    include: characterInclude,
  })
  if (
    !character ||
    character.deletedAt ||
    character.disabled ||
    !character.userId
  )
    return c.body(null, 204)
  return c.json(profile(character, c.req.query("unsigned") === "false"))
})
yggdrasil.post("/api/profiles/minecraft", async (c) => {
  const names = z
    .array(z.string().max(16))
    .max(100)
    .parse(await c.req.json())
  const characters = await db.character.findMany({
    where: {
      nameKey: { in: names.map((n) => n.toLowerCase()) },
      userId: { not: null },
      deletedAt: null,
      disabled: false,
    },
  })
  return c.json(characters.map(brief))
})
yggdrasil.notFound((c) =>
  c.json({ error: "NotFound", errorMessage: "Endpoint not found." }, 404)
)
