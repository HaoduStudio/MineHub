import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated/prisma/client"
import { env } from "./env"

export const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  }),
})
export const settings = () =>
  db.siteSettings.upsert({ where: { id: "site" }, create: {}, update: {} })
