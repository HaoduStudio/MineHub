import { lazy, Suspense, useRef, useState } from "react"
import {
  Link,
  Navigate,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom"
import {
  ChevronRight,
  Plus,
  Heart,
  Flag,
  Download,
  Pin,
  Inbox,
  FileImage,
  X,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { LauncherConnect } from "@/components/launcher-connect"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
  CopyValue,
  Confirm,
  TabsNav,
  Filter,
  SearchBox,
  Pagination,
  Status,
  SelectBox,
  date,
  notify,
  reportError,
} from "@/components/common"
import { SiteFooter } from "@/components/layout"
import {
  useData,
  mutate,
  refresh,
  type Me,
  type Config,
  type Character,
  type Texture,
  type Page,
  type GameServer,
  type Announcement,
  type Claim,
} from "@/lib/api"

const SkinPreview = lazy(() => import("@/components/skin-preview"))
export function Overview() {
  const me = useOutletContext<Me>(),
    characters = useData<Page<Character>>("/characters?limit=100"),
    servers = useData<GameServer[]>("/servers"),
    announcements = useData<Page<Announcement>>("/announcements?limit=3")
  const featured =
    characters.data?.items.find((c) => c.id === me.user.featuredCharacterId) ??
    characters.data?.items[0]
  return (
    <>
      <Heading title="概览" />
      <div className="overview-grid">
        <section className="panel">
          <div className="section-head">
            <h2>我的角色</h2>
            <Button
              variant="outline"
              render={<Link to="/app/characters?create=1" />}
            >
              新建角色
            </Button>
          </div>
          {characters.isPending ? (
            <Loading />
          ) : characters.error ? (
            <Failure error={characters.error} />
          ) : characters.data?.items.length ? (
            characters.data.items.slice(0, 3).map((character) => (
              <div className="character-row" key={character.id}>
                <SkinHead
                  hash={character.skin?.hash}
                  name={character.name}
                  size={64}
                />
                <div className="details">
                  <h3>{character.name}</h3>
                  <p>
                    {character.disabled
                      ? "角色已停用"
                      : character.skin
                        ? "皮肤已设置"
                        : "尚未设置皮肤"}
                  </p>
                </div>
                <Button
                  render={<Link to={`/app/characters/${character.id}`} />}
                  variant="outline"
                >
                  管理
                </Button>
              </div>
            ))
          ) : (
            <Empty text="还没有角色">
              <Button render={<Link to="/app/characters" />}>创建角色</Button>
            </Empty>
          )}
        </section>
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2>{featured?.name ?? "角色预览"}</h2>
            {featured && (
              <Button
                variant="outline"
                render={<Link to={`/app/characters/${featured.id}`} />}
              >
                更换皮肤
              </Button>
            )}
          </div>
          <Suspense fallback={<Loading />}>
            <SkinPreview
              key={featured?.id}
              compact
              skin={
                featured?.skin ? `/textures/${featured.skin.hash}` : undefined
              }
              cape={
                featured?.cape ? `/textures/${featured.cape.hash}` : undefined
              }
              model={featured?.skin?.model}
            />
          </Suspense>
        </section>
      </div>
      <section className="panel section">
        <div className="section-head">
          <h2>服务器</h2>
          <Button variant="outline" render={<Link to="/app/servers" />}>
            入服指南
          </Button>
        </div>
        {servers.isPending ? (
          <Loading />
        ) : servers.error ? (
          <Failure error={servers.error} />
        ) : (
          <ServerTable items={servers.data ?? []} />
        )}
      </section>
      <section>
        <div className="section-head">
          <h2>公告</h2>
          <Link to="/app/announcements" className="muted text-sm">
            查看全部
          </Link>
        </div>
        {announcements.error ? (
          <Failure error={announcements.error} />
        ) : (
          <AnnouncementList items={announcements.data?.items ?? []} />
        )}
      </section>
    </>
  )
}
export function CharactersPage() {
  const [params, setParams] = useSearchParams(),
    [open, setOpen] = useState(params.has("create"))
  const query = useData<Page<Character>>(`/characters?${params}`),
    navigate = useNavigate(),
    me = useOutletContext<Me>()
  return (
    <>
      <Heading title="我的角色">
        <Button variant="outline" render={<Link to="/app/characters/claims" />}>
          认领旧角色
        </Button>
        <Button onClick={() => setOpen(true)}>
          <Plus />
          新建角色
        </Button>
      </Heading>
      <p className="form-hint mb-5">
        {query.data?.total ?? 0} / {me.config.characterLimit} 个角色
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <div className="max-w-3xl">
            {query.data.items.map((character) => (
              <div className="character-row" key={character.id}>
                <SkinHead
                  hash={character.skin?.hash}
                  name={character.name}
                  size={52}
                />
                <div className="details">
                  <h3>{character.name}</h3>
                  <p>
                    {character.legacyIdentities.length ? "旧服角色" : ""}
                    {character.disabled ? " · 已停用" : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  render={<Link to={`/app/characters/${character.id}`} />}
                >
                  管理
                </Button>
              </div>
            ))}
          </div>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text="还没有角色">
          <Button onClick={() => setOpen(true)}>创建角色</Button>
        </Empty>
      )}
      <Modal
        title="创建角色"
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) {
            const next = new URLSearchParams(params)
            next.delete("create")
            setParams(next)
          }
        }}
      >
        <ActionForm
          label="创建"
          onSubmit={async (data) => {
            const character = await mutate<Character>("/characters", "POST", {
              name: data.get("name"),
            })
            await refresh()
            void navigate(`/app/characters/${character.id}`)
          }}
        >
          <InputField
            label="角色名称"
            name="name"
            required
            minLength={3}
            maxLength={16}
            pattern="[A-Za-z0-9_]+"
          />
          <p className="form-hint">3–16 位字母、数字或下划线</p>
        </ActionForm>
      </Modal>
    </>
  )
}
export function CharacterDetail({ admin = false }: { admin?: boolean }) {
  const { id } = useParams(),
    base = admin ? "/admin" : "",
    query = useData<Character>(`${base}/characters/${id}`),
    navigate = useNavigate()
  const [choose, setChoose] = useState<"skin" | "cape" | null>(null)
  if (query.isPending) return <Loading />
  if (query.error || !query.data) return <Failure error={query.error} />
  const character = query.data
  return (
    <>
      <Heading
        title={character.name}
        back={admin ? "/admin/characters" : "/app/characters"}
      >
        {character.disabled && <Status value="disabled" />}
      </Heading>
      <div className="detail-grid">
        <Suspense fallback={<Loading />}>
          <SkinPreview
            skin={
              character.skin ? `/textures/${character.skin.hash}` : undefined
            }
            cape={
              character.cape ? `/textures/${character.cape.hash}` : undefined
            }
            model={character.skin?.model}
          />
        </Suspense>
        <div className="form-stack">
          {admin ? (
            <>
              <h2>角色信息</h2>
              <p>归属：{character.user?.email ?? "未认领"}</p>
              <div className="code-box">{character.id}</div>
              {character.legacyIdentities.map((source) => (
                <p key={source.serverKey}>
                  {source.serverKey} · {source.originalName}
                </p>
              ))}
              <Confirm
                title={character.disabled ? "恢复角色" : "停用角色"}
                description="更改角色的游戏认证状态"
                action={async () => {
                  await mutate(`/admin/characters/${id}`, "PATCH", {
                    disabled: !character.disabled,
                  })
                  await refresh()
                }}
              />
            </>
          ) : (
            <>
              <ActionForm
                onSubmit={async (data) => {
                  await mutate(`/characters/${id}`, "PATCH", {
                    name: data.get("name"),
                  })
                  await refresh()
                }}
              >
                <InputField
                  label="角色名称"
                  name="name"
                  defaultValue={character.name}
                  required
                  pattern="[A-Za-z0-9_]{3,16}"
                />
              </ActionForm>
              <div className="inline-row">
                <div>
                  <h3>皮肤</h3>
                  <p className="form-hint">
                    {character.skin?.name ?? "未设置"}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setChoose("skin")}>
                  更换
                </Button>
              </div>
              <div className="inline-row">
                <div>
                  <h3>披风</h3>
                  <p className="form-hint">
                    {character.cape?.name ?? "未设置"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {character.cape && (
                    <Confirm
                      title="移除"
                      description="移除此角色的披风"
                      action={async () => {
                        await mutate(`/characters/${id}`, "PATCH", {
                          capeId: null,
                        })
                        await refresh()
                      }}
                    />
                  )}
                  <Button variant="outline" onClick={() => setChoose("cape")}>
                    更换
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await mutate("/me/featured", "PATCH", { characterId: id })
                    await refresh()
                    notify()
                  } catch (error) {
                    reportError(error)
                  }
                }}
              >
                在概览展示此角色
              </Button>
              <details>
                <summary className="muted cursor-pointer">角色详情</summary>
                <CopyValue
                  value={character.id}
                  label="角色 UUID"
                  className="mt-4"
                />
                <p className="form-hint mt-3">UUID 是游戏识别账户的唯一凭证</p>
              </details>
              <div className="mt-5 border-t pt-5">
                <Confirm
                  title="删除角色"
                  description="角色将会立即停用，且不能重新注册相同名称"
                  action={async () => {
                    await mutate(`/characters/${id}`, "DELETE")
                    await refresh()
                    void navigate("/app/characters")
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {choose && (
        <ChooseTexture
          kind={choose}
          characterId={character.id}
          close={() => setChoose(null)}
        />
      )}
    </>
  )
}
function ChooseTexture({
  kind,
  characterId,
  close,
}: {
  kind: "skin" | "cape"
  characterId: string
  close: () => void
}) {
  const query = useData<Page<Texture>>(
      `/textures?scope=wardrobe&kind=${kind}&limit=100`
    ),
    [selected, setSelected] = useState("")
  return (
    <Modal
      title={kind === "skin" ? "选择皮肤" : "选择披风"}
      open
      onOpenChange={(v) => {
        if (!v) close()
      }}
    >
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <ActionForm
          label="应用"
          onSubmit={async () => {
            if (!selected) throw new Error("请选择材质")
            await mutate(`/characters/${characterId}`, "PATCH", {
              [kind === "skin" ? "skinId" : "capeId"]: selected,
            })
            await refresh()
            close()
          }}
        >
          <SelectBox
            label="选择材质"
            value={selected}
            onChange={setSelected}
            options={[
              { value: "", label: "选择材质" },
              ...query.data.items.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <Link to="/app/wardrobe" className="form-hint">
            前往衣柜上传或管理更多材质
          </Link>
        </ActionForm>
      ) : (
        <Empty text="衣柜中还没有可用材质">
          <Button render={<Link to="/app/wardrobe" />}>前往衣柜</Button>
        </Empty>
      )}
    </Modal>
  )
}
export function LibraryPage({ wardrobe = false }: { wardrobe?: boolean }) {
  const [params] = useSearchParams(),
    [upload, setUpload] = useState(false)
  const args = new URLSearchParams(params)
  args.set("scope", wardrobe ? (params.get("tab") ?? "wardrobe") : "public")
  const query = useData<Page<Texture>>(`/textures?${args}`)
  return (
    <>
      <Heading title={wardrobe ? "衣柜" : "皮肤库"}>
        {wardrobe && (
          <Button onClick={() => setUpload(true)}>
            <Plus />
            上传材质
          </Button>
        )}
      </Heading>
      {wardrobe && (
        <TabsNav
          tabs={[
            { label: "全部", value: "wardrobe" },
            { label: "我的上传", value: "mine" },
            { label: "收藏", value: "favorites" },
          ]}
        />
      )}
      <div className="toolbar">
        <SearchBox placeholder="搜索材质" />
        <Filter
          name="kind"
          label="材质类型"
          options={[
            { value: "", label: "全部类型" },
            { value: "skin", label: "皮肤" },
            { value: "cape", label: "披风" },
          ]}
        />
        <Filter
          name="model"
          label="模型"
          options={[
            { value: "", label: "全部模型" },
            { value: "default", label: "标准手臂" },
            { value: "slim", label: "纤细手臂" },
          ]}
        />
        {!wardrobe && (
          <Filter
            name="sort"
            label="排序"
            options={[
              { value: "", label: "最新发布" },
              { value: "popular", label: "最多收藏" },
            ]}
          />
        )}
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <div className="texture-grid">
            {query.data.items.map((texture) => (
              <Link
                key={texture.id}
                className="texture-card"
                to={`/app/library/${texture.id}`}
              >
                <div className="texture-canvas">
                  <TextureThumbnail hash={texture.hash} kind={texture.kind} />
                </div>
                <footer>
                  <span>{texture.name}</span>
                  {wardrobe ? (
                    <Status value={texture.public ? "public" : "private"} />
                  ) : (
                    <span className="muted flex items-center gap-1 text-xs">
                      <Heart className="size-3" />
                      {texture._count.favorites}
                    </span>
                  )}
                </footer>
              </Link>
            ))}
          </div>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text={wardrobe ? "衣柜还是空的" : "没有找到材质"}>
          {wardrobe && (
            <Button onClick={() => setUpload(true)}>上传材质</Button>
          )}
        </Empty>
      )}
      {upload && <UploadModal close={() => setUpload(false)} />}
    </>
  )
}
function UploadModal({ close }: { close: () => void }) {
  const [kind, setKind] = useState("skin"),
    [model, setModel] = useState("default"),
    [isPublic, setPublic] = useState(false),
    [preview, setPreview] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [fileError, setFileError] = useState(""),
    [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null),
    dragDepth = useRef(0),
    selection = useRef(0)
  const me = useOutletContext<Me>()
  function clearFile() {
    selection.current++
    setFile(null)
    setPreview("")
    setFileError("")
    if (fileInput.current) fileInput.current.value = ""
  }
  async function chooseFile(files: FileList | null) {
    if (!files?.length) return
    const chosen = Array.from(files)
    clearFile()
    const current = selection.current
    if (chosen.length !== 1) {
      setFileError("每次请选择一张 PNG 图片")
      return
    }
    const next = chosen[0]
    if (next.size > me.config.uploadBytes) {
      setFileError("图片超过上传大小限制")
      return
    }
    try {
      const header = new Uint8Array(await next.slice(0, 8).arrayBuffer())
      if (selection.current !== current) return
      if (
        ![137, 80, 78, 71, 13, 10, 26, 10].every(
          (byte, i) => header[i] === byte
        )
      ) {
        setFileError("请选择有效的 PNG 图片")
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        if (selection.current !== current) return
        setFile(next)
        setPreview(typeof reader.result === "string" ? reader.result : "")
      }
      reader.onerror = () => {
        if (selection.current === current)
          setFileError("图片读取失败，请重新选择")
      }
      reader.readAsDataURL(next)
    } catch {
      if (selection.current === current)
        setFileError("图片读取失败，请重新选择")
    }
  }
  return (
    <Modal
      title="上传材质"
      className="max-w-3xl"
      open
      onOpenChange={(v) => {
        if (!v) close()
      }}
    >
      <ActionForm
        label="上传"
        onSubmit={async (data) => {
          if (!file) throw new Error("请选择 PNG 图片")
          data.set("file", file)
          data.set("kind", kind)
          data.set("model", model)
          data.set("public", String(isPublic))
          await mutate("/textures", "POST", data)
          await refresh()
          close()
        }}
      >
        <div className="upload-grid">
          <div className="upload-selection">
            <input
              ref={fileInput}
              aria-label="PNG 文件"
              name="file"
              type="file"
              accept="image/png,.png"
              hidden
              onChange={(event) => {
                void chooseFile(event.target.files)
              }}
            />
            <button
              type="button"
              className="upload-dropzone"
              data-dragging={dragging || undefined}
              aria-label={file ? "更换 PNG 图片" : "选择或拖拽 PNG 图片"}
              aria-invalid={Boolean(fileError)}
              aria-describedby={fileError ? "texture-file-error" : undefined}
              onClick={() => fileInput.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault()
                if (!event.dataTransfer.types.includes("Files")) return
                dragDepth.current++
                setDragging(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = "copy"
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                dragDepth.current = Math.max(0, dragDepth.current - 1)
                if (!dragDepth.current) setDragging(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                dragDepth.current = 0
                setDragging(false)
                void chooseFile(event.dataTransfer.files)
              }}
            >
              {preview ? (
                <img
                  className="upload-preview"
                  src={preview}
                  alt="待上传材质"
                />
              ) : (
                <Inbox className="upload-icon" strokeWidth={1.5} />
              )}
              <span className="upload-title">
                {dragging
                  ? "松开即可选择图片"
                  : file
                    ? "点击或拖入以更换"
                    : "点击或拖拽图片到这里"}
              </span>
              <span className="upload-hint">
                PNG · 最大{" "}
                {Number((me.config.uploadBytes / 1048576).toFixed(2))} MiB
              </span>
            </button>
            {file && (
              <div className="upload-file" role="status">
                <FileImage className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate" title={file.name}>
                    {file.name}
                  </p>
                  <span className="upload-hint">
                    {Math.max(1, Math.round(file.size / 1024))} KB
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="移除图片"
                  onClick={clearFile}
                >
                  <X />
                </Button>
              </div>
            )}
            {fileError && (
              <p id="texture-file-error" className="form-error" role="alert">
                {fileError}
              </p>
            )}
          </div>
          <div className="form-stack">
            <InputField label="名称" name="name" required maxLength={64} />
            <SelectBox
              label="材质类型"
              value={kind}
              onChange={setKind}
              options={[
                { value: "skin", label: "皮肤" },
                { value: "cape", label: "披风" },
              ]}
            />
            {kind === "skin" && (
              <SelectBox
                label="模型"
                value={model}
                onChange={setModel}
                options={[
                  { value: "default", label: "标准手臂" },
                  { value: "slim", label: "纤细手臂" },
                ]}
              />
            )}
            <label className="flex items-center gap-2">
              <Checkbox checked={isPublic} onCheckedChange={setPublic} />
              分享到公开皮肤库
            </label>
            <p className="form-hint">
              皮肤 64×64 或 64×32，披风 64×32
              <br />
              已装备材质可被其他玩家获取
            </p>
          </div>
        </div>
      </ActionForm>
    </Modal>
  )
}
export function TextureDetail() {
  const { id } = useParams(),
    query = useData<Texture>(`/textures/${id}`),
    me = useOutletContext<Me>(),
    navigate = useNavigate()
  const [apply, setApply] = useState(false),
    [report, setReport] = useState(false)
  if (query.isPending) return <Loading />
  if (query.error || !query.data) return <Failure error={query.error} />
  const texture = query.data,
    owner = texture.userId === me.user.id
  return (
    <>
      <Heading title={texture.name} back="/app/library" />
      <div className="detail-grid">
        <Suspense fallback={<Loading />}>
          <SkinPreview
            skin={
              texture.kind === "skin" ? `/textures/${texture.hash}` : undefined
            }
            cape={
              texture.kind === "cape" ? `/textures/${texture.hash}` : undefined
            }
            model={texture.model}
          />
        </Suspense>
        <div className="form-stack">
          <h2>{texture.name}</h2>
          <p className="muted">
            {texture.user?.name ?? "已注销用户"} ·{" "}
            {texture.kind === "skin" ? "皮肤" : "披风"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setApply(true)}>应用到角色</Button>
            <Button
              variant="outline"
              render={
                <a
                  href={`/textures/${texture.hash}`}
                  download={`${texture.name}.png`}
                />
              }
            >
              <Download />
              下载
            </Button>
            <Button
              variant="outline"
              disabled={!texture.public && !texture.favorites?.length}
              onClick={async () => {
                try {
                  await mutate(
                    `/textures/${id}/favorite`,
                    texture.favorites?.length ? "DELETE" : "POST"
                  )
                  await refresh()
                } catch (error) {
                  reportError(error)
                }
              }}
            >
              <Heart />
              {texture.favorites?.length ? "取消收藏" : "收藏"}
            </Button>
          </div>
          {owner && (
            <>
              <ActionForm
                onSubmit={async (data) => {
                  await mutate(`/textures/${id}`, "PATCH", {
                    name: data.get("name"),
                    ...(texture.kind === "skin" && texture.blob.height === 64
                      ? { model: data.get("model") }
                      : {}),
                  })
                  await refresh()
                }}
              >
                <InputField
                  label="名称"
                  name="name"
                  defaultValue={texture.name}
                  required
                  maxLength={64}
                />
                {texture.kind === "skin" && texture.blob.height === 64 && (
                  <div className="form-field">
                    <span>模型</span>
                    <SelectBox
                      label="模型"
                      name="model"
                      defaultValue={texture.model}
                      options={[
                        { value: "default", label: "标准手臂" },
                        { value: "slim", label: "纤细手臂" },
                      ]}
                    />
                  </div>
                )}
              </ActionForm>
              <Confirm
                title={texture.public ? "取消公开分享" : "公开分享"}
                description={
                  texture.public
                    ? "停止公开展示，已有收藏保留"
                    : "发布后立即显示在皮肤库"
                }
                action={async () => {
                  await mutate(`/textures/${id}`, "PATCH", {
                    public: !texture.public,
                  })
                  await refresh()
                }}
              />
              <Confirm
                title="从衣柜移除"
                description="材质停止公开展示，已装备的材质保持可用"
                action={async () => {
                  await mutate(`/textures/${id}`, "DELETE")
                  await refresh()
                  void navigate("/app/wardrobe")
                }}
              />
            </>
          )}
          {!owner && texture.public && (
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => setReport(true)}
            >
              <Flag />
              举报材质
            </Button>
          )}
        </div>
      </div>
      {apply && (
        <ApplyTexture texture={texture} close={() => setApply(false)} />
      )}
      <Modal title="举报材质" open={report} onOpenChange={setReport}>
        <ActionForm
          label="提交举报"
          onSubmit={async (data) => {
            await mutate(`/textures/${id}/report`, "POST", {
              reason: data.get("reason"),
            })
            setReport(false)
          }}
        >
          <label className="form-field">
            举报原因
            <Textarea name="reason" required minLength={2} maxLength={1000} />
          </label>
        </ActionForm>
      </Modal>
    </>
  )
}
function ApplyTexture({
  texture,
  close,
}: {
  texture: Texture
  close: () => void
}) {
  const query = useData<Page<Character>>("/characters?limit=100"),
    [selected, setSelected] = useState("")
  return (
    <Modal
      title="应用到角色"
      open
      onOpenChange={(v) => {
        if (!v) close()
      }}
    >
      <ActionForm
        label="应用"
        onSubmit={async () => {
          if (!selected) throw new Error("请选择角色")
          await mutate(`/characters/${selected}`, "PATCH", {
            [texture.kind === "skin" ? "skinId" : "capeId"]: texture.id,
          })
          await refresh()
          close()
        }}
      >
        <SelectBox
          label="角色"
          value={selected}
          onChange={setSelected}
          options={[
            { value: "", label: "选择角色" },
            ...(query.data?.items
              .filter((c) => !c.disabled)
              .map((c) => ({ value: c.id, label: c.name })) ?? []),
          ]}
        />
        {query.error && <Failure error={query.error} />}
      </ActionForm>
    </Modal>
  )
}
export function ServerTable({ items }: { items: GameServer[] }) {
  if (!items.length) return <Empty text="暂时没有服务器" />
  return (
    <div className="data-table-wrap">
      <table className="data-table server-table">
        <thead>
          <tr>
            <th>服务器名称</th>
            <th>状态</th>
            <th>版本</th>
            <th>在线人数</th>
            <th>服务器地址</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((server) => (
            <tr key={server.id}>
              <td>
                <Link to={`/app/servers/${server.id}`}>{server.name}</Link>
              </td>
              <td>
                <Status value={server.status} />
                {server.checkedAt && (
                  <p className="form-hint mt-1">
                    {new Date(server.checkedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    更新
                  </p>
                )}
              </td>
              <td>{server.version || "—"}</td>
              <td>
                {server.status === "online"
                  ? `${server.online} / ${server.maxPlayers}`
                  : "—"}
              </td>
              <td className="font-mono text-xs">{server.address}</td>
              <td>
                <CopyButton value={server.address} label="复制地址" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function ServersPage() {
  const query = useData<GameServer[]>("/servers")
  return (
    <>
      <Heading title="服务器" />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <ServerTable items={query.data ?? []} />
      )}
    </>
  )
}
export function ServerDetail() {
  const { id } = useParams(),
    query = useData<GameServer>(`/servers/${id}`)
  if (query.isPending) return <Loading />
  if (query.error || !query.data) return <Failure error={query.error} />
  const server = query.data
  return (
    <>
      <Heading title={server.name} back="/app/servers">
        <Status value={server.status} />
      </Heading>
      <div className="max-w-3xl">
        <p className="muted mb-5">{server.description}</p>
        <CopyValue value={server.address} label="服务器地址" className="mb-3" />
        <p className="form-hint mb-8">
          {server.version} · 最近查询{" "}
          {server.checkedAt
            ? new Date(server.checkedAt).toLocaleString("zh-CN")
            : "尚未查询"}
        </p>
        <h2>入服指南</h2>
        <div className="step">
          <span className="step-number">1</span>
          <div>
            <h3>添加认证地址</h3>
            <div className="mt-3">
              <LauncherConnect />
            </div>
          </div>
        </div>
        <div className="step">
          <span className="step-number">2</span>
          <div>
            <h3>登录角色</h3>
            <p className="muted">使用邮箱和游戏专用密码登录，然后选择角色</p>
            <Button
              className="mt-4"
              variant="outline"
              render={<Link to="/app/settings?tab=game" />}
            >
              管理游戏密码
            </Button>
          </div>
        </div>
        <div className="step">
          <span className="step-number">3</span>
          <div>
            <h3>加入服务器</h3>
            <p className="muted">启动对应版本，在多人游戏中添加服务器地址</p>
          </div>
        </div>
        {server.downloads?.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4">下载</h2>
            {server.downloads.map((link) => (
              <a
                className="inline-row"
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                {link.name}
                <Download className="size-4" />
              </a>
            ))}
          </section>
        )}
        {server.rules && (
          <section className="mt-8">
            <h2 className="mb-4">服务器规则</h2>
            <div className="markdown">
              <ReactMarkdown skipHtml>{server.rules}</ReactMarkdown>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
export function AnnouncementList({ items }: { items: Announcement[] }) {
  return items.length ? (
    <div>
      {items.map((item) => (
        <Link
          className="announcement-row"
          key={item.id}
          to={`/app/announcements/${item.id}`}
        >
          <span className="flex items-center gap-2">
            {item.pinned && <Pin className="muted size-3" />}
            {item.title}
          </span>
          <span className="muted flex items-center gap-5 text-xs">
            {date(item.publishedAt)}
            <ChevronRight className="size-4" />
          </span>
        </Link>
      ))}
    </div>
  ) : (
    <Empty text="暂无公告" />
  )
}
export function AnnouncementsPage() {
  const [params] = useSearchParams(),
    query = useData<Page<Announcement>>(`/announcements?${params}`)
  return (
    <>
      <Heading title="公告" />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <>
          <AnnouncementList items={query.data?.items ?? []} />
          {query.data && <Pagination data={query.data} />}
        </>
      )}
    </>
  )
}
export function PublicAnnouncement() {
  const { id } = useParams(),
    session = useData<Me>("/me")
  if (session.isPending) return <Loading />
  if (session.data) return <Navigate to={`/app/announcements/${id}`} replace />
  return <AnnouncementRead standalone />
}
export function AnnouncementRead({
  standalone = false,
}: {
  standalone?: boolean
}) {
  const { id } = useParams(),
    query = useData<Announcement>(`/public/announcements/${id}`),
    config = useData<Config>("/public/settings", standalone)
  return (
    <div className={standalone ? "reading" : undefined}>
      {query.isPending ? (
        <Loading />
      ) : query.error || !query.data ? (
        <Failure error={query.error} />
      ) : (
        <>
          <Heading title={query.data.title} back="/app/announcements" />
          <p className="muted mb-8">{date(query.data.publishedAt)}</p>
          <article className="markdown max-w-3xl">
            <ReactMarkdown skipHtml>{query.data.body}</ReactMarkdown>
          </article>
          {standalone && <SiteFooter config={config.data} />}
        </>
      )}
    </div>
  )
}
export function ClaimsPage() {
  const [params] = useSearchParams(),
    query = useData<Page<Claim>>(`/claims?${params}`),
    servers = useData<GameServer[]>("/servers"),
    [open, setOpen] = useState(false),
    [server, setServer] = useState("")
  return (
    <>
      <Heading title="旧角色认领" back="/app/characters">
        <Button onClick={() => setOpen(true)}>申请认领</Button>
      </Heading>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : query.data?.items.length ? (
        <>
          <div className="max-w-3xl">
            {query.data.items.map((claim) => (
              <div className="panel mb-4" key={claim.id}>
                <div className="section-head">
                  <h3>{claim.identity.originalName}</h3>
                  <Status value={claim.status} />
                </div>
                <p className="form-hint">
                  {claim.identity.serverKey} · {date(claim.createdAt)}
                </p>
                <p className="my-4 whitespace-pre-wrap">{claim.evidence}</p>
                {claim.resolution && (
                  <p className="muted">{claim.resolution}</p>
                )}
              </div>
            ))}
          </div>
          <Pagination data={query.data} />
        </>
      ) : (
        <Empty text="还没有认领申请" />
      )}
      <Modal title="申请认领旧角色" open={open} onOpenChange={setOpen}>
        <ActionForm
          label="提交申请"
          onSubmit={async (data) => {
            await mutate("/claims", "POST", {
              serverKey: server,
              name: data.get("name"),
              evidence: data.get("evidence"),
            })
            await refresh()
            setOpen(false)
          }}
        >
          <SelectBox
            label="来源服务器"
            value={server}
            onChange={setServer}
            options={[
              { value: "", label: "选择来源服务器" },
              ...(servers.data?.map((s) => ({ value: s.key, label: s.name })) ??
                []),
            ]}
          />
          <InputField label="旧角色名称" name="name" required />
          <label className="form-field">
            归属说明
            <Textarea
              name="evidence"
              required
              minLength={10}
              maxLength={3000}
              placeholder="提供可供管理员核实的历史信息"
            />
          </label>
        </ActionForm>
      </Modal>
    </>
  )
}
