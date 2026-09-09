import { mkdir, writeFile, readFile, unlink } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { db } from "./db"
import { env } from "./env"
import { fail, sha256 } from "./security"

export const AVATAR_BYTES = 4 * 1024 * 1024
export const avatarPath = (hash: string) => path.join(env.AVATAR_DIR, hash)
export async function sanitizeAvatar(bytes: Buffer) {
  const image = sharp(bytes, { limitInputPixels: 4096 * 4096, animated: false })
  const metadata = await image.metadata().catch(() => fail(400, "头像图片损坏"))
  if (!["png", "jpeg", "webp"].includes(metadata.format ?? ""))
    fail(400, "请选择 PNG、JPG 或 WebP 图片")
  return {
    bytes: await image
      .resize(256, 256, { fit: "cover", position: "centre" })
      .png()
      .toBuffer()
      .catch(() => fail(400, "头像图片损坏")),
  }
}
export async function saveAvatar(bytes: Buffer) {
  const hash = sha256(bytes)
  await mkdir(env.AVATAR_DIR, { recursive: true })
  await writeFile(avatarPath(hash), bytes, { flag: "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
    }
  )
  return hash
}
export async function readAvatar(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) fail(404, "头像不存在")
  return readFile(avatarPath(hash)).catch(() => fail(404, "头像不存在"))
}
export async function unlinkAvatarIfUnused(hash: string) {
  if ((await db.user.count({ where: { avatarHash: hash } })) > 0) return
  await unlink(avatarPath(hash)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
  })
}
