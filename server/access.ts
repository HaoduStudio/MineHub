import { createMiddleware } from "hono/factory"
import { auth } from "./auth"
import { db } from "./db"
import { fail } from "./security"

export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>
export type AppEnv = { Variables: { identity: AuthSession } }
export const signedIn = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) fail(401, "请先登录")
  if (!session.user.emailVerified) fail(403, "请先验证邮箱")
  if (
    session.user.banned &&
    (!session.user.banExpires || new Date(session.user.banExpires) > new Date())
  )
    fail(403, "账户已封禁")
  c.set("identity", session)
  if (session.user.mustChangePassword && !c.req.path.includes("/me"))
    fail(403, "请先在账户设置中更换临时密码")
  await next()
})
export const administrator = createMiddleware<AppEnv>(async (c, next) => {
  const identity = c.get("identity")
  if (identity.user.role !== "admin") fail(403, "没有管理权限")
  const session = await db.session.findUnique({
    where: { id: identity.session.id },
  })
  if (!identity.user.twoFactorEnabled || !session?.totpVerifiedAt)
    fail(403, "需要完成管理员两步验证")
  await next()
})
export function requireFresh(identity: AuthSession) {
  if (Date.now() - new Date(identity.session.createdAt).getTime() > 900000)
    fail(403, "请重新登录后执行此操作")
}
