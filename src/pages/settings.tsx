import { useState } from "react"
import {
  Link,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { LauncherConnect } from "@/components/launcher-connect"
import {
  Heading,
  TabsNav,
  ActionForm,
  InputField,
  Confirm,
  CopyButton,
  Empty,
  Loading,
  Failure,
  date,
  Modal,
  notify,
} from "@/components/common"
import { authRequest, mutate, useData, refresh, type Me } from "@/lib/api"

export default function SettingsPage() {
  const me = useOutletContext<Me>(),
    [params] = useSearchParams(),
    tab = params.get("tab") ?? "profile"
  return (
    <>
      <Heading title="账户设置" />
      <TabsNav
        tabs={[
          { label: "个人资料", value: "profile" },
          { label: "网站安全", value: "security" },
          { label: "游戏登录", value: "game" },
          { label: "会话管理", value: "sessions" },
        ]}
      />
      {tab === "profile" ? (
        <ProfileSettings me={me} />
      ) : tab === "security" ? (
        <SecuritySettings me={me} />
      ) : tab === "game" ? (
        <GameSettings />
      ) : (
        <Sessions />
      )}
    </>
  )
}
function ProfileSettings({ me }: { me: Me }) {
  const navigate = useNavigate(),
    [deleting, setDeleting] = useState(false)
  return (
    <>
      <section className="form-section">
        <h2>个人资料</h2>
        <ActionForm
          onSubmit={async (data) => {
            await authRequest("/update-user", { name: data.get("name") })
            await refresh()
          }}
        >
          <InputField
            name="name"
            label="昵称"
            defaultValue={me.user.name}
            required
            maxLength={64}
          />
        </ActionForm>
      </section>
      <section className="form-section">
        <h2>邮箱</h2>
        <ActionForm
          label="发送验证邮件"
          onSubmit={async (data) => {
            await authRequest("/change-email", {
              newEmail: data.get("email"),
              callbackURL: "/app/settings",
            })
            notify("请检查当前邮箱中的确认邮件")
          }}
        >
          <InputField
            label="新邮箱"
            type="email"
            name="email"
            placeholder={me.user.email}
            required
          />
        </ActionForm>
      </section>
      <section className="form-section">
        <h2>删除账户</h2>
        <p className="form-hint mb-4">
          删除后无法登录，角色身份将保留为停用状态
        </p>
        <Button variant="destructive-outline" onClick={() => setDeleting(true)}>
          删除账户
        </Button>
      </section>
      <Modal
        title="删除账户"
        open={deleting}
        onOpenChange={setDeleting}
        description="此操作无法撤销"
      >
        <ActionForm
          danger
          label="删除账户"
          onSubmit={async (data) => {
            await mutate("/me/delete", "POST", {
              password: data.get("password"),
            })
            await refresh()
            void navigate("/login")
          }}
        >
          <InputField
            label="当前密码"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </ActionForm>
      </Modal>
    </>
  )
}
function SecuritySettings({ me }: { me: Me }) {
  const [codes, setCodes] = useState<string[]>([])
  return (
    <>
      <section className="form-section">
        <h2>修改密码</h2>
        {me.user.mustChangePassword && (
          <p className="form-hint mb-5">请先更换临时密码，再继续使用</p>
        )}
        <ActionForm
          onSubmit={async (data) => {
            if (data.get("newPassword") !== data.get("confirm"))
              throw new Error("两次输入的密码不一致")
            await authRequest("/change-password", {
              currentPassword: data.get("currentPassword"),
              newPassword: data.get("newPassword"),
              revokeOtherSessions: true,
            })
            await refresh()
          }}
        >
          <InputField
            label="当前密码"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <InputField
            label="新密码"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
          <InputField
            label="确认新密码"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </ActionForm>
      </section>
      <section className="form-section">
        <h2>两步验证</h2>
        {me.user.twoFactorEnabled ? (
          <>
            <p className="muted mb-5">已启用</p>
            <ActionForm
              label="重新生成恢复码"
              onSubmit={async (data) => {
                const result = await authRequest<{ backupCodes: string[] }>(
                  "/two-factor/generate-backup-codes",
                  { password: data.get("password") }
                )
                setCodes(result.backupCodes)
              }}
            >
              <InputField
                label="当前密码"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </ActionForm>
            {codes.length > 0 && (
              <div className="form-stack mt-5">
                <div className="code-box">{codes.join("\n")}</div>
                <CopyButton value={codes.join("\n")} label="复制恢复码" />
              </div>
            )}
            {me.user.role !== "admin" && (
              <div className="mt-8">
                <ActionForm
                  danger
                  label="关闭两步验证"
                  onSubmit={async (data) => {
                    await authRequest("/two-factor/disable", {
                      password: data.get("password"),
                    })
                    await refresh()
                  }}
                >
                  <InputField
                    label="当前密码"
                    name="password"
                    type="password"
                    required
                  />
                </ActionForm>
              </div>
            )}
          </>
        ) : (
          <Button render={<Link to="/two-factor?setup=1" />}>
            启用两步验证
          </Button>
        )}
      </section>
    </>
  )
}
function GameSettings() {
  const { data, isPending, error, refetch } = useData<
    {
      id: string
      name: string
      createdAt: string
      lastUsedAt: string | null
    }[]
  >("/credentials")
  const [password, setPassword] = useState(""),
    [open, setOpen] = useState(false)
  return (
    <>
      <section className="form-section">
        <h2>认证地址</h2>
        <LauncherConnect />
        <p className="form-hint mt-3">使用邮箱和游戏密码登录</p>
      </section>
      <section className="form-section">
        <div className="section-head">
          <h2>游戏密码</h2>
          <Button
            onClick={() => {
              setPassword("")
              setOpen(true)
            }}
          >
            生成密码
          </Button>
        </div>
        {isPending ? (
          <Loading />
        ) : error ? (
          <Failure error={error} retry={() => void refetch()} />
        ) : data?.length ? (
          data.map((item) => (
            <div className="inline-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p className="form-hint">最近使用 {date(item.lastUsedAt)}</p>
              </div>
              <Confirm
                title="撤销"
                description="使用此密码的游戏会话将同时失效"
                action={async () => {
                  await mutate(`/credentials/${item.id}`, "DELETE")
                  await refresh()
                }}
              />
            </div>
          ))
        ) : (
          <Empty text="还没有游戏密码" />
        )}
      </section>
      <Modal
        title={password ? "保存游戏密码" : "生成游戏密码"}
        description={password ? "密码仅显示一次，请立即保存" : undefined}
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setPassword("")
        }}
      >
        {password ? (
          <div className="form-stack">
            <div className="code-box">{password}</div>
            <CopyButton value={password} label="复制密码" />
            <Button
              onClick={() => {
                setOpen(false)
                setPassword("")
              }}
            >
              已保存
            </Button>
          </div>
        ) : (
          <ActionForm
            label="生成"
            onSubmit={async (data) => {
              const result = await mutate<{ password: string }>(
                "/credentials",
                "POST",
                { name: data.get("name") }
              )
              setPassword(result.password)
              await refresh()
            }}
          >
            <InputField
              label="名称"
              name="name"
              placeholder="例如：家用电脑"
              required
              maxLength={64}
            />
          </ActionForm>
        )}
      </Modal>
    </>
  )
}
function Sessions() {
  const web = useQuery({
    queryKey: ["web-sessions"],
    queryFn: () =>
      authRequest<
        {
          id: string
          token: string
          userAgent: string | null
          ipAddress: string | null
          createdAt: string
        }[]
      >("/list-sessions"),
  })
  const game = useData<
    {
      id: string
      credential: { name: string }
      character: { name: string } | null
      createdAt: string
    }[]
  >("/game-sessions")
  return (
    <>
      <section className="form-section">
        <div className="section-head">
          <h2>网页会话</h2>
          <Confirm
            title="撤销其他会话"
            description="其他设备需要重新登录"
            action={async () => {
              await authRequest("/revoke-other-sessions", {})
              await refresh()
            }}
          />
        </div>
        {web.isPending ? (
          <Loading />
        ) : web.error ? (
          <Failure error={web.error} />
        ) : (
          web.data?.map((session) => (
            <div className="inline-row" key={session.id}>
              <div className="min-w-0">
                <p className="max-w-sm truncate">
                  {session.userAgent ?? "浏览器"}
                </p>
                <p className="form-hint">
                  {session.ipAddress ?? ""} · {date(session.createdAt)}
                </p>
              </div>
              <Confirm
                title="撤销"
                description="该设备需要重新登录"
                action={async () => {
                  await authRequest("/revoke-session", { token: session.token })
                  await refresh()
                }}
              />
            </div>
          ))
        )}
      </section>
      <section className="form-section">
        <div className="section-head">
          <h2>游戏会话</h2>
          <Confirm
            title="全部撤销"
            description="启动器需要重新登录"
            action={async () => {
              await mutate("/game-sessions/all", "DELETE")
              await refresh()
            }}
          />
        </div>
        {game.isPending ? (
          <Loading />
        ) : game.error ? (
          <Failure error={game.error} />
        ) : game.data?.length ? (
          game.data.map((session) => (
            <div className="inline-row" key={session.id}>
              <div>
                <strong>{session.character?.name ?? "未选择角色"}</strong>
                <p className="form-hint">
                  {session.credential.name} · {date(session.createdAt)}
                </p>
              </div>
              <Confirm
                title="撤销"
                description="此游戏会话将失效"
                action={async () => {
                  await mutate(`/game-sessions/${session.id}`, "DELETE")
                  await refresh()
                }}
              />
            </div>
          ))
        ) : (
          <Empty text="没有活跃的游戏会话" />
        )}
      </section>
    </>
  )
}
