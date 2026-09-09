import { Hono } from "hono"
import { z } from "zod"
import { db, settings } from "../db"
import type { Prisma } from "../generated/prisma/client"
import { auth } from "../auth"
import { signedIn, requireFresh, type AppEnv } from "../access"
import { audit, characterName, fail, paging, secret, sha256 } from "../security"
import { textureInclude, uploadTexture } from "../textures"
import { identityLock } from "../migration"

export const characterInclude = {
  skin: { include: textureInclude },
  cape: { include: textureInclude },
  legacyIdentities: { select: { serverKey: true, originalName: true } },
} as const
export const player = new Hono<AppEnv>()
player.get("/public/settings", async (c) => c.json(await settings()))
player.get("/public/announcements/:id", async (c) => {
  const item = await db.announcement.findFirst({
    where: { id: c.req.param("id"), publishedAt: { lte: new Date() } },
  })
  if (!item) fail(404, "公告不存在")
  return c.json(item)
})
player.use("*", signedIn)
player.get("/me", async (c) => {
  const identity = c.get("identity")
  const session = await db.session.findUnique({
    where: { id: identity.session.id },
  })
  return c.json({
    user: identity.user,
    adminVerified: !!session?.totpVerifiedAt,
    config: await settings(),
  })
})
player.patch("/me/featured", async (c) => {
  const { characterId } = z
    .object({ characterId: z.string() })
    .parse(await c.req.json())
  if (
    !(await db.character.findFirst({
      where: {
        id: characterId,
        userId: c.get("identity").user.id,
        deletedAt: null,
      },
    }))
  )
    fail(404, "角色不存在")
  await db.user.update({
    where: { id: c.get("identity").user.id },
    data: { featuredCharacterId: characterId },
  })
  return c.json({ success: true })
})
player.post("/me/delete", async (c) => {
  const identity = c.get("identity")
  requireFresh(identity)
  const input = z.object({ password: z.string() }).parse(await c.req.json())
  await auth.api.verifyPassword({ headers: c.req.raw.headers, body: input })
  await db.$transaction(async (tx) => {
    await identityLock(tx)
    if (
      identity.user.role === "admin" &&
      (await tx.user.count({
        where: {
          role: "admin",
          banned: false,
          twoFactorEnabled: true,
          id: { not: identity.user.id },
        },
      })) === 0
    )
      fail(409, "不能删除最后一个有效管理员")
    await tx.character.updateMany({
      where: { userId: identity.user.id },
      data: { deletedAt: new Date(), disabled: true },
    })
    await tx.texture.updateMany({
      where: { userId: identity.user.id },
      data: { public: false, removedAt: new Date() },
    })
    await tx.user.delete({ where: { id: identity.user.id } })
    await tx.auditLog.create({
      data: { action: "account.delete", target: identity.user.id },
    })
  })
  return c.json({ success: true })
})
player.get("/characters", async (c) => {
  const { page, limit, skip, q } = paging(c)
  const where = {
    userId: c.get("identity").user.id,
    deletedAt: null,
    name: { contains: q, mode: "insensitive" as const },
  }
  const [items, total] = await Promise.all([
    db.character.findMany({
      where,
      include: characterInclude,
      orderBy: { createdAt: "asc" },
      skip,
      take: limit,
    }),
    db.character.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
player.post("/characters", async (c) => {
  const { name } = z.object({ name: characterName }).parse(await c.req.json())
  const userId = c.get("identity").user.id
  const result = await db.$transaction(async (tx) => {
    await identityLock(tx)
    const config = await tx.siteSettings.findUniqueOrThrow({
      where: { id: "site" },
    })
    if (config.migrationEnabled && !config.migrationReady)
      fail(409, "旧服身份导入完成后开放新角色创建")
    if (
      (await tx.character.count({ where: { userId, deletedAt: null } })) >=
      config.characterLimit
    )
      fail(409, "已达到角色数量限制")
    if (
      await tx.legacyIdentity.findFirst({
        where: { nameKey: name.toLowerCase() },
      })
    )
      fail(409, "该名称已为旧服角色保留")
    const item = await tx.character.create({
      data: { name, nameKey: name.toLowerCase(), userId },
      include: characterInclude,
    })
    await tx.auditLog.create({
      data: { actorId: userId, action: "character.create", target: item.id },
    })
    return item
  })
  return c.json(result, 201)
})
player.get("/characters/:id", async (c) => {
  const item = await db.character.findFirst({
    where: {
      id: c.req.param("id"),
      userId: c.get("identity").user.id,
      deletedAt: null,
    },
    include: characterInclude,
  })
  if (!item) fail(404, "角色不存在")
  return c.json(item)
})
player.patch("/characters/:id", async (c) => {
  const input = z
    .object({
      name: characterName.optional(),
      skinId: z.string().nullable().optional(),
      capeId: z.string().nullable().optional(),
    })
    .parse(await c.req.json())
  const userId = c.get("identity").user.id
  return c.json(
    await db.$transaction(async (tx) => {
      await identityLock(tx)
      const character = await tx.character.findFirst({
        where: {
          id: c.req.param("id"),
          userId,
          deletedAt: null,
          disabled: false,
        },
      })
      if (!character) fail(404, "角色不存在或已停用")
      if (
        input.name &&
        (await tx.legacyIdentity.findFirst({
          where: {
            nameKey: input.name.toLowerCase(),
            characterId: { not: character.id },
          },
        }))
      )
        fail(409, "该名称已为旧服角色保留")
      for (const [id, kind] of [
        [input.skinId, "skin"],
        [input.capeId, "cape"],
      ] as const) {
        if (!id) continue
        const texture = await tx.texture.findFirst({
          where: {
            id,
            kind,
            removedAt: null,
            blob: { blocked: false },
            OR: [
              { userId },
              { public: true },
              { favorites: { some: { userId } } },
            ],
          },
        })
        if (!texture) fail(403, "无法使用该材质")
      }
      if (input.name && input.name !== character.name)
        await tx.gameToken.updateMany({
          where: { characterId: character.id, revokedAt: null },
          data: { refreshRequired: true },
        })
      const item = await tx.character.update({
        where: { id: character.id },
        data: {
          ...input,
          ...(input.name ? { nameKey: input.name.toLowerCase() } : {}),
        },
        include: characterInclude,
      })
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "character.update",
          target: character.id,
        },
      })
      return item
    })
  )
})
player.delete("/characters/:id", async (c) => {
  requireFresh(c.get("identity"))
  const userId = c.get("identity").user.id
  await db.$transaction(async (tx) => {
    await identityLock(tx)
    if (
      (
        await tx.character.updateMany({
          where: { id: c.req.param("id"), userId, deletedAt: null },
          data: { deletedAt: new Date(), disabled: true },
        })
      ).count !== 1
    )
      fail(404, "角色不存在")
    await tx.gameToken.updateMany({
      where: { characterId: c.req.param("id") },
      data: { revokedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "character.delete",
        target: c.req.param("id"),
      },
    })
  })
  return c.json({ success: true })
})
player.get("/credentials", async (c) =>
  c.json(
    await db.gameCredential.findMany({
      where: { userId: c.get("identity").user.id, revokedAt: null },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    })
  )
)
player.post("/credentials", async (c) => {
  const identity = c.get("identity")
  requireFresh(identity)
  const { name } = z
    .object({ name: z.string().trim().min(1).max(64) })
    .parse(await c.req.json())
  const password = secret()
  const credential = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.user.id}))`
    if (
      (await tx.gameCredential.count({
        where: { userId: identity.user.id, revokedAt: null },
      })) >= 10
    )
      fail(409, "最多创建 10 个游戏密码")
    return tx.gameCredential.create({
      data: { name, userId: identity.user.id, secretHash: sha256(password) },
    })
  })
  await audit(identity.user.id, "credential.create", credential.id)
  return c.json(
    { id: credential.id, name, password: `mhg.${credential.id}.${password}` },
    201
  )
})
player.delete("/credentials/:id", async (c) => {
  const userId = c.get("identity").user.id
  await db.$transaction(async (tx) => {
    await tx.gameCredential.updateMany({
      where: { id: c.req.param("id"), userId },
      data: { revokedAt: new Date() },
    })
    await tx.gameToken.updateMany({
      where: { credentialId: c.req.param("id"), userId },
      data: { revokedAt: new Date() },
    })
  })
  await audit(userId, "credential.revoke", c.req.param("id"))
  return c.json({ success: true })
})
player.get("/game-sessions", async (c) =>
  c.json(
    await db.gameToken.findMany({
      where: {
        userId: c.get("identity").user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        credential: { select: { name: true } },
        character: { select: { name: true } },
      },
    })
  )
)
player.delete("/game-sessions/:id", async (c) => {
  await db.gameToken.updateMany({
    where: {
      userId: c.get("identity").user.id,
      ...(c.req.param("id") === "all" ? {} : { id: c.req.param("id") }),
    },
    data: { revokedAt: new Date() },
  })
  return c.json({ success: true })
})
player.get("/textures", async (c) => {
  const { page, limit, skip, q } = paging(c)
  const userId = c.get("identity").user.id
  const scope = c.req.query("scope") ?? "public"
  const where: Prisma.TextureWhereInput = {
    removedAt: null,
    blob: { blocked: false },
    name: { contains: q, mode: "insensitive" },
    ...(scope === "public"
      ? { public: true }
      : scope === "mine"
        ? { userId }
        : scope === "favorites"
          ? { favorites: { some: { userId } } }
          : { OR: [{ userId }, { favorites: { some: { userId } } }] }),
    ...(c.req.query("kind") ? { kind: c.req.query("kind") } : {}),
    ...(c.req.query("model") ? { model: c.req.query("model") } : {}),
  }
  const [items, total] = await Promise.all([
    db.texture.findMany({
      where,
      include: textureInclude,
      orderBy:
        c.req.query("sort") === "popular"
          ? { favorites: { _count: "desc" } }
          : { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.texture.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
player.post("/textures", async (c) => {
  const body = await c.req.parseBody()
  const input = z
    .object({
      name: z.string().trim().min(1).max(64),
      kind: z.enum(["skin", "cape"]),
      model: z.enum(["default", "slim"]).default("default"),
      public: z.enum(["true", "false"]).default("false"),
    })
    .parse(body)
  if (!(body.file instanceof File)) fail(400, "请选择图片")
  return c.json(
    await uploadTexture(
      body.file,
      input.name,
      input.kind,
      input.model,
      input.public === "true",
      c.get("identity").user.id
    ),
    201
  )
})
player.get("/textures/:id", async (c) => {
  const userId = c.get("identity").user.id
  const item = await db.texture.findFirst({
    where: {
      id: c.req.param("id"),
      removedAt: null,
      blob: { blocked: false },
      OR: [{ userId }, { public: true }, { favorites: { some: { userId } } }],
    },
    include: {
      ...textureInclude,
      favorites: { where: { userId }, select: { userId: true } },
    },
  })
  if (!item) fail(404, "材质不存在或已下架")
  return c.json(item)
})
player.patch("/textures/:id", async (c) => {
  const input = z
    .object({
      name: z.string().min(1).max(64).optional(),
      public: z.boolean().optional(),
      model: z.enum(["default", "slim"]).optional(),
    })
    .parse(await c.req.json())
  if (input.model) {
    const texture = await db.texture.findFirst({
      where: { id: c.req.param("id"), userId: c.get("identity").user.id },
      include: { blob: true },
    })
    if (!texture) fail(404, "材质不存在")
    if (
      input.model === "slim" &&
      (texture.kind !== "skin" || texture.blob.height !== 64)
    )
      fail(400, "纤细模型需要 64×64 皮肤")
  }
  if (
    (
      await db.texture.updateMany({
        where: {
          id: c.req.param("id"),
          userId: c.get("identity").user.id,
          removedAt: null,
          blob: { blocked: false },
        },
        data: input,
      })
    ).count !== 1
  )
    fail(404, "材质不存在")
  return c.json({ success: true })
})
player.delete("/textures/:id", async (c) => {
  if (
    (
      await db.texture.updateMany({
        where: { id: c.req.param("id"), userId: c.get("identity").user.id },
        data: { removedAt: new Date(), public: false },
      })
    ).count !== 1
  )
    fail(404, "材质不存在")
  return c.json({ success: true })
})
player.post("/textures/:id/favorite", async (c) => {
  const textureId = c.req.param("id"),
    userId = c.get("identity").user.id
  if (
    !(await db.texture.findFirst({
      where: {
        id: textureId,
        public: true,
        removedAt: null,
        blob: { blocked: false },
      },
    }))
  )
    fail(404, "材质不存在")
  await db.favorite.upsert({
    where: { userId_textureId: { userId, textureId } },
    create: { userId, textureId },
    update: {},
  })
  return c.json({ success: true })
})
player.delete("/textures/:id/favorite", async (c) => {
  await db.favorite.deleteMany({
    where: { textureId: c.req.param("id"), userId: c.get("identity").user.id },
  })
  return c.json({ success: true })
})
player.post("/textures/:id/report", async (c) => {
  const { reason } = z
    .object({ reason: z.string().trim().min(2).max(1000) })
    .parse(await c.req.json())
  if (
    !(await db.texture.findFirst({
      where: {
        id: c.req.param("id"),
        public: true,
        removedAt: null,
        blob: { blocked: false },
      },
    }))
  )
    fail(404, "材质不存在")
  const item = await db.report.create({
    data: {
      userId: c.get("identity").user.id,
      textureId: c.req.param("id"),
      reason,
    },
  })
  await audit(c.get("identity").user.id, "report.create", item.id)
  return c.json(item, 201)
})
player.get("/servers", async (c) =>
  c.json(
    await db.gameServer.findMany({
      where: { hidden: false },
      select: {
        id: true,
        key: true,
        name: true,
        address: true,
        version: true,
        status: true,
        online: true,
        maxPlayers: true,
        checkedAt: true,
      },
      orderBy: { sort: "asc" },
    })
  )
)
player.get("/servers/:id", async (c) => {
  const item = await db.gameServer.findFirst({
    where: { id: c.req.param("id"), hidden: false },
  })
  if (!item) fail(404, "服务器不存在")
  const { queryHost: _host, queryPort: _port, ...publicItem } = item
  return c.json(publicItem)
})
player.get("/announcements", async (c) => {
  const { page, limit, skip } = paging(c),
    where = { publishedAt: { lte: new Date() } }
  const [items, total] = await Promise.all([
    db.announcement.findMany({
      where,
      select: { id: true, title: true, pinned: true, publishedAt: true },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      skip,
      take: limit,
    }),
    db.announcement.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
player.get("/claims", async (c) => {
  const { page, limit, skip } = paging(c),
    where = { userId: c.get("identity").user.id }
  const [items, total] = await Promise.all([
    db.claim.findMany({
      where,
      include: { identity: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.claim.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
player.post("/claims", async (c) => {
  const input = z
    .object({
      serverKey: z.string(),
      name: characterName,
      evidence: z.string().trim().min(10).max(3000),
    })
    .parse(await c.req.json())
  const userId = c.get("identity").user.id
  const result = await db.$transaction(async (tx) => {
    await identityLock(tx)
    const identity = await tx.legacyIdentity.findUnique({
      where: {
        serverKey_nameKey: {
          serverKey: input.serverKey,
          nameKey: input.name.toLowerCase(),
        },
      },
      include: { character: true },
    })
    if (!identity || identity.character.userId || identity.character.deletedAt)
      fail(409, "该角色无法申请认领，请联系管理员核实")
    if (
      await tx.claim.findFirst({
        where: { userId, identityId: identity.id, status: "pending" },
      })
    )
      fail(409, "已有待处理申请")
    const item = await tx.claim.create({
      data: { userId, identityId: identity.id, evidence: input.evidence },
    })
    await tx.auditLog.create({
      data: { actorId: userId, action: "claim.create", target: item.id },
    })
    return item
  })
  return c.json(result, 201)
})
