import { mkdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { db, settings } from "./db"
import { env } from "./env"
import { isTextureSize } from "./domain"
import { fail, sha256 } from "./security"
import { identityLock } from "./migration"
import type { Prisma } from "./generated/prisma/client"

export const textureInclude = {
  user: { select: { id: true, name: true } },
  blob: true,
  _count: { select: { favorites: true } },
} as const
export const texturePath = (hash: string) => path.join(env.TEXTURE_DIR, hash)
export async function sanitizeTexture(bytes: Buffer, kind: string) {
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    fail(400, "请选择 PNG 图片")
  const image = sharp(bytes, { limitInputPixels: 4096, animated: false })
  const metadata = await image
    .metadata()
    .catch(() => fail(400, "PNG 图片损坏或尺寸超限"))
  if (
    metadata.format !== "png" ||
    (metadata.pages ?? 1) > 1 ||
    !isTextureSize(kind, metadata.width ?? 0, metadata.height ?? 0)
  )
    fail(400, "皮肤需要 64×64 或 64×32，披风需要 64×32")
  return {
    bytes: await image
      .png()
      .toBuffer()
      .catch(() => fail(400, "PNG 图片损坏")),
    width: metadata.width!,
    height: metadata.height!,
  }
}
export async function uploadTexture(
  file: File,
  name: string,
  kind: "skin" | "cape",
  model: "default" | "slim",
  isPublic: boolean,
  userId: string
) {
  const config = await settings()
  if (file.size > config.uploadBytes) fail(400, "图片超过上传大小限制")
  const result = await sanitizeTexture(
    Buffer.from(await file.arrayBuffer()),
    kind
  )
  const hash = sha256(result.bytes)
  await mkdir(env.TEXTURE_DIR, { recursive: true })
  await writeFile(texturePath(hash), result.bytes, { flag: "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
    }
  )
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
    if (
      (await tx.texture.count({ where: { userId, removedAt: null } })) >=
      config.uploadLimit
    )
      fail(409, "已达到上传数量限制")
    const blob = await tx.textureBlob.upsert({
      where: { hash },
      create: {
        hash,
        width: result.width,
        height: result.height,
        bytes: result.bytes.length,
      },
      update: {},
    })
    if (blob.blocked) fail(403, "该材质已被下架")
    const texture = await tx.texture.create({
      data: {
        userId,
        hash,
        name,
        kind,
        model: kind === "cape" || result.height === 32 ? "default" : model,
        public: isPublic,
      },
      include: textureInclude,
    })
    await tx.auditLog.create({
      data: { actorId: userId, action: "texture.upload", target: texture.id },
    })
    return texture
  })
}
export async function blockTexture(
  id: string,
  blocked: boolean,
  actorId: string,
  reason: string
) {
  return db.$transaction(async (tx) => {
    await identityLock(tx)
    await moderateTexture(tx, id, blocked, actorId, reason)
  })
}
export async function moderateTexture(
  tx: Prisma.TransactionClient,
  id: string,
  blocked: boolean,
  actorId: string,
  reason: string
) {
  const texture = await tx.texture.findUnique({ where: { id } })
  if (!texture) fail(404, "材质不存在")
  await tx.textureBlob.update({
    where: { hash: texture.hash },
    data: { blocked },
  })
  if (blocked) {
    const ids = (
      await tx.texture.findMany({
        where: { hash: texture.hash },
        select: { id: true },
      })
    ).map((t) => t.id)
    await tx.character.updateMany({
      where: { skinId: { in: ids } },
      data: { skinId: null },
    })
    await tx.character.updateMany({
      where: { capeId: { in: ids } },
      data: { capeId: null },
    })
  }
  await tx.auditLog.create({
    data: {
      actorId,
      action: blocked ? "texture.block" : "texture.restore",
      target: id,
      details: { reason },
    },
  })
}
export async function readTexture(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) fail(404, "材质不存在")
  const blob = await db.textureBlob.findUnique({ where: { hash } })
  if (!blob || blob.blocked) fail(404, "材质不存在")
  return readFile(texturePath(hash))
}
