import { useRef, useState } from "react"
import { ImageUp, Shirt, Trash2 } from "lucide-react"
import { Button } from "./ui/button"
import { Empty, Failure, Loading, notify, reportError } from "./common"
import { SkinHead, UserAvatar } from "./skin-preview"
import {
  mutate,
  refresh,
  useData,
  type Character,
  type Me,
  type Page,
  type Texture,
} from "@/lib/api"

export function AvatarEditor({ me }: { me: Me }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  async function run(action: () => Promise<unknown>, message: string) {
    if (busy) return
    setBusy(true)
    try {
      await action()
      await refresh()
      notify(message)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }
  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (input.current) input.current.value = ""
    if (!file) return
    const data = new FormData()
    data.append("file", file)
    await run(() => mutate("/me/avatar", "POST", data), "头像已更新")
  }
  return (
    <div className="avatar-editor">
      <div className="avatar-editor-head">
        <UserAvatar user={me.user} skinHash={me.avatarTextureHash} size={72} />
        <div className="avatar-actions">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => void upload(event.target.files)}
          />
          <Button loading={busy} onClick={() => input.current?.click()}>
            <ImageUp />
            上传图片
          </Button>
          <Button variant="outline" onClick={() => setPicking(!picking)}>
            <Shirt />
            选择角色 / 皮肤
          </Button>
          {me.user.avatarKind && (
            <Button
              variant="destructive-outline"
              loading={busy}
              onClick={() =>
                void run(() => mutate("/me/avatar", "DELETE"), "头像已移除")
              }
            >
              <Trash2 />
              移除
            </Button>
          )}
        </div>
      </div>
      <p className="form-hint">
        支持 PNG / JPG / WebP 图片，将自动裁剪为 256×256；
        也可以直接使用角色或皮肤库中皮肤的头部作为头像。
      </p>
      {picking && (
        <AvatarPicker
          me={me}
          onSelect={(textureId) =>
            run(
              () => mutate("/me/avatar/skin", "POST", { textureId }),
              "头像已更新"
            )
          }
        />
      )}
    </div>
  )
}
function AvatarPicker({
  me,
  onSelect,
}: {
  me: Me
  onSelect: (textureId: string) => Promise<void>
}) {
  const [tab, setTab] = useState<"character" | "skin">("character")
  const characters = useData<Page<Character>>(
    "/characters?limit=50",
    tab === "character"
  )
  const skins = useData<Page<Texture>>(
    "/textures?scope=mine&kind=skin&limit=50",
    tab === "skin"
  )
  const current = me.user.avatarKind === "skin" ? me.user.avatarTextureId : null
  const query = tab === "character" ? characters : skins
  const items =
    tab === "character"
      ? (characters.data?.items ?? []).map((item) => ({
          id: item.skin?.id ?? "",
          hash: item.skin?.hash,
          name: item.name,
        }))
      : (skins.data?.items ?? []).map((item) => ({
          id: item.id,
          hash: item.hash,
          name: item.name,
        }))
  return (
    <div className="avatar-picker">
      <nav className="tabs-nav" aria-label="头像来源">
        {(
          [
            ["character", "我的角色"],
            ["skin", "我的皮肤"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={tab === value ? "active" : ""}
            aria-current={tab === value ? "page" : undefined}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : items.length ? (
        <div className="avatar-grid">
          {items.map((item) => (
            <button
              type="button"
              key={item.id || item.name}
              disabled={!item.id}
              data-active={item.id === current || undefined}
              onClick={() => void onSelect(item.id)}
            >
              <SkinHead hash={item.hash} name={item.name} size={40} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <Empty text={tab === "character" ? "还没有角色" : "还没有皮肤"} />
      )}
    </div>
  )
}
