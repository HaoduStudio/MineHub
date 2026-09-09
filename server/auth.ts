import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { admin } from "better-auth/plugins/admin"
import { twoFactor } from "better-auth/plugins/two-factor"
import { passkey } from "@better-auth/passkey"
import { captchaPaths, consumeCaptcha } from "./captcha"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { db, settings } from "./db"
import { env } from "./env"
import { sendMail } from "./mail"
import { audit, revokeGame, sha256 } from "./security"
import { rateLimit } from "./redis"

export const auth = betterAuth({
  appName: "MineHub",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendMail(
        user.email,
        "重置 MineHub 密码",
        `点击链接设置新密码：\n${url}\n如果不是你发起的请求，请忽略此邮件。`
      ),
    onPasswordReset: async ({ user }) => {
      await revokeGame(user.id)
      await db.user.update({
        where: { id: user.id },
        data: { mustChangePassword: false },
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) =>
      sendMail(user.email, "验证 MineHub 邮箱", `点击链接验证邮箱：\n${url}`),
  },
  user: {
    additionalFields: {
      mustChangePassword: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
      featuredCharacterId: { type: "string", required: false, input: false },
      avatarKind: { type: "string", required: false, input: false },
      avatarHash: { type: "string", required: false, input: false },
      avatarTextureId: { type: "string", required: false, input: false },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, url }) =>
        sendMail(user.email, "确认变更邮箱", `点击链接确认变更：\n${url}`),
    },
  },
  session: {
    expiresIn: 604800,
    updateAge: 86400,
    freshAge: 900,
    cookieCache: { enabled: false },
  },
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: env.NODE_ENV === "production",
    ipAddress: {
      ipAddressHeaders: ["x-minehub-client-ip"],
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/two-factor/*": { window: 60, max: 5 },
    },
  },
  plugins: [
    admin(),
    twoFactor({ issuer: "MineHub" }),
    passkey({
      rpID: new URL(env.BETTER_AUTH_URL).hostname,
      rpName: "MineHub",
      origin: new URL(env.BETTER_AUTH_URL).origin,
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "required",
      },
      authentication: {
        afterVerification: async ({ verification }) => {
          if (!verification.authenticationInfo.userVerified)
            throw new APIError("UNAUTHORIZED", {
              message: "请使用设备 PIN、指纹或面容完成验证",
            })
        },
      },
    }),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const captchaScope = captchaPaths[ctx.path]
      if (
        captchaScope &&
        !(await consumeCaptcha(
          ctx.headers?.get("x-captcha-token"),
          captchaScope
        ))
      )
        throw new APIError("FORBIDDEN", {
          code: "CAPTCHA_REQUIRED",
          message: "请完成人机验证后重试",
        })
      if (
        [
          "/sign-in/email",
          "/request-password-reset",
          "/send-verification-email",
        ].includes(ctx.path) &&
        typeof ctx.body?.email === "string"
      ) {
        if (
          !(await rateLimit(
            `web-account:${ctx.path}:${sha256(ctx.body.email.trim().toLowerCase())}`,
            10,
            60
          ))
        )
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "请求过于频繁，请稍后重试",
          })
      }
      if (ctx.path === "/sign-up/email" && !(await settings()).registrationOpen)
        throw new APIError("FORBIDDEN", { message: "注册暂未开放" })
      if (ctx.path.startsWith("/admin/") || ctx.path === "/delete-user")
        throw new APIError("FORBIDDEN", {
          message: "请通过 MineHub 管理接口操作",
        })
      if (
        ctx.path === "/two-factor/disable" ||
        ctx.path === "/two-factor/enable"
      ) {
        const session = await auth.api.getSession({ headers: ctx.headers! })
        if (session?.user.role === "admin" && session.user.twoFactorEnabled)
          throw new APIError("FORBIDDEN", {
            message: "管理员不能重置或关闭两步验证，请使用恢复码",
          })
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/passkey/generate-authenticate-options") {
        const options = ctx.context.returned as
          | { userVerification?: string }
          | undefined
        if (options && !(options instanceof APIError))
          options.userVerification = "required"
      }
      const returned = ctx.context.returned as
        | { token?: string; user?: { id: string }; status?: boolean }
        | undefined
      if (
        ["/two-factor/verify-totp", "/two-factor/verify-backup-code"].includes(
          ctx.path
        ) &&
        returned?.token &&
        returned.user
      ) {
        const sessionId = ctx.context.newSession?.session.id
        await db.session.updateMany({
          where: sessionId
            ? { id: sessionId, userId: returned.user.id }
            : { token: returned.token, userId: returned.user.id },
          data: { totpVerifiedAt: new Date() },
        })
      }
      if (
        ctx.path === "/change-password" &&
        returned &&
        !("code" in returned)
      ) {
        const session = ctx.context.session
        if (session) {
          await revokeGame(session.user.id)
          await db.user.update({
            where: { id: session.user.id },
            data: { mustChangePassword: false },
          })
          await audit(session.user.id, "account.password", session.user.id)
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      update: {
        after: async (user, context) => {
          if (context?.path === "/verify-email") await revokeGame(user.id)
        },
      },
    },
  },
})
