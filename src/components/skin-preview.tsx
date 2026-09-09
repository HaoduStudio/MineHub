import { useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, UserRound } from "lucide-react"
import { Button } from "./ui/button"
import type { User } from "@/lib/api"

export function SkinHead({
  hash,
  name,
  size = 40,
}: {
  hash?: string
  name: string
  size?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!hash) return
    const image = new Image()
    image.onload = () => {
      const ctx = ref.current?.getContext("2d")
      if (ctx) {
        ctx.clearRect(0, 0, 8, 8)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8)
        ctx.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8)
      }
    }
    image.src = `/textures/${hash}`
    return () => {
      image.onload = null
    }
  }, [hash])
  return hash ? (
    <canvas
      aria-label={name}
      ref={ref}
      width={8}
      height={8}
      className="skin-head"
      style={{ width: size, height: size }}
    />
  ) : (
    <span className="letter-avatar" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
export function UserAvatar({
  user,
  skinHash,
  size = 34,
}: {
  user: Pick<User, "name" | "avatarKind" | "avatarHash">
  skinHash?: string | null
  size?: number
}) {
  if (user.avatarKind === "upload" && user.avatarHash)
    return (
      <img
        src={`/avatars/${user.avatarHash}`}
        alt={user.name}
        className="user-avatar"
        style={{ width: size, height: size }}
      />
    )
  if (user.avatarKind === "skin" && skinHash)
    return <SkinHead hash={skinHash} name={user.name} size={size} />
  return (
    <span className="letter-avatar" style={{ width: size, height: size }}>
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  )
}
export function TextureThumbnail({
  hash,
  kind,
  src,
}: {
  hash: string
  kind: string
  src?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      const ctx = ref.current?.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, 64, 72)
      ctx.imageSmoothingEnabled = false
      if (kind === "cape") {
        ctx.drawImage(image, 1, 1, 10, 16, 12, 4, 40, 64)
        return
      }
      ctx.drawImage(image, 8, 8, 8, 8, 24, 4, 16, 16)
      ctx.drawImage(image, 40, 8, 8, 8, 24, 4, 16, 16)
      ctx.drawImage(image, 20, 20, 8, 12, 24, 20, 16, 24)
      ctx.drawImage(image, 44, 20, 4, 12, 16, 20, 8, 24)
      ctx.drawImage(image, 44, 20, 4, 12, 40, 20, 8, 24)
      ctx.drawImage(image, 4, 20, 4, 12, 24, 44, 8, 24)
      ctx.drawImage(
        image,
        image.height === 64 ? 20 : 4,
        image.height === 64 ? 52 : 20,
        4,
        12,
        32,
        44,
        8,
        24
      )
      if (image.height === 64) {
        ctx.drawImage(image, 20, 36, 8, 12, 24, 20, 16, 24)
        ctx.drawImage(image, 36, 52, 4, 12, 40, 20, 8, 24)
      }
    }
    image.src = src ?? `/textures/${hash}`
    return () => {
      image.onload = null
    }
  }, [hash, kind, src])
  return (
    <canvas
      width={64}
      height={72}
      ref={ref}
      className="texture-thumbnail"
      aria-label={kind === "skin" ? "皮肤预览" : "披风预览"}
    />
  )
}
export default function SkinPreview({
  skin,
  cape,
  model = "default",
  compact = false,
}: {
  skin?: string
  cape?: string
  model?: "default" | "slim"
  compact?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null)
  const viewer = useRef<import("skinview3d").SkinViewer | null>(null)
  const [failed, setFailed] = useState(false),
    [rotating, setRotating] = useState(false)
  useEffect(() => {
    if (!canvas.current || !skin) return
    let disposed = false
    const observer = new ResizeObserver(([entry]) => {
      viewer.current?.setSize(entry.contentRect.width, compact ? 300 : 440)
    })
    if (container.current) observer.observe(container.current)
    void import("skinview3d")
      .then(({ SkinViewer }) => {
        if (disposed || !canvas.current) return
        try {
          const instance = new SkinViewer({
            canvas: canvas.current,
            width: container.current?.clientWidth ?? 300,
            height: compact ? 300 : 440,
          })
          viewer.current = instance
          void instance.loadSkin(skin, { model }).catch(() => {
            if (!disposed) setFailed(true)
          })
          if (cape)
            void instance.loadCape(cape).catch(() => {
              if (!disposed) setFailed(true)
            })
          instance.zoom = 0.85
          instance.controls.enableZoom = false
          instance.controls.enablePan = false
          instance.playerObject.rotation.y = Math.PI / 7
          instance.autoRotate = false
        } catch {
          setFailed(true)
        }
      })
      .catch(() => setFailed(true))
    return () => {
      disposed = true
      observer.disconnect()
      viewer.current?.dispose()
      viewer.current = null
    }
  }, [skin, cape, model, compact])
  return (
    <div ref={container} className={`skin-preview ${compact ? "compact" : ""}`}>
      {skin && !failed ? (
        <canvas ref={canvas} aria-label="可拖动旋转的角色预览" />
      ) : (
        <div className="skin-fallback">
          {skin ? (
            <img src={skin} alt="二维皮肤预览" />
          ) : cape ? (
            <img src={cape} alt="披风展开预览" />
          ) : (
            <>
              <UserRound className="size-16" strokeWidth={1} />
              <span>尚未设置皮肤</span>
            </>
          )}
        </div>
      )}
      {skin && !failed && (
        <div className="preview-controls">
          <Button
            size="icon"
            variant="ghost"
            aria-label={rotating ? "暂停旋转" : "开始旋转"}
            onClick={() => {
              if (viewer.current) viewer.current.autoRotate = !rotating
              setRotating(!rotating)
            }}
          >
            {rotating ? <Pause /> : <Play />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="重置视角"
            onClick={() => {
              viewer.current?.resetCameraPose()
              setRotating(false)
              if (viewer.current) viewer.current.autoRotate = false
            }}
          >
            <RotateCcw />
          </Button>
        </div>
      )}
    </div>
  )
}
