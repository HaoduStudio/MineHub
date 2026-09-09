import { Hono } from "hono"
import { readFile } from "node:fs/promises"
import { z } from "zod"
import { db, settings } from "../db"
import type { Prisma } from "../generated/prisma/client"
import { auth } from "../auth"
import { administrator, signedIn, requireFresh, type AppEnv } from "../access"
import { audit, fail, paging, secret } from "../security"
import { characterInclude } from "./player"
import {
  commitImport,
  previewImport,
  resolveClaim,
  identityLock,
} from "../migration"
import {
  blockTexture,
  moderateTexture,
  textureInclude,
  texturePath,
} from "../textures"
import { refreshServer } from "../servers"
import { redis } from "../redis"
import { mail } from "../mail"

export const adminApi = new Hono<AppEnv>()
adminApi.use("*", signedIn, administrator)
adminApi.get("/overview", async (c) => {
  const [users, characters, claims, reports] = await Promise.all([
    db.user.count(),
    db.character.count({ where: { deletedAt: null, userId: { not: null } } }),
    db.claim.count({ where: { status: "pending" } }),
    db.report.count({ where: { status: "pending" } }),
  ])
  return c.json({
    users,
    characters,
    claims,
    reports,
    health: {
      database: true,
      redis: redis.isReady,
      smtpConfigured: !!process.env.SMTP_HOST,
    },
  })
})
adminApi.get("/users", async (c) => {
  const { page, limit, skip, q } = paging(c)
  const status = c.req.query("status"),
    role = c.req.query("role")
  const where: Prisma.UserWhereInput = {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ],
    ...(role ? { role } : {}),
    ...(status === "banned"
      ? { banned: true }
      : status === "unverified"
        ? { emailVerified: false, banned: false }
        : status === "active"
          ? { emailVerified: true, banned: false }
          : {}),
  }
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.user.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
adminApi.post("/users", async (c) => {
  requireFresh(c.get("identity"))
  const input = z
    .object({
      name: z.string().trim().min(1).max(64),
      email: z.email().transform((s) => s.toLowerCase()),
    })
    .parse(await c.req.json())
  const password = secret()
  const ctx = await auth.$context
  const hash = await ctx.password.hash(password)
  const user = await db.user.create({
    data: {
      id: crypto.randomUUID(),
      ...input,
      mustChangePassword: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          providerId: "credential",
          accountId: input.email,
          password: hash,
        },
      },
    },
  })
  await db.account.updateMany({
    where: { userId: user.id, providerId: "credential" },
    data: { accountId: user.id },
  })
  await audit(c.get("identity").user.id, "user.create", user.id)
  return c.json({ user, password }, 201)
})
adminApi.get("/users/:id", async (c) => {
  const user = await db.user.findUnique({
    where: { id: c.req.param("id") },
    include: {
      characters: { include: characterInclude },
      sessions: {
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
      },
    },
  })
  if (!user) fail(404, "用户不存在")
  const history = await db.auditLog.findMany({
    where: { OR: [{ actorId: user.id }, { target: user.id }] },
    orderBy: { createdAt: "desc" },
    take: 30,
  })
  return c.json({ ...user, history })
})
const userAction = z.object({
  ids: z.array(z.string()).min(1).max(100),
  action: z.enum(["ban", "unban", "revoke", "role"]),
  role: z.enum(["user", "admin"]).optional(),
  reason: z.string().max(1000).default(""),
})
adminApi.post("/users/actions", async (c) => {
  const identity = c.get("identity")
  requireFresh(identity)
  const input = userAction.parse(await c.req.json())
  if (input.action === "role" && (input.ids.length !== 1 || !input.role))
    fail(400, "请选择用户身份")
  await db.$transaction(async (tx) => {
    await identityLock(tx)
    if (
      input.action === "ban" ||
      (input.action === "role" && input.role === "user")
    ) {
      if (
        (await tx.user.count({
          where: {
            id: { notIn: input.ids },
            role: "admin",
            banned: false,
            twoFactorEnabled: true,
          },
        })) === 0 &&
        (await tx.user.count({
          where: { id: { in: input.ids }, role: "admin" },
        })) > 0
      )
        fail(409, "不能停用最后一个有效管理员")
    }
    await tx.user.updateMany({
      where: { id: { in: input.ids } },
      data:
        input.action === "ban"
          ? {
              banned: true,
              banReason: input.reason || "管理员封禁",
              banExpires: null,
            }
          : input.action === "unban"
            ? { banned: false, banReason: null, banExpires: null }
            : input.action === "role"
              ? { role: input.role }
              : {},
    })
    if (["ban", "revoke", "role"].includes(input.action)) {
      await tx.session.deleteMany({ where: { userId: { in: input.ids } } })
      await tx.gameToken.updateMany({
        where: { userId: { in: input.ids } },
        data: { revokedAt: new Date() },
      })
    }
    if (input.action === "ban")
      await tx.gameCredential.updateMany({
        where: { userId: { in: input.ids } },
        data: { revokedAt: new Date() },
      })
    await tx.auditLog.create({
      data: {
        actorId: identity.user.id,
        action: `user.${input.action}`,
        target: input.ids.join(","),
        details: {
          reason: input.reason,
          ...(input.role ? { role: input.role } : {}),
        },
      },
    })
  })
  return c.json({ success: true })
})
adminApi.get("/characters", async (c) => {
  const { page, limit, skip, q } = paging(c)
  const where: Prisma.CharacterWhereInput = {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { id: { contains: q } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ],
  }
  const [items, total] = await Promise.all([
    db.character.findMany({
      where,
      include: {
        ...characterInclude,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.character.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
adminApi.get("/characters/:id", async (c) => {
  const item = await db.character.findUnique({
    where: { id: c.req.param("id") },
    include: {
      ...characterInclude,
      user: { select: { id: true, name: true, email: true } },
    },
  })
  if (!item) fail(404, "角色不存在")
  return c.json(item)
})
adminApi.patch("/characters/:id", async (c) => {
  const input = z.object({ disabled: z.boolean() }).parse(await c.req.json())
  await db.$transaction(async (tx) => {
    await identityLock(tx)
    const item = await tx.character.findUnique({
      where: { id: c.req.param("id") },
    })
    if (!item || item.deletedAt) fail(409, "角色已删除或不存在")
    await tx.character.update({ where: { id: item.id }, data: input })
    if (input.disabled)
      await tx.gameToken.updateMany({
        where: { characterId: item.id },
        data: { revokedAt: new Date() },
      })
    await tx.auditLog.create({
      data: {
        actorId: c.get("identity").user.id,
        action: input.disabled ? "character.disable" : "character.enable",
        target: item.id,
      },
    })
  })
  return c.json({ success: true })
})
adminApi.get("/imports", async (c) =>
  c.json(
    await db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 30 })
  )
)
adminApi.post("/imports/preview", async (c) =>
  c.json(await previewImport(await c.req.json()))
)
adminApi.post("/imports/commit", async (c) => {
  const { rows, digest } = z
    .object({ rows: z.unknown(), digest: z.string() })
    .parse(await c.req.json())
  return c.json(await commitImport(rows, digest, c.get("identity").user.id))
})
adminApi.get("/claims", async (c) => {
  const { page, limit, skip } = paging(c)
  const where = c.req.query("status") ? { status: c.req.query("status") } : {}
  const [items, total] = await Promise.all([
    db.claim.findMany({
      where,
      include: {
        identity: { include: { character: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.claim.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
adminApi.post("/claims/:id/resolve", async (c) => {
  const input = z
    .object({
      approve: z.boolean(),
      resolution: z.string().trim().min(5).max(2000),
    })
    .parse(await c.req.json())
  return c.json(
    await resolveClaim(
      c.req.param("id"),
      input.approve,
      input.resolution,
      c.get("identity").user.id
    )
  )
})
adminApi.get("/textures", async (c) => {
  const { page, limit, skip, q } = paging(c)
  const status = c.req.query("status")
  const where: Prisma.TextureWhereInput = {
    name: { contains: q, mode: "insensitive" },
    ...(status === "public"
      ? { public: true }
      : status === "private"
        ? { public: false }
        : status === "blocked"
          ? { blob: { blocked: true } }
          : {}),
  }
  const [items, total] = await Promise.all([
    db.texture.findMany({
      where,
      include: textureInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.texture.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
adminApi.post("/textures/:id/moderate", async (c) => {
  const { blocked, reason } = z
    .object({
      blocked: z.boolean(),
      reason: z.string().trim().min(2).max(1000),
    })
    .parse(await c.req.json())
  await blockTexture(
    c.req.param("id"),
    blocked,
    c.get("identity").user.id,
    reason
  )
  return c.json({ success: true })
})
adminApi.get("/textures/:id/preview", async (c) => {
  const texture = await db.texture.findUnique({
    where: { id: c.req.param("id") },
  })
  if (!texture) fail(404, "材质不存在")
  c.header("Content-Type", "image/png")
  c.header("Cache-Control", "no-store")
  return c.body(new Uint8Array(await readFile(texturePath(texture.hash))))
})
adminApi.get("/reports", async (c) => {
  const { page, limit, skip } = paging(c),
    where = c.req.query("status") ? { status: c.req.query("status") } : {}
  const [items, total] = await Promise.all([
    db.report.findMany({
      where,
      include: {
        texture: { include: textureInclude },
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.report.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
adminApi.post("/reports/:id/resolve", async (c) => {
  const { block, resolution } = z
    .object({
      block: z.boolean(),
      resolution: z.string().trim().min(2).max(1000),
    })
    .parse(await c.req.json())
  await db.$transaction(async (tx) => {
    await identityLock(tx)
    const report = await tx.report.findUnique({
      where: { id: c.req.param("id") },
    })
    if (!report || report.status !== "pending") fail(409, "举报已处理或不存在")
    if (block)
      await moderateTexture(
        tx,
        report.textureId,
        true,
        c.get("identity").user.id,
        resolution
      )
    await tx.report.update({
      where: { id: report.id },
      data: {
        status: block ? "removed" : "dismissed",
        resolution,
        reviewerId: c.get("identity").user.id,
        reviewedAt: new Date(),
      },
    })
    await tx.auditLog.create({
      data: {
        actorId: c.get("identity").user.id,
        action: "report.resolve",
        target: report.id,
        details: { resolution, block },
      },
    })
  })
  return c.json({ success: true })
})
const safeLink = z
  .url()
  .refine((v) => {
    try {
      return ["https:", "http:"].includes(new URL(v).protocol)
    } catch {
      return false
    }
  })
const serverInput = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,48}$/),
  name: z.string().trim().min(1).max(64),
  address: z.string().min(1).max(253),
  queryHost: z
    .string()
    .regex(/^[a-zA-Z0-9.:-]+$/)
    .max(253),
  queryPort: z.coerce.number().int().min(1).max(65535),
  version: z.string().max(100).default(""),
  description: z.string().max(3000).default(""),
  rules: z.string().max(10000).default(""),
  downloads: z
    .array(z.object({ name: z.string().min(1).max(100), url: safeLink }))
    .max(20)
    .default([]),
  sort: z.coerce.number().int().default(0),
  hidden: z.boolean().default(false),
})
adminApi.get("/servers", async (c) =>
  c.json(await db.gameServer.findMany({ orderBy: { sort: "asc" } }))
)
adminApi.get("/servers/:id", async (c) =>
  c.json(
    await db.gameServer.findUniqueOrThrow({ where: { id: c.req.param("id") } })
  )
)
adminApi.post("/servers", async (c) => {
  const item = await db.gameServer.create({
    data: serverInput.parse(await c.req.json()),
  })
  await audit(c.get("identity").user.id, "server.create", item.id)
  return c.json(item, 201)
})
adminApi.patch("/servers/:id", async (c) => {
  const data = serverInput.parse(await c.req.json())
  const previous = await db.gameServer.findUniqueOrThrow({
    where: { id: c.req.param("id") },
  })
  if (
    data.key !== previous.key &&
    (await db.legacyIdentity.count({ where: { serverKey: previous.key } }))
  )
    fail(409, "已用于迁移的服务器标识不能修改")
  const item = await db.gameServer.update({ where: { id: previous.id }, data })
  await audit(c.get("identity").user.id, "server.update", item.id)
  return c.json(item)
})
adminApi.post("/servers/:id/check", async (c) =>
  c.json(await refreshServer(c.req.param("id")))
)
adminApi.get("/announcements", async (c) => {
  const { page, limit, skip, q } = paging(c),
    where = { title: { contains: q, mode: "insensitive" as const } }
  const [items, total] = await Promise.all([
    db.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.announcement.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
const announcementInput = z.object({
  title: z.string().trim().min(1).max(150),
  body: z.string().max(50000),
  pinned: z.boolean(),
  published: z.boolean(),
})
adminApi.get("/announcements/:id", async (c) =>
  c.json(
    await db.announcement.findUniqueOrThrow({
      where: { id: c.req.param("id") },
    })
  )
)
adminApi.post("/announcements", async (c) => {
  const { published, ...input } = announcementInput.parse(await c.req.json())
  const item = await db.announcement.create({
    data: { ...input, publishedAt: published ? new Date() : null },
  })
  await audit(c.get("identity").user.id, "announcement.create", item.id)
  return c.json(item, 201)
})
adminApi.patch("/announcements/:id", async (c) => {
  const { published, ...input } = announcementInput.parse(await c.req.json())
  const previous = await db.announcement.findUniqueOrThrow({
    where: { id: c.req.param("id") },
  })
  const item = await db.announcement.update({
    where: { id: previous.id },
    data: {
      ...input,
      publishedAt: published ? (previous.publishedAt ?? new Date()) : null,
    },
  })
  await audit(c.get("identity").user.id, "announcement.update", item.id)
  return c.json(item)
})
adminApi.delete("/announcements/:id", async (c) => {
  await db.announcement.delete({ where: { id: c.req.param("id") } })
  await audit(
    c.get("identity").user.id,
    "announcement.delete",
    c.req.param("id")
  )
  return c.json({ success: true })
})
adminApi.get("/settings", async (c) => c.json(await settings()))
adminApi.patch("/settings", async (c) => {
  const input = z
    .object({
      name: z.string().trim().min(1).max(64),
      description: z.string().max(300),
      registrationOpen: z.boolean(),
      characterLimit: z.number().int().min(1).max(100),
      uploadLimit: z.number().int().min(1).max(10000),
      uploadBytes: z.number().int().min(1024).max(10485760),
      migrationEnabled: z.boolean(),
      migrationReady: z.boolean(),
      maintenanceMessage: z.string().max(500),
      authImageLight: z.union([z.literal(""), safeLink]),
      authImageDark: z.union([z.literal(""), safeLink]),
      authImageCacheMinutes: z.number().int().min(0).max(10080),
    })
    .parse(await c.req.json())
  if (
    input.migrationEnabled &&
    input.migrationReady &&
    !(await db.importBatch.count())
  )
    fail(409, "请先导入旧服身份")
  const result = await db.siteSettings.update({
    where: { id: "site" },
    data: input,
  })
  await audit(c.get("identity").user.id, "settings.update", "site", input)
  return c.json(result)
})
adminApi.post("/mail/check", async (c) => {
  await mail.verify()
  return c.json({ success: true })
})
adminApi.get("/audit", async (c) => {
  const { page, limit, skip, q } = paging(c)
  const from = c.req.query("from"),
    to = c.req.query("to")
  const where: Prisma.AuditLogWhereInput = {
    OR: [{ action: { contains: q } }, { target: { contains: q } }],
    ...(c.req.query("actorId") ? { actorId: c.req.query("actorId") } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: z.coerce.date().parse(from) } : {}),
            ...(to
              ? { lt: new Date(Date.parse(z.iso.date().parse(to)) + 86400000) }
              : {}),
          },
        }
      : {}),
  }
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.auditLog.count({ where }),
  ])
  return c.json({ items, total, page, limit })
})
