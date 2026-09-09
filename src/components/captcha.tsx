import { createElement, useState } from "react"
import "@/lib/captcha-config"
import "cap-widget"
import type { CapSolveEvent } from "cap-widget"

export function Captcha({
  scope,
  onToken,
}: {
  scope: string
  onToken: (token: string) => void
}) {
  const [error, setError] = useState(false)
  return (
    <div className="form-stack items-center">
      {createElement("cap-widget", {
        "data-cap-api-endpoint": `/api/captcha/${scope}/`,
        "data-cap-hidden-field-name": "",
        "data-cap-i18n-initial-state": "人机验证",
        "data-cap-i18n-verifying-label": "正在验证…",
        "data-cap-i18n-solved-label": "验证完成",
        "data-cap-i18n-error-label": "验证失败，请重试",
        "data-cap-i18n-verify-aria-label": "完成人机验证",
        "data-cap-i18n-verified-aria-label": "人机验证已完成",
        onsolve: (event: CapSolveEvent) => {
          setError(false)
          onToken(event.detail.token)
        },
        onreset: () => onToken(""),
        onerror: () => {
          onToken("")
          setError(true)
        },
        style: { "--cap-widget-width": "100%", width: "100%" },
      })}
      {error && (
        <p role="alert" className="form-error">
          验证暂不可用，请点击验证码重试
        </p>
      )}
    </div>
  )
}
