import { z } from "zod"

export function adminArguments(argv: string[]) {
  const args = argv[0] === "--" ? argv.slice(1) : argv
  return { email: args[0], name: args.slice(1).join(" ").trim() || "Admin" }
}

export function adminEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (email.includes("\\@"))
    throw new Error('邮箱中的 @ 不需要转义，请使用 "name@example.com"')
  if (!z.email().safeParse(email).success)
    throw new Error("邮箱格式无效，请使用 name@example.com")
  return email
}
