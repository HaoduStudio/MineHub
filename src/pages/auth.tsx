import { useState, type ReactNode } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { CheckCircle2, Mail } from "lucide-react"
import { Brand, SiteFooter } from "@/components/layout"
import { useDark } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { OTPField, OTPFieldInput } from "@/components/ui/otp-field"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputField,
  ActionForm,
  CopyButton,
  errorMessage,
  Failure,
  Loading,
  formText,
} from "@/components/common"
import {
  authRequest,
  refresh,
  useData,
  api,
  queryClient,
  ApiError,
  type Config,
  type Me,
} from "@/lib/api"

export function Entry() {
  const session = useData<Me>("/me")
  if (session.isPending) return <Loading />
  if (
    session.error &&
    !(session.error instanceof ApiError && session.error.status === 401)
  )
    return (
      <Failure error={session.error} retry={() => void session.refetch()} />
    )
  return <Navigate to={session.data ? "/app" : "/login"} replace />
}
function AuthShell({ children }: { children: ReactNode }) {
  const { data: config } = useData<Config>("/public/settings")
  const image = useDark() ? config?.authImageDark : config?.authImageLight
  return (
    <div className="auth-page">
      <div className="auth-art">
        {image && <img src={image} alt="" />}
        <div className="auth-art-scrim" />
        <div className="auth-art-caption">
          <strong>{config?.name || "MineHub"}</strong>
          {config?.description && <p>{config.description}</p>}
        </div>
      </div>
      <div className="auth-main">
        <div className="auth-body">{children}</div>
        <SiteFooter config={config} />
      </div>
    </div>
  )
}
export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset" | "verify"
}) {
  const navigate = useNavigate(),
    [params] = useSearchParams(),
    [sent, setSent] = useState(false),
    [email, setEmail] = useState(params.get("email") ?? "")
  const { data: config } = useData<Config>("/public/settings")
  const titles = {
    login: "登录",
    register: "创建账户",
    forgot: "找回密码",
    reset: "设置新密码",
    verify: "验证邮箱",
  }
  return (
    <AuthShell>
      <div className="auth-card">
        <Brand />
        <h1>{titles[mode]}</h1>
        {params.get("error") && (
          <p className="form-error mb-5">链接已失效，请重新申请</p>
        )}
        {sent ? (
          <div className="form-stack items-center text-center">
            <Mail className="size-8" />
            <p>邮件已发送，请检查收件箱</p>
            <p className="muted text-sm">{email}</p>
            <Link to="/login">返回登录</Link>
          </div>
        ) : mode === "register" && config && !config.registrationOpen ? (
          <p className="muted text-center">注册暂未开放</p>
        ) : (
          <ActionForm
            success={false}
            label={
              mode === "verify"
                ? "重新发送"
                : mode === "forgot"
                  ? "发送重置邮件"
                  : mode === "reset"
                    ? "更新密码"
                    : mode === "register"
                      ? "注册"
                      : "登录"
            }
            onSubmit={async (form) => {
              const password = formText(form, "password"),
                address = formText(form, "email", email)
              if (mode === "login") {
                const response = await authRequest("/sign-in/email", {
                  email: address,
                  password,
                })
                await refresh()
                void navigate(
                  response.twoFactorRedirect ? "/two-factor" : "/app"
                )
              }
              if (mode === "register") {
                await authRequest("/sign-up/email", {
                  name: form.get("name"),
                  email: address,
                  password,
                  callbackURL: "/login?verified=1",
                })
                void navigate(
                  `/verify-email?email=${encodeURIComponent(address)}`
                )
              }
              if (mode === "forgot") {
                await authRequest("/request-password-reset", {
                  email: address,
                  redirectTo: `${location.origin}/reset-password`,
                })
                setEmail(address)
                setSent(true)
              }
              if (mode === "verify") {
                await authRequest("/send-verification-email", {
                  email: address,
                  callbackURL: "/login?verified=1",
                })
                setSent(true)
              }
              if (mode === "reset") {
                if (password !== form.get("confirm"))
                  throw new Error("两次输入的密码不一致")
                await authRequest("/reset-password", {
                  newPassword: password,
                  token: params.get("token"),
                })
                void navigate("/login")
              }
            }}
          >
            {mode === "verify" ? (
              <>
                <p className="muted text-center">
                  打开验证邮件中的链接完成验证
                </p>
                <InputField
                  label="邮箱"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </>
            ) : (
              <>
                {mode === "register" && (
                  <InputField
                    label="昵称"
                    name="name"
                    autoComplete="nickname"
                    required
                    maxLength={64}
                  />
                )}
                {mode !== "reset" && (
                  <InputField
                    label="邮箱"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                )}
                {["login", "register", "reset"].includes(mode) && (
                  <InputField
                    label={mode === "reset" ? "新密码" : "密码"}
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? undefined : 12}
                    maxLength={128}
                    required
                  />
                )}
                {mode === "register" && (
                  <p className="form-hint">密码至少 12 位</p>
                )}
                {mode === "reset" && (
                  <InputField
                    label="确认新密码"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                  />
                )}
              </>
            )}
          </ActionForm>
        )}
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <Link to="/forgot-password">忘记密码</Link>
              <Link to="/register">创建账户</Link>
            </>
          ) : (
            <Link to="/login">返回登录</Link>
          )}
        </div>
        {params.get("verified") && (
          <p className="muted mt-6 text-center">邮箱验证完成，可以登录了</p>
        )}
      </div>
    </AuthShell>
  )
}
export function TwoFactorPage() {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    setup = params.get("setup") === "1"
  const { data: me } = useData<Me>("/me", setup)
  const [backup, setBackup] = useState(false),
    [qr, setQr] = useState(""),
    [setupKey, setSetupKey] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [verified, setVerified] = useState(false)
  return (
    <AuthShell>
      <div className="auth-card">
        <Brand />
        <h1>{setup ? "设置两步验证" : "两步验证"}</h1>
        {verified ? (
          <div className="form-stack">
            <CheckCircle2 className="mx-auto size-8" />
            <p className="text-center">两步验证已启用</p>
            <p className="form-hint">保存恢复码，每个恢复码只能使用一次</p>
            <div className="code-box grid grid-cols-2 gap-2">
              {codes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <CopyButton value={codes.join("\n")} label="复制恢复码" />
            <Button
              onClick={() =>
                navigate(
                  me?.user.role === "admin"
                    ? "/admin"
                    : "/app/settings?tab=security"
                )
              }
            >
              已保存，继续
            </Button>
          </div>
        ) : setup && !qr ? (
          <ActionForm
            success={false}
            label="生成验证二维码"
            onSubmit={async (form) => {
              const response = await authRequest<{
                totpURI: string
                backupCodes: string[]
              }>("/two-factor/enable", { password: form.get("password") })
              const { toDataURL } = await import("qrcode")
              setQr(await toDataURL(response.totpURI))
              setSetupKey(
                new URL(response.totpURI).searchParams.get("secret") ?? ""
              )
              setCodes(response.backupCodes)
            }}
          >
            {me?.user.role === "admin" && (
              <p className="form-hint">管理员需要启用两步验证</p>
            )}
            <InputField
              label="当前密码"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </ActionForm>
        ) : (
          <ActionForm
            success={false}
            label="验证"
            onSubmit={async (form) => {
              await authRequest(
                backup
                  ? "/two-factor/verify-backup-code"
                  : "/two-factor/verify-totp",
                { code: form.get("code"), trustDevice: false }
              )
              await refresh()
              await queryClient.fetchQuery({
                queryKey: ["/me"],
                queryFn: () => api<Me>("/me"),
              })
              if (setup) setVerified(true)
              else void navigate(params.get("stepup") ? "/admin" : "/app")
            }}
          >
            {qr && (
              <>
                <img
                  className="mx-auto size-48"
                  src={qr}
                  alt="使用验证器扫描二维码"
                />
                <p className="form-hint text-center">
                  使用验证器扫描二维码，然后输入验证码
                </p>
                {setupKey && (
                  <>
                    <CopyButton value={setupKey} label="复制一次性代码" />
                    <p className="form-hint text-center">
                      无法扫码？复制设置密钥，在验证器中手动添加账户
                    </p>
                    <code className="text-center text-sm break-all select-all">
                      {setupKey}
                    </code>
                  </>
                )}
              </>
            )}
            {backup ? (
              <InputField
                key="backup"
                label="恢复码"
                name="code"
                required
                autoFocus
                autoComplete="off"
              />
            ) : (
              <Field key="totp" className="items-center">
                <FieldLabel>验证码</FieldLabel>
                <OTPField name="code" length={6} required autoFocus>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <OTPFieldInput
                      key={index}
                      aria-label={`第 ${index + 1} 位验证码`}
                    />
                  ))}
                </OTPField>
              </Field>
            )}
          </ActionForm>
        )}
        {!setup && (
          <Button
            className="mt-5 w-full"
            variant="ghost"
            onClick={() => setBackup(!backup)}
          >
            {backup ? "使用验证码" : "使用恢复码"}
          </Button>
        )}
        <Link to="/app" className="muted mt-6 block text-center text-sm">
          返回
        </Link>
      </div>
    </AuthShell>
  )
}
export function ErrorPage({ status = 404 }: { status?: number }) {
  return (
    <AuthShell>
      <div className="auth-card">
        <Brand />
        <h1>{status}</h1>
        <p className="muted my-5 text-center">
          {status === 403 ? "没有访问权限" : "页面不存在"}
        </p>
        <Button className="w-full" render={<Link to="/app" />}>
          返回概览
        </Button>
      </div>
    </AuthShell>
  )
}
export function RouteError({ error }: { error: unknown }) {
  return (
    <AuthShell>
      <div className="auth-card">
        <p className="text-center">{errorMessage(error)}</p>
        <Button className="mt-5 w-full" onClick={() => location.reload()}>
          重新加载
        </Button>
      </div>
    </AuthShell>
  )
}
