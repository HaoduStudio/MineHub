import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { env } from "./env"

let privatePem: string
export async function initSigning() {
  try {
    privatePem = await readFile(env.SIGNING_KEY_PATH, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    if (env.NODE_ENV === "production")
      throw new Error("Signing key missing; run keys:init before startup", {
        cause: error,
      })
    await generateSigningKey()
    privatePem = await readFile(env.SIGNING_KEY_PATH, "utf8")
  }
  createPrivateKey(privatePem)
}
export async function generateSigningKey() {
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })
  await mkdir(path.dirname(env.SIGNING_KEY_PATH), { recursive: true })
  await writeFile(env.SIGNING_KEY_PATH, pair.privateKey, {
    flag: "wx",
    mode: 0o600,
  })
}
export const publicKey = () =>
  createPublicKey(privatePem).export({ type: "spki", format: "pem" }).toString()
export const signTexture = (value: string) =>
  sign("RSA-SHA1", Buffer.from(value), privatePem).toString("base64")
