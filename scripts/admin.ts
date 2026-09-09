import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"
import { auth } from "../server/auth"
import { db } from "../server/db"
import { secret } from "../server/security"
import { adminArguments, adminEmail } from "./admin-input"

const terminal = createInterface({ input: stdin, output: stdout })
try {
  const args = adminArguments(process.argv.slice(2))
  const email = adminEmail(
    args.email ?? (await terminal.question("Admin email: "))
  )
  const name = args.name
  if (await db.user.findUnique({ where: { email } }))
    throw new Error(
      "Account exists; use an authenticated administrator to change its role"
    )
  const password = secret()
  const ctx = await auth.$context
  const id = crypto.randomUUID()
  await db.user.create({
    data: {
      id,
      email,
      name,
      role: "admin",
      emailVerified: true,
      mustChangePassword: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          providerId: "credential",
          accountId: id,
          password: await ctx.password.hash(password),
        },
      },
    },
  })
  console.log(
    `Administrator created: ${email}\nTemporary password (shown once): ${password}\nChange your password and configure TOTP after signing in.`
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : "管理员创建失败")
  process.exitCode = 1
} finally {
  terminal.close()
  await db.$disconnect()
}
