import { useState } from "react"
import { GripVertical, Info } from "lucide-react"
import { Button } from "./ui/button"
import { CopyValue, notify, reportError } from "./common"
import { setLauncherDragData } from "@/lib/launcher"
import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip"

export function SupportedLaunchers() {
  const [open, setOpen] = useState(false)
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      受支持的启动器
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          closeOnClick={false}
          onClick={() => setOpen(true)}
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="受支持的启动器说明"
            />
          }
        >
          <Info className="size-4" />
        </TooltipTrigger>
        <TooltipPopup className="max-w-72 text-left text-[13px] leading-relaxed">
          中国大陆市场内大部分Java游戏启动器均支持，如 BakaXL v3/v4 、HMCL等
        </TooltipPopup>
      </Tooltip>
    </span>
  )
}

export function LauncherConnect() {
  const address = `${location.origin}/api/yggdrasil/`
  return (
    <div>
      <CopyValue value={address} label="认证地址" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="cursor-grab active:cursor-grabbing"
          draggable
          title="拖入启动器窗口；点击可复制认证地址"
          onDragStart={(event) =>
            setLauncherDragData(event.dataTransfer, address)
          }
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address)
              notify("认证地址已复制")
            } catch (error) {
              reportError(error)
            }
          }}
        >
          <GripVertical />
          拖入启动器
        </Button>
        <SupportedLaunchers />
      </div>
    </div>
  )
}
