import { db } from "./db"
import type { Prisma } from "./generated/prisma/client"
import { parseManifest } from "./domain"
import { fail } from "./security"
import { ZodError } from "zod"

export async function identityLock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(73489210)`
}
async function inspect(
  tx: Prisma.TransactionClient,
  manifest: ReturnType<typeof parseManifest>
) {
  const issues = [...manifest.issues]
  const existing = await tx.character.findMany({
    where: {
      OR: [
        { id: { in: manifest.rows.map((r) => r.uuid) } },
        { nameKey: { in: manifest.rows.map((r) => r.nameKey) } },
      ],
    },
  })
  const serverKeys = new Set(
    (await tx.gameServer.findMany({ select: { key: true } })).map((s) => s.key)
  )
  const reserved = await tx.legacyIdentity.findMany({
    where: { nameKey: { in: manifest.rows.map((r) => r.nameKey) } },
  })
  for (const [index, row] of manifest.rows.entries()) {
    if (
      reserved.some(
        (r) => r.nameKey === row.nameKey && r.characterId !== row.uuid
      )
    )
      issues.push({ row: index + 1, message: "与已保留的旧服名称冲突" })
    if (!serverKeys.has(row.serverKey))
      issues.push({ row: index + 1, message: "来源服务器不存在" })
    const match = existing.find(
      (c) => c.id === row.uuid || c.nameKey === row.nameKey
    )
    if (
      match &&
      (match.id !== row.uuid || match.name !== row.name || match.deletedAt)
    )
      issues.push({ row: index + 1, message: "与现有角色身份冲突" })
  }
  return issues
}
export async function previewImport(input: unknown) {
  let manifest: ReturnType<typeof parseManifest>
  try {
    manifest = parseManifest(input)
  } catch (error) {
    if (!(error instanceof ZodError)) throw error
    return {
      count: Array.isArray(input) ? input.length : 0,
      digest: "",
      rows: [],
      issues: error.issues.map((issue) => ({
        row: typeof issue.path[0] === "number" ? issue.path[0] + 1 : 0,
        message: `${issue.path.slice(1).join(".") || "清单"}：${issue.message}`,
      })),
    }
  }
  const issues = await db.$transaction((tx) => inspect(tx, manifest))
  return {
    count: manifest.rows.length,
    digest: manifest.digest,
    issues,
    rows: manifest.rows.slice(0, 100),
  }
}
export async function commitImport(
  input: unknown,
  digest: string,
  actorId: string
) {
  const manifest = parseManifest(input)
  if (manifest.digest !== digest) fail(409, "导入内容已变化，请重新检查")
  return db.$transaction(
    async (tx) => {
      await identityLock(tx)
      const previous = await tx.importBatch.findUnique({ where: { digest } })
      if (previous) return previous
      const issues = await inspect(tx, manifest)
      if (issues.length)
        fail(409, issues.map((i) => `第 ${i.row} 条：${i.message}`).join("；"))
      for (const row of manifest.rows) {
        await tx.character.upsert({
          where: { id: row.uuid },
          create: { id: row.uuid, name: row.name, nameKey: row.nameKey },
          update: {},
        })
        await tx.legacyIdentity.upsert({
          where: {
            serverKey_nameKey: {
              serverKey: row.serverKey,
              nameKey: row.nameKey,
            },
          },
          create: {
            serverKey: row.serverKey,
            originalName: row.name,
            nameKey: row.nameKey,
            characterId: row.uuid,
          },
          update: {},
        })
      }
      const batch = await tx.importBatch.create({
        data: { digest, actorId, count: manifest.rows.length },
      })
      await tx.auditLog.create({
        data: {
          actorId,
          action: "migration.import",
          target: batch.id,
          details: { count: batch.count },
        },
      })
      return batch
    },
    { timeout: 120000 }
  )
}
export async function resolveClaim(
  id: string,
  approve: boolean,
  resolution: string,
  actorId: string
) {
  return db.$transaction(async (tx) => {
    await identityLock(tx)
    const claim = await tx.claim.findUnique({
      where: { id },
      include: { identity: { include: { character: true } }, user: true },
    })
    if (!claim || claim.status !== "pending") fail(409, "申请已处理或不存在")
    if (approve) {
      if (
        !claim.user.emailVerified ||
        claim.user.banned ||
        claim.identity.character.deletedAt
      )
        fail(409, "账户或角色状态不允许认领")
      const updated = await tx.character.updateMany({
        where: {
          id: claim.identity.characterId,
          userId: null,
          deletedAt: null,
        },
        data: { userId: claim.userId },
      })
      if (updated.count !== 1) fail(409, "角色已经分配")
      const sources = await tx.legacyIdentity.findMany({
        where: { characterId: claim.identity.characterId },
        select: { id: true },
      })
      await tx.claim.updateMany({
        where: {
          id: { not: id },
          identityId: { in: sources.map((s) => s.id) },
          status: "pending",
        },
        data: {
          status: "rejected",
          resolution: "该角色已完成归属核实",
          reviewerId: actorId,
          reviewedAt: new Date(),
        },
      })
    }
    const result = await tx.claim.update({
      where: { id },
      data: {
        status: approve ? "approved" : "rejected",
        resolution,
        reviewerId: actorId,
        reviewedAt: new Date(),
      },
    })
    await tx.auditLog.create({
      data: {
        actorId,
        action: approve ? "claim.approve" : "claim.reject",
        target: id,
        details: { resolution },
      },
    })
    return result
  })
}
