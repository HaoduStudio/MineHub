import { useState, type ReactNode } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import {
  MoreVertical,
  Plus,
  Shield,
  UsersRound,
  UserRound,
  Flag,
  ArrowUpRight,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "@/components/ui/menu"
import { SkinHead, TextureThumbnail } from "@/components/skin-preview"
import {
  Heading,
  Empty,
  Loading,
  Failure,
  Modal,
  ActionForm,
  InputField,
  CopyButton,
  Confirm,
  TabsNav,
  Filter,
  SearchBox,
  Pagination,
  Status,
  SelectBox,
  date,
  errorMessage,
} from "@/components/common"
import {
  useData,
  mutate,
  refresh,
  type User,
  type Character,
  type Texture,
  type Page,
  type GameServer,
  type Announcement,
  type Claim,
  type Report,
  type Config,
  type Audit,
} from "@/lib/api"

function DataTable({
  columns,
  children,
}: {
  columns: ReactNode[]
  children: ReactNode
}) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th key={i}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
export function AdminOverview() {
  const query = useData<{
    users: number
    characters: number
    claims: number
    reports: number
    health: { database: boolean; redis: boolean; smtpConfigured: boolean }
  }>("/admin/overview")
  if (query.isPending) return <Loading />
  if (query.error || !query.data) return <Failure error={query.error} />
  const data = query.data
  return (
    <>
      <Heading title="概览" />
      <div className="stats-row">
        {[
          ["用户", data.users, UsersRound],
          ["角色", data.characters, UserRound],
          ["待处理认领", data.claims, Shield],
          ["未处理举报", data.reports, Flag],
        ].map(([name, count]) => (
          <div key={String(name)} className="stat">
            <p className="muted">{String(name)}</p>
            <strong>{String(count)}</strong>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <h2 className="mb-4">待处理</h2>
          <Link
            className="inline-row"
            to="/admin/characters?tab=claims&status=pending"
          >
            <span>角色认领</span>
            <span className="flex items-center gap-3">
              {data.claims}
              <ArrowUpRight className="size-4" />
            </span>
          </Link>
          <Link
            className="inline-row"
            to="/admin/textures?tab=reports&status=pending"
          >
            <span>材质举报</span>
            <span className="flex items-center gap-3">
              {data.reports}
              <ArrowUpRight className="size-4" />
            </span>
          </Link>
        </section>
        <section className="panel">
          <h2 className="mb-4">服务状态</h2>
          <div className="inline-row">
            数据库
            <Status value="active" />
          </div>
          <div className="inline-row">
            Redis
            <Status value={data.health.redis ? "active" : "error"} />
          </div>
          <div className="inline-row">
            <span>邮件服务</span>
            <span className="muted">
              {data.health.smtpConfigured ? "已配置" : "未配置"}
            </span>
          </div>
        </section>
      </div>
    </>
  )
}
type UserOperation = {
  ids: string[]
  action: "ban" | "unban" | "revoke" | "role"
  role?: string
}
export function AdminUsers() {
  const [params] = useSearchParams(),
    query = useData<Page<User>>(`/admin/users?${params}`)
  const [selected, setSelected] = useState<string[]>([]),
    [operation, setOperation] = useState<UserOperation | null>(null),
    [create, setCreate] = useState(false),
    [password, setPassword] = useState("")
  return (
    <>
      <Heading title="用户">
        <Button
          onClick={() => {
            setPassword("")
            setCreate(true)
          }}
        >
          <Plus />
          新建用户
        </Button>
      </Heading>
      <div className="toolbar">
        <SearchBox placeholder="搜索邮箱或昵称" />
        <Filter
          name="status"
          label="用户状态"
          options={[
            { value: "", label: "全部状态" },
            { value: "active", label: "正常" },
            { value: "unverified", label: "未验证" },
            { value: "banned", label: "已封禁" },
          ]}
        />
        <Filter
          name="role"
          label="用户身份"
          options={[
            { value: "", label: "全部身份" },
            { value: "admin", label: "管理员" },
            { value: "user", label: "用户" },
          ]}
        />
      </div>
      {selected.length > 0 && (
        <div className="toolbar">
          <span className="muted">已选择 {selected.length} 位</span>
          <Button
            variant="outline"
            onClick={() => setOperation({ ids: selected, action: "ban" })}
          >
            封禁
          </Button>
          <Button
            variant="outline"
            onClick={() => setOperation({ ids: selected, action: "unban" })}
          >
            解封
          </Button>
          <Button
            variant="outline"
            onClick={() => setOperation({ ids: selected, action: "revoke" })}
          >
            撤销会话
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])}>
            取消选择
          </Button>
        </div>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <DataTable
            columns={[
              <Checkbox
                key="select"
                aria-label="选择当前页用户"
                checked={query.data.items.every((u) => selected.includes(u.id))}
                onCheckedChange={(checked) =>
                  setSelected(checked ? query.data!.items.map((u) => u.id) : [])
                }
              />,
              "用户",
              "邮箱",
              "身份",
              "状态",
              "注册时间",
              "",
            ]}
          >
            {query.data.items.map((user) => (
              <tr key={user.id}>
                <td>
                  <Checkbox
                    aria-label={`选择 ${user.name}`}
                    checked={selected.includes(user.id)}
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked
                          ? [...selected, user.id]
                          : selected.filter((id) => id !== user.id)
                      )
                    }
                  />
                </td>
                <td>
                  <Link className="name-cell" to={`/admin/users/${user.id}`}>
                    <SkinHead name={user.name} size={28} />
                    <strong>{user.name}</strong>
                  </Link>
                </td>
                <td>{user.email}</td>
                <td>
                  <Status value={user.role} />
                </td>
                <td>
                  <Status
                    value={
                      user.banned
                        ? "banned"
                        : user.emailVerified
                          ? "active"
                          : "unverified"
                    }
                  />
                </td>
                <td>{date(user.createdAt)}</td>
                <td>
                  <Menu>
                    <MenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${user.name} 的操作`}
                        />
                      }
                    >
                      <MoreVertical />
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuItem
                        render={<Link to={`/admin/users/${user.id}`} />}
                      >
                        查看详情
                      </MenuItem>
                      <MenuItem
                        onClick={() =>
                          setOperation({ ids: [user.id], action: "revoke" })
                        }
                      >
                        撤销会话
                      </MenuItem>
                      <MenuItem
                        onClick={() =>
                          setOperation({
                            ids: [user.id],
                            action: user.banned ? "unban" : "ban",
                          })
                        }
                      >
                        {user.banned ? "解封用户" : "封禁用户"}
                      </MenuItem>
                    </MenuPopup>
                  </Menu>
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text="没有找到用户" />
      )}
      {operation && (
        <UserActionModal
          operation={operation}
          close={() => {
            setOperation(null)
            setSelected([])
          }}
        />
      )}
      <Modal
        title={password ? "保存临时密码" : "新建用户"}
        open={create}
        onOpenChange={(v) => {
          setCreate(v)
          if (!v) setPassword("")
        }}
        description={
          password ? "用户需要验证邮箱，并在首次登录后更换密码" : undefined
        }
      >
        {password ? (
          <div className="form-stack">
            <div className="code-box">{password}</div>
            <CopyButton value={password} label="复制密码" />
          </div>
        ) : (
          <ActionForm
            label="创建"
            onSubmit={async (data) => {
              const response = await mutate<{ password: string }>(
                "/admin/users",
                "POST",
                { name: data.get("name"), email: data.get("email") }
              )
              setPassword(response.password)
              await refresh()
            }}
          >
            <InputField label="昵称" name="name" required />
            <InputField label="邮箱" name="email" type="email" required />
          </ActionForm>
        )}
      </Modal>
    </>
  )
}
function UserActionModal({
  operation,
  close,
}: {
  operation: UserOperation
  close: () => void
}) {
  return (
    <Modal
      title={
        {
          ban: "封禁用户",
          unban: "解封用户",
          revoke: "撤销会话",
          role: "更改用户身份",
        }[operation.action]
      }
      description={`将影响 ${operation.ids.length} 位用户`}
      open
      onOpenChange={(v) => {
        if (!v) close()
      }}
    >
      <ActionForm
        label="确认"
        danger={operation.action === "ban"}
        onSubmit={async (data) => {
          await mutate("/admin/users/actions", "POST", {
            ...operation,
            reason: data.get("reason") ?? "",
          })
          await refresh()
          close()
        }}
      >
        {operation.action === "ban" ? (
          <label className="form-field">
            原因
            <Textarea name="reason" required maxLength={1000} />
          </label>
        ) : (
          <p className="form-hint">相关设备可能需要重新登录</p>
        )}
      </ActionForm>
    </Modal>
  )
}
export function AdminUserDetail() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    tab = params.get("tab") ?? "profile",
    query = useData<
      User & {
        characters: Character[]
        sessions: { id: string; userAgent: string; createdAt: string }[]
        history: Audit[]
      }
    >(`/admin/users/${id}`),
    [operation, setOperation] = useState<UserOperation | null>(null)
  if (query.isPending) return <Loading />
  if (query.error || !query.data) return <Failure error={query.error} />
  const user = query.data
  return (
    <>
      <Heading title={user.name} back="/admin/users">
        <Status
          value={
            user.banned
              ? "banned"
              : user.emailVerified
                ? "active"
                : "unverified"
          }
        />
        <Button
          variant="outline"
          onClick={() =>
            setOperation({
              ids: [user.id],
              action: user.banned ? "unban" : "ban",
            })
          }
        >
          {user.banned ? "解封" : "封禁"}
        </Button>
      </Heading>
      <TabsNav
        tabs={[
          { label: "资料", value: "profile" },
          { label: "角色", value: "characters" },
          { label: "会话", value: "sessions" },
          { label: "管理历史", value: "history" },
        ]}
      />
      {tab === "profile" ? (
        <div className="form-section">
          <div className="inline-row">
            邮箱<span>{user.email}</span>
          </div>
          <div className="inline-row">
            注册时间<span>{date(user.createdAt)}</span>
          </div>
          <div className="inline-row">
            两步验证<span>{user.twoFactorEnabled ? "已启用" : "未启用"}</span>
          </div>
          <div className="inline-row">
            <Status value={user.role} />
            <Button
              variant="outline"
              onClick={() =>
                setOperation({
                  ids: [user.id],
                  action: "role",
                  role: user.role === "admin" ? "user" : "admin",
                })
              }
            >
              {user.role === "admin" ? "设为普通用户" : "设为管理员"}
            </Button>
          </div>
          {user.banReason && <p className="muted mt-5">{user.banReason}</p>}
        </div>
      ) : tab === "characters" ? (
        user.characters.length ? (
          user.characters.map((character) => (
            <Link
              key={character.id}
              className="inline-row"
              to={`/admin/characters/${character.id}`}
            >
              <span>{character.name}</span>
              <span className="muted font-mono text-xs">{character.id}</span>
            </Link>
          ))
        ) : (
          <Empty text="没有角色" />
        )
      ) : tab === "sessions" ? (
        <>
          <Button
            variant="outline"
            className="mb-5"
            onClick={() => setOperation({ ids: [user.id], action: "revoke" })}
          >
            撤销全部会话
          </Button>
          {user.sessions.map((session) => (
            <div key={session.id} className="inline-row">
              <span className="truncate">{session.userAgent}</span>
              <span>{date(session.createdAt)}</span>
            </div>
          ))}
        </>
      ) : (
        <AuditTable items={user.history} />
      )}
      {operation && (
        <UserActionModal
          operation={operation}
          close={() => setOperation(null)}
        />
      )}
    </>
  )
}
export function AdminCharacters() {
  const [params] = useSearchParams(),
    tab = params.get("tab") ?? "characters"
  return (
    <>
      <Heading title="角色" />
      <TabsNav
        tabs={[
          { label: "全部角色", value: "characters" },
          { label: "旧服导入", value: "imports" },
          { label: "认领申请", value: "claims" },
        ]}
      />
      {tab === "imports" ? (
        <ImportPage />
      ) : tab === "claims" ? (
        <ClaimQueue />
      ) : (
        <CharacterTable />
      )}
    </>
  )
}
function CharacterTable() {
  const [params] = useSearchParams(),
    query = useData<Page<Character>>(`/admin/characters?${params}`)
  return (
    <>
      <div className="toolbar">
        <SearchBox placeholder="搜索角色、UUID 或邮箱" />
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <DataTable columns={["角色", "UUID", "归属", "状态", ""]}>
            {query.data.items.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link className="name-cell" to={`/admin/characters/${c.id}`}>
                    <SkinHead name={c.name} hash={c.skin?.hash} size={28} />
                    {c.name}
                  </Link>
                </td>
                <td className="font-mono text-xs">{c.id}</td>
                <td>{c.user?.email ?? "未认领"}</td>
                <td>
                  <Status
                    value={c.deletedAt || c.disabled ? "disabled" : "active"}
                  />
                </td>
                <td>
                  <Button
                    variant="ghost"
                    render={<Link to={`/admin/characters/${c.id}`} />}
                  >
                    详情
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text="没有角色记录" />
      )}
    </>
  )
}
function ImportPage() {
  const [input, setInput] = useState<unknown>(null),
    [preview, setPreview] = useState<{
      count: number
      digest: string
      issues: { row: number; message: string }[]
      rows: { name: string; uuid: string; serverKey: string }[]
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const history =
    useData<{ id: string; count: number; createdAt: string }[]>(
      "/admin/imports"
    )
  return (
    <>
      <div className="max-w-3xl">
        <h2 className="mb-4">导入身份清单</h2>
        <p className="form-hint mb-5">
          从旧服核实原名与 UUID 后导入，字段为 serverKey、name、uuid
        </p>
        <div className="upload-area">
          <input
            type="file"
            accept="application/json,.json"
            aria-label="身份清单 JSON"
            onChange={async (e) => {
              setError("")
              setPreview(null)
              setInput(null)
              try {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.size > 10 * 1024 * 1024) throw new Error("文件过大")
                setInput(JSON.parse(await file.text()))
              } catch (err) {
                setError(errorMessage(err))
              }
            }}
          />
        </div>
        <Button
          className="mt-4"
          disabled={!input || busy}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            setError("")
            try {
              setPreview(await mutate("/admin/imports/preview", "POST", input))
            } catch (err) {
              setError(errorMessage(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          检查清单
        </Button>
        {error && (
          <p role="alert" className="form-error mt-4">
            {error}
          </p>
        )}
        {preview && (
          <div className="mt-6">
            <h3 className="mb-3">共 {preview.count} 条身份</h3>
            {preview.issues.length ? (
              <div className="form-error">
                {preview.issues.map((issue, i) => (
                  <p key={i}>
                    第 {issue.row} 条：{issue.message}
                  </p>
                ))}
              </div>
            ) : (
              <>
                <DataTable columns={["原名", "UUID", "来源"]}>
                  {preview.rows.map((row) => (
                    <tr key={`${row.serverKey}:${row.uuid}`}>
                      <td>{row.name}</td>
                      <td className="font-mono text-xs">{row.uuid}</td>
                      <td>{row.serverKey}</td>
                    </tr>
                  ))}
                </DataTable>
                <div className="mt-5">
                  <ActionForm
                    label="确认导入"
                    onSubmit={async () => {
                      await mutate("/admin/imports/commit", "POST", {
                        rows: input,
                        digest: preview.digest,
                      })
                      setPreview(null)
                      setInput(null)
                      await refresh()
                    }}
                  >
                    <p className="form-hint">
                      仅预览前 100 条，确认后导入全部有效记录
                    </p>
                  </ActionForm>
                </div>
              </>
            )}
          </div>
        )}
        <h2 className="mt-10 mb-3">导入记录</h2>
        {history.data?.length ? (
          history.data.map((batch) => (
            <div className="inline-row" key={batch.id}>
              <span>{batch.count} 条</span>
              <span className="muted">{date(batch.createdAt)}</span>
            </div>
          ))
        ) : (
          <Empty text="还没有导入记录" />
        )}
      </div>
    </>
  )
}
function ClaimQueue() {
  const [params] = useSearchParams(),
    query = useData<Page<Claim>>(`/admin/claims?${params}`),
    [selected, setSelected] = useState<Claim | null>(null),
    [approve, setApprove] = useState("true")
  return (
    <>
      <div className="toolbar">
        <Filter
          name="status"
          label="申请状态"
          options={[
            { value: "", label: "全部状态" },
            { value: "pending", label: "待处理" },
            { value: "approved", label: "已通过" },
            { value: "rejected", label: "已驳回" },
          ]}
        />
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <DataTable columns={["旧角色", "来源", "申请人", "状态", ""]}>
            {query.data.items.map((claim) => (
              <tr key={claim.id}>
                <td>{claim.identity.originalName}</td>
                <td>{claim.identity.serverKey}</td>
                <td>{claim.user?.email}</td>
                <td>
                  <Status value={claim.status} />
                </td>
                <td>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(claim)
                      setApprove("true")
                    }}
                  >
                    查看
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text="没有认领申请" />
      )}
      {selected && (
        <Modal
          drawer
          title={selected.identity.originalName}
          open
          onOpenChange={(v) => {
            if (!v) setSelected(null)
          }}
        >
          <div className="form-stack">
            <p className="muted">
              {selected.user?.email} · {selected.identity.serverKey}
            </p>
            <p className="whitespace-pre-wrap">{selected.evidence}</p>
            <div className="code-box">{selected.identity.characterId}</div>
            {selected.status === "pending" ? (
              <ActionForm
                label="提交处理结果"
                onSubmit={async (data) => {
                  await mutate(`/admin/claims/${selected.id}/resolve`, "POST", {
                    approve: approve === "true",
                    resolution: data.get("resolution"),
                  })
                  await refresh()
                  setSelected(null)
                }}
              >
                <SelectBox
                  label="处理结果"
                  value={approve}
                  onChange={setApprove}
                  options={[
                    { value: "true", label: "批准认领" },
                    { value: "false", label: "驳回申请" },
                  ]}
                />
                <label className="form-field">
                  {approve === "true" ? "核实记录" : "驳回原因"}
                  <Textarea
                    name="resolution"
                    required
                    minLength={5}
                    maxLength={2000}
                  />
                </label>
              </ActionForm>
            ) : (
              <p className="muted">{selected.resolution}</p>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
export function AdminTextures() {
  const [params] = useSearchParams()
  return (
    <>
      <Heading title="皮肤管理" />
      <TabsNav
        tabs={[
          { label: "材质", value: "textures" },
          { label: "举报", value: "reports" },
        ]}
      />
      {params.get("tab") === "reports" ? <ReportsTable /> : <TexturesTable />}
    </>
  )
}
function TexturesTable() {
  const [params] = useSearchParams(),
    query = useData<Page<Texture>>(`/admin/textures?${params}`),
    [selected, setSelected] = useState<Texture | null>(null)
  return (
    <>
      <div className="toolbar">
        <SearchBox placeholder="搜索材质" />
        <Filter
          name="status"
          label="材质状态"
          options={[
            { value: "", label: "全部状态" },
            { value: "public", label: "公开" },
            { value: "private", label: "未公开" },
            { value: "blocked", label: "已下架" },
          ]}
        />
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <DataTable columns={["材质", "上传者", "类型", "状态", ""]}>
            {query.data.items.map((texture) => (
              <tr key={texture.id}>
                <td>{texture.name}</td>
                <td>{texture.user?.name ?? "已注销用户"}</td>
                <td>{texture.kind === "skin" ? "皮肤" : "披风"}</td>
                <td>
                  <Status
                    value={
                      texture.blob.blocked
                        ? "removed"
                        : texture.public
                          ? "public"
                          : "private"
                    }
                  />
                </td>
                <td>
                  <Button
                    variant="outline"
                    onClick={() => setSelected(texture)}
                  >
                    管理
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text="没有材质记录" />
      )}
      {selected && (
        <Modal
          drawer
          title={selected.name}
          open
          onOpenChange={(v) => {
            if (!v) setSelected(null)
          }}
        >
          <ActionForm
            label={selected.blob.blocked ? "恢复材质" : "下架材质"}
            danger={!selected.blob.blocked}
            onSubmit={async (data) => {
              await mutate(`/admin/textures/${selected.id}/moderate`, "POST", {
                blocked: !selected.blob.blocked,
                reason: data.get("reason"),
              })
              await refresh()
              setSelected(null)
            }}
          >
            <div className="texture-canvas">
              <TextureThumbnail
                hash={selected.hash}
                kind={selected.kind}
                src={`/api/v1/admin/textures/${selected.id}/preview`}
              />
            </div>
            <label className="form-field">
              处理原因
              <Textarea name="reason" required minLength={2} maxLength={1000} />
            </label>
          </ActionForm>
        </Modal>
      )}
    </>
  )
}
function ReportsTable() {
  const [params] = useSearchParams(),
    query = useData<Page<Report>>(`/admin/reports?${params}`),
    [selected, setSelected] = useState<Report | null>(null),
    [block, setBlock] = useState("false")
  return (
    <>
      <div className="toolbar">
        <Filter
          name="status"
          label="举报状态"
          options={[
            { value: "", label: "全部状态" },
            { value: "pending", label: "待处理" },
            { value: "removed", label: "已下架" },
            { value: "dismissed", label: "已忽略" },
          ]}
        />
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <DataTable columns={["材质", "举报人", "状态", "日期", ""]}>
            {query.data.items.map((report) => (
              <tr key={report.id}>
                <td>{report.texture.name}</td>
                <td>{report.user.name}</td>
                <td>
                  <Status value={report.status} />
                </td>
                <td>{date(report.createdAt)}</td>
                <td>
                  <Button variant="outline" onClick={() => setSelected(report)}>
                    查看
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text="没有举报记录" />
      )}
      {selected && (
        <Modal
          drawer
          title="处理举报"
          open
          onOpenChange={(v) => {
            if (!v) setSelected(null)
          }}
        >
          <div className="form-stack">
            {
              <div className="texture-canvas">
                <TextureThumbnail
                  src={`/api/v1/admin/textures/${selected.texture.id}/preview`}
                  hash={selected.texture.hash}
                  kind={selected.texture.kind}
                />
              </div>
            }
            <p className="whitespace-pre-wrap">{selected.reason}</p>
            {selected.status === "pending" ? (
              <ActionForm
                label="提交处理结果"
                onSubmit={async (data) => {
                  await mutate(
                    `/admin/reports/${selected.id}/resolve`,
                    "POST",
                    {
                      block: block === "true",
                      resolution: data.get("resolution"),
                    }
                  )
                  await refresh()
                  setSelected(null)
                }}
              >
                <SelectBox
                  label="处理方式"
                  value={block}
                  onChange={setBlock}
                  options={[
                    { value: "false", label: "忽略举报" },
                    { value: "true", label: "下架材质" },
                  ]}
                />
                <label className="form-field">
                  处理说明
                  <Textarea
                    name="resolution"
                    required
                    minLength={2}
                    maxLength={1000}
                  />
                </label>
              </ActionForm>
            ) : (
              <p className="muted">{selected.resolution}</p>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
export function AdminServers() {
  const query = useData<GameServer[]>("/admin/servers")
  return (
    <>
      <Heading title="服务器">
        <Button render={<Link to="/admin/servers/new" />}>
          <Plus />
          新建服务器
        </Button>
      </Heading>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.length ? (
        <DataTable columns={["名称", "地址", "状态", "可见性", "最近查询", ""]}>
          {query.data.map((server) => (
            <tr key={server.id}>
              <td>{server.name}</td>
              <td className="font-mono text-xs">{server.address}</td>
              <td>
                <Status value={server.status} />
              </td>
              <td>{server.hidden ? "隐藏" : "显示"}</td>
              <td>{date(server.checkedAt)}</td>
              <td>
                <Button
                  variant="outline"
                  render={<Link to={`/admin/servers/${server.id}`} />}
                >
                  编辑
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <Empty text="还没有服务器">
          <Button render={<Link to="/admin/servers/new" />}>添加服务器</Button>
        </Empty>
      )}
    </>
  )
}
export function ServerEditor() {
  const { id } = useParams(),
    query = useData<GameServer>(`/admin/servers/${id}`, id !== "new")
  if (id !== "new" && query.isPending) return <Loading />
  if (query.error) return <Failure error={query.error} />
  return <ServerForm key={id} initial={query.data} />
}
function ServerForm({ initial }: { initial?: GameServer }) {
  const navigate = useNavigate(),
    [params] = useSearchParams(),
    tab = params.get("tab") ?? "basic"
  const [draft, setDraft] = useState({
      key: "",
      name: "",
      address: "",
      queryHost: "",
      queryPort: 25565,
      version: "",
      description: "",
      rules: "",
      sort: 0,
      hidden: false,
      ...initial,
    }),
    [downloads, setDownloads] = useState(initial?.downloads ?? [])
  function field(
    key: "key" | "name" | "address" | "queryHost" | "version",
    label: string
  ) {
    return (
      <InputField
        label={label}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    )
  }
  return (
    <>
      <Heading
        title={initial ? "编辑服务器" : "新建服务器"}
        back="/admin/servers"
      />
      <TabsNav
        tabs={[
          { label: "基本信息", value: "basic" },
          { label: "入服指南", value: "guide" },
          { label: "接入检查", value: "connection" },
        ]}
      />
      <div className="max-w-3xl">
        <ActionForm
          onSubmit={async () => {
            const saved = await mutate<GameServer>(
              initial ? `/admin/servers/${initial.id}` : "/admin/servers",
              initial ? "PATCH" : "POST",
              {
                ...draft,
                queryHost:
                  draft.queryHost ||
                  draft.address.replace(/:\d+$/, "").replace(/^\[|\]$/g, ""),
                downloads,
              }
            )
            await refresh()
            void navigate(`/admin/servers/${saved.id}`)
          }}
        >
          {tab === "basic" ? (
            <>
              {field("name", "名称")}
              {field("key", "服务器标识")}
              {field("address", "连接地址")}
              {field("version", "版本说明")}
              <InputField
                label="排序"
                type="number"
                value={draft.sort}
                onChange={(e) =>
                  setDraft({ ...draft, sort: Number(e.target.value) })
                }
              />
              <label className="flex gap-2">
                <Checkbox
                  checked={draft.hidden}
                  onCheckedChange={(hidden) => setDraft({ ...draft, hidden })}
                />
                对用户隐藏
              </label>
            </>
          ) : tab === "guide" ? (
            <>
              <label className="form-field">
                简介
                <Textarea
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              <label className="form-field">
                规则
                <Textarea
                  rows={8}
                  value={draft.rules}
                  onChange={(e) =>
                    setDraft({ ...draft, rules: e.target.value })
                  }
                />
              </label>
              <div className="form-stack">
                <h3>下载链接</h3>
                {downloads.map((download, index) => (
                  <div className="flex flex-wrap items-end gap-3" key={index}>
                    <InputField
                      label="名称"
                      value={download.name}
                      required
                      onChange={(e) =>
                        setDownloads(
                          downloads.map((item, i) =>
                            i === index
                              ? { ...item, name: e.target.value }
                              : item
                          )
                        )
                      }
                    />
                    <InputField
                      label="链接"
                      type="url"
                      value={download.url}
                      required
                      onChange={(e) =>
                        setDownloads(
                          downloads.map((item, i) =>
                            i === index
                              ? { ...item, url: e.target.value }
                              : item
                          )
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDownloads(downloads.filter((_, i) => i !== index))
                      }
                    >
                      移除
                    </Button>
                  </div>
                ))}
                {downloads.length < 20 && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDownloads([...downloads, { name: "", url: "" }])
                    }
                  >
                    <Plus />
                    添加链接
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              {field("queryHost", "状态查询主机")}
              <InputField
                label="查询端口"
                type="number"
                min={1}
                max={65535}
                value={draft.queryPort}
                onChange={(e) =>
                  setDraft({ ...draft, queryPort: Number(e.target.value) })
                }
              />
              <div className="code-box">{`-javaagent:authlib-injector.jar=${location.origin}/api/yggdrasil/`}</div>
              <p className="form-hint">
                服务器使用 online-mode=true；迁移前备份并在测试副本验证 UUID
              </p>
              {initial && (
                <Confirm
                  title="测试查询"
                  description="将查询已保存的主机和端口"
                  action={async () => {
                    await mutate(
                      `/admin/servers/${initial.id}/check`,
                      "POST",
                      {}
                    )
                    await refresh()
                  }}
                />
              )}
            </>
          )}
        </ActionForm>
      </div>
    </>
  )
}
export function AdminAnnouncements() {
  const [params] = useSearchParams(),
    query = useData<Page<Announcement>>(`/admin/announcements?${params}`)
  return (
    <>
      <Heading title="公告">
        <Button render={<Link to="/admin/announcements/new" />}>
          <Plus />
          新建公告
        </Button>
      </Heading>
      <div className="toolbar">
        <SearchBox placeholder="搜索公告" />
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <DataTable columns={["标题", "状态", "置顶", "更新日期", ""]}>
            {query.data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>
                  <Status value={item.publishedAt ? "published" : "draft"} />
                </td>
                <td>{item.pinned ? "置顶" : "—"}</td>
                <td>{date(item.publishedAt ?? item.createdAt)}</td>
                <td>
                  <Button
                    variant="outline"
                    render={<Link to={`/admin/announcements/${item.id}`} />}
                  >
                    编辑
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text="还没有公告" />
      )}
    </>
  )
}
export function AnnouncementEditor() {
  const { id } = useParams(),
    query = useData<Announcement>(`/admin/announcements/${id}`, id !== "new")
  if (id !== "new" && query.isPending) return <Loading />
  if (query.error) return <Failure error={query.error} />
  return <AnnouncementForm key={id} initial={query.data} />
}
function AnnouncementForm({ initial }: { initial?: Announcement }) {
  const navigate = useNavigate(),
    [body, setBody] = useState(initial?.body ?? ""),
    [published, setPublished] = useState(!!initial?.publishedAt),
    [pinned, setPinned] = useState(initial?.pinned ?? false),
    [previewing, setPreviewing] = useState(false)
  return (
    <>
      <Heading
        title={initial ? "编辑公告" : "新建公告"}
        back="/admin/announcements"
      />{" "}
      <ActionForm
        onSubmit={async (data) => {
          const item = await mutate<Announcement>(
            initial
              ? `/admin/announcements/${initial.id}`
              : "/admin/announcements",
            initial ? "PATCH" : "POST",
            { title: data.get("title"), body, published, pinned }
          )
          await refresh()
          void navigate(`/admin/announcements/${item.id}`)
        }}
      >
        <InputField
          label="标题"
          name="title"
          defaultValue={initial?.title}
          required
          maxLength={150}
        />
        <div className="flex gap-2 md:hidden">
          <Button
            variant={previewing ? "outline" : "default"}
            onClick={() => setPreviewing(false)}
          >
            编辑
          </Button>
          <Button
            variant={previewing ? "default" : "outline"}
            onClick={() => setPreviewing(true)}
          >
            预览
          </Button>
        </div>
        <div className="detail-grid">
          <label className={`form-field ${previewing ? "max-md:hidden" : ""}`}>
            正文
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
            />
          </label>
          <div className={`panel ${previewing ? "" : "max-md:hidden"}`}>
            <h3 className="muted mb-4">预览</h3>
            <div className="markdown">
              <ReactMarkdown skipHtml>{body}</ReactMarkdown>
            </div>
          </div>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2">
            <Checkbox checked={published} onCheckedChange={setPublished} />
            发布
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={pinned} onCheckedChange={setPinned} />
            置顶
          </label>
        </div>
      </ActionForm>
      {initial && (
        <div className="mt-8">
          <Confirm
            title="删除公告"
            description="公告删除后无法恢复"
            action={async () => {
              await mutate(`/admin/announcements/${initial.id}`, "DELETE")
              await refresh()
              void navigate("/admin/announcements")
            }}
          />
        </div>
      )}
    </>
  )
}
export function AdminSettings() {
  const query = useData<Config>("/admin/settings")
  if (query.isPending) return <Loading />
  if (query.error || !query.data) return <Failure error={query.error} />
  return <SettingsForm initial={query.data} />
}
function SettingsForm({ initial }: { initial: Config }) {
  const [draft, setDraft] = useState(initial),
    [params] = useSearchParams(),
    tab = params.get("tab") ?? "basic"
  const toggle = (
    key: "registrationOpen" | "migrationEnabled" | "migrationReady",
    label: string
  ) => (
    <label className="flex items-center gap-3">
      <Checkbox
        checked={draft[key]}
        onCheckedChange={(value) => setDraft({ ...draft, [key]: value })}
      />
      {label}
    </label>
  )
  return (
    <>
      <Heading title="站点设置" />
      <TabsNav
        tabs={[
          { label: "基本", value: "basic" },
          { label: "认证页", value: "auth" },
          { label: "注册与角色", value: "accounts" },
          { label: "材质", value: "textures" },
          { label: "服务", value: "services" },
        ]}
      />
      <div className="form-section">
        <ActionForm
          onSubmit={async () => {
            await mutate("/admin/settings", "PATCH", draft)
            await refresh()
          }}
        >
          {tab === "basic" ? (
            <>
              <InputField
                label="社区名称"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <label className="form-field">
                简介
                <Textarea
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              <InputField
                label="维护提示"
                value={draft.maintenanceMessage}
                onChange={(e) =>
                  setDraft({ ...draft, maintenanceMessage: e.target.value })
                }
              />
            </>
          ) : tab === "auth" ? (
            <>
              <InputField
                label="日间模式图片链接"
                value={draft.authImageLight}
                onChange={(e) =>
                  setDraft({ ...draft, authImageLight: e.target.value })
                }
                placeholder="留空则不显示图片"
              />
              <InputField
                label="暗黑模式图片链接"
                value={draft.authImageDark}
                onChange={(e) =>
                  setDraft({ ...draft, authImageDark: e.target.value })
                }
                placeholder="留空则不显示图片"
              />
              <div className="auth-preview">
                {(
                  [
                    ["日间", draft.authImageLight],
                    ["暗黑", draft.authImageDark],
                  ] as const
                ).map(([label, url]) => (
                  <figure key={label}>
                    <div className="thumb">
                      {url ? (
                        <img src={url} alt={`${label}模式预览`} />
                      ) : (
                        <span className="muted text-xs">未设置</span>
                      )}
                    </div>
                    <figcaption>{label}模式</figcaption>
                  </figure>
                ))}
              </div>
              <InputField
                label="访客缓存时长（分钟）"
                type="number"
                min={0}
                max={10080}
                value={draft.authImageCacheMinutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    authImageCacheMinutes: Number(e.target.value),
                  })
                }
              />
              <p className="form-hint">
                该时长同时作为公开站点配置的浏览器缓存时间，期间后台修改不会立即对未登录访客生效；0 表示不缓存
              </p>
              <p className="form-hint">
                默认图片来自 Wikimedia Commons（CC BY 3.0），替换为其他图片时请自行确认授权
              </p>
            </>
          ) : tab === "accounts" ? (
            <>
              {toggle("registrationOpen", "开放注册")}
              <InputField
                label="每账户角色上限"
                type="number"
                min={1}
                max={100}
                value={draft.characterLimit}
                onChange={(e) =>
                  setDraft({ ...draft, characterLimit: Number(e.target.value) })
                }
              />
              {toggle("migrationEnabled", "启用旧服迁移")}
              {toggle("migrationReady", "旧服身份导入完成")}
              <p className="form-hint">启用迁移后，导入完成前暂停创建新角色</p>
            </>
          ) : tab === "textures" ? (
            <>
              <InputField
                label="每账户上传数量"
                type="number"
                value={draft.uploadLimit}
                onChange={(e) =>
                  setDraft({ ...draft, uploadLimit: Number(e.target.value) })
                }
              />
              <InputField
                label="单文件上限（字节）"
                type="number"
                value={draft.uploadBytes}
                onChange={(e) =>
                  setDraft({ ...draft, uploadBytes: Number(e.target.value) })
                }
              />
            </>
          ) : (
            <>
              <p className="muted">
                数据库、Redis、SMTP 和签名密钥通过部署环境配置
              </p>
              <Confirm
                title="检查邮件连接"
                description="检查 SMTP 连接与认证，不发送邮件"
                action={() => mutate("/admin/mail/check", "POST", {})}
              />
              <div className="code-box">{location.origin}/api/yggdrasil/</div>
            </>
          )}
        </ActionForm>
      </div>
    </>
  )
}
function AuditTable({ items }: { items: Audit[] }) {
  const [selected, setSelected] = useState<Audit | null>(null)
  return (
    <>
      {items.length ? (
        <DataTable columns={["时间", "操作者", "操作", "对象", ""]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
              <td className="font-mono text-xs">
                {item.actorId?.slice(0, 8) ?? "系统"}
              </td>
              <td>{item.action}</td>
              <td className="font-mono text-xs">
                {item.target.length > 36
                  ? `${item.target.slice(0, 36)}…`
                  : item.target}
              </td>
              <td>
                <Button variant="ghost" onClick={() => setSelected(item)}>
                  详情
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <Empty text="没有审计记录" />
      )}
      {selected && (
        <Modal
          drawer
          title="操作详情"
          open
          onOpenChange={(v) => {
            if (!v) setSelected(null)
          }}
        >
          <div className="form-stack">
            <p>{selected.action}</p>
            <div className="code-box">{selected.actorId}</div>
            <div className="code-box">{selected.target}</div>
            <pre className="code-box whitespace-pre-wrap">
              {JSON.stringify(selected.details, null, 2)}
            </pre>
          </div>
        </Modal>
      )}
    </>
  )
}
export function AuditPage() {
  const [params, setParams] = useSearchParams(),
    query = useData<Page<Audit>>(`/admin/audit?${params}`)
  return (
    <>
      <Heading title="审计日志" />
      <div className="toolbar audit-toolbar">
        <SearchBox placeholder="搜索操作或对象" />
        <InputField
          label="操作者 ID"
          value={params.get("actorId") ?? ""}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            next.set("actorId", e.target.value)
            next.delete("page")
            setParams(next)
          }}
        />
        <InputField
          label="开始日期"
          type="date"
          value={params.get("from") ?? ""}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            next.set("from", e.target.value)
            setParams(next)
          }}
        />
        <InputField
          label="结束日期"
          type="date"
          value={params.get("to") ?? ""}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            next.set("to", e.target.value)
            setParams(next)
          }}
        />
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <>
          <AuditTable items={query.data?.items ?? []} />
          {query.data && <Pagination data={query.data} />}
        </>
      )}
    </>
  )
}
