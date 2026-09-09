import "dotenv/config"
import { z } from "zod"
z.config(z.locales.zhCN())

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  BETTER_AUTH_URL: z.url().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:16379"),
  TEXTURE_DIR: z.string().default("./data/textures"),
  AVATAR_DIR: z.string().default("./data/avatars"),
  SIGNING_KEY_PATH: z.string().default("./data/signing.pem"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(11025),
  SMTP_SECURE: z.string().default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("MineHub <noreply@localhost>"),
  TRUST_PROXY: z.string().default("false"),
  SERVER_QUERY_ALLOW_PRIVATE: z.string().default("false"),
})

export const env = schema.parse(process.env)
if (
  env.NODE_ENV === "production" &&
  !env.BETTER_AUTH_URL.startsWith("https://")
) {
  throw new Error("Production requires an HTTPS BETTER_AUTH_URL")
}
