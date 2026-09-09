import { createAuthClient } from "better-auth/react"
import { passkeyClient } from "@better-auth/passkey/client"

export const authClient = createAuthClient({ plugins: [passkeyClient()] })

export function signInWithPasskey(captchaToken: string) {
  // The plugin's initial options request only inherits client-level headers.
  return createAuthClient({
    plugins: [passkeyClient()],
    fetchOptions: { headers: { "x-captcha-token": captchaToken } },
  }).signIn.passkey()
}

export function requirePasskeySupport() {
  if (!window.isSecureContext || !window.PublicKeyCredential)
    throw new Error(
      "当前浏览器不支持通行密钥，请使用支持的浏览器并通过 HTTPS 访问"
    )
}

export function passkeyError(error: {
  code?: string
  message?: string
  status?: number
}) {
  if (error.code === "CAPTCHA_REQUIRED") return "请完成人机验证后重试"
  if (error.code === "SESSION_NOT_FRESH") return "请重新登录后再添加通行密钥"
  if (error.code === "AUTH_CANCELLED" || error.code?.startsWith("ERROR_"))
    return "通行密钥操作已取消或未完成，请重试"
  return error.message ?? "通行密钥操作失败，请重试"
}
