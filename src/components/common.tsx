import { useId, useState, type FormEvent, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  Search,
  Inbox,
} from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Field, FieldLabel, FieldError } from "./ui/field"
import { Form } from "./ui/form"
import {
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "./ui/select"
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog"
import { toastManager } from "./ui/toast"
import { ApiError, type Page } from "@/lib/api"

export const date = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("zh-CN") : "—"
export const notify = (title = "已保存") =>
  toastManager.add({ title, type: "success", timeout: 2400 })
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试"
export const reportError = (error: unknown) =>
  toastManager.add({ title: errorMessage(error), type: "error" })
export function formText(form: FormData, name: string, fallback = "") {
  const value = form.get(name)
  return typeof value === "string" ? value : fallback
}
export function Heading({
  title,
  children,
  back,
}: {
  title: string
  children?: ReactNode
  back?: string
}) {
  return (
    <div className="page-heading">
      <div className="flex items-center gap-3">
        {back && (
          <Button
            render={<Link to={back} />}
            variant="ghost"
            size="icon"
            aria-label="返回"
          >
            <ArrowLeft />
          </Button>
        )}
        <h1>{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
export function Empty({
  text,
  children,
}: {
  text: string
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      <Inbox className="size-8 text-muted-foreground/60" />
      <p>{text}</p>
      {children}
    </div>
  )
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="size-5 animate-spin" />
      <span>正在加载</span>
    </div>
  )
}
export function Failure({
  error,
  retry,
}: {
  error: unknown
  retry?: () => void
}) {
  return (
    <div className="empty-state" role="alert">
      <p>{errorMessage(error)}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          重试
        </Button>
      )}
    </div>
  )
}
export function InputField({
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label: string }) {
  const id = useId()
  return (
    <Field className="form-field" name={props.name}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="text" {...props} />
      <FieldError />
    </Field>
  )
}
export function SelectBox({
  value,
  defaultValue,
  name,
  onChange,
  options,
  label = "选择",
  className = "",
}: {
  value?: string
  defaultValue?: string
  name?: string
  onChange?: (value: string) => void
  options: { value: string; label: string }[]
  label?: string
  className?: string
}) {
  return (
    <Select
      items={options}
      value={value}
      defaultValue={defaultValue}
      name={name}
      onValueChange={(v) => {
        if (v !== null) onChange?.(v)
      }}
    >
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  )
}
export function CopyButton({
  value,
  label,
}: {
  value: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      size={label ? "default" : "icon"}
      aria-label={label ?? "复制"}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          notify("已复制")
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toastManager.add({ title: "复制失败，请手动复制", type: "error" })
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {label}
    </Button>
  )
}
export function CopyValue({
  value,
  label,
  className = "",
}: {
  value: string
  label: string
  className?: string
}) {
  return (
    <div className={`copy-value ${className}`}>
      <Input value={value} readOnly aria-label={label} />
      <CopyButton value={value} />
    </div>
  )
}
export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    online: "在线",
    offline: "离线",
    unknown: "未查询",
    error: "查询失败",
    pending: "待处理",
    approved: "已通过",
    rejected: "已驳回",
    removed: "已下架",
    dismissed: "已忽略",
    active: "正常",
    banned: "已封禁",
    unverified: "未验证",
    admin: "管理员",
    user: "用户",
    public: "公开",
    private: "未公开",
    draft: "草稿",
    published: "已发布",
    disabled: "已停用",
  }
  return (
    <span className={`status status-${value}`}>
      <span className="status-dot" />
      {labels[value] ?? value}
    </span>
  )
}
export function Modal({
  title,
  description,
  open,
  onOpenChange,
  children,
  className,
  drawer = false,
}: {
  title: string
  description?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
  drawer?: boolean
}) {
  if (drawer)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetPopup className="w-full max-w-lg" side="right">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto px-6 pb-6">{children}</div>
        </SheetPopup>
      </Sheet>
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className={className ?? "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="px-6 pb-6">{children}</div>
      </DialogPopup>
    </Dialog>
  )
}
export function ActionForm({
  onSubmit,
  children,
  label = "保存",
  onDone,
  danger = false,
  success = "已保存",
}: {
  onSubmit: (data: FormData) => Promise<unknown>
  children: ReactNode
  label?: string
  onDone?: () => void
  danger?: boolean
  success?: string | false
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState<Record<string, string[]>>({})
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError("")
    setFields({})
    setBusy(true)
    try {
      await onSubmit(new FormData(event.currentTarget))
      if (success) notify(success)
      onDone?.()
    } catch (err) {
      setError(errorMessage(err))
      if (err instanceof ApiError) setFields(err.fields ?? {})
    } finally {
      setBusy(false)
    }
  }
  return (
    <Form
      errors={fields}
      className="form-stack"
      onSubmit={(e) => void submit(e)}
    >
      {children}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Button
          type="submit"
          loading={busy}
          variant={danger ? "destructive" : "default"}
        >
          {label}
        </Button>
      </div>
    </Form>
  )
}
export function Confirm({
  title,
  description,
  action,
  children,
}: {
  title: string
  description: string
  action: () => Promise<unknown>
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {children ?? title}
      </Button>
      <Modal
        title={title}
        description={description}
        open={open}
        onOpenChange={setOpen}
      >
        <ActionForm
          danger
          onSubmit={action}
          label="确认"
          onDone={() => setOpen(false)}
        >
          <div />
        </ActionForm>
      </Modal>
    </>
  )
}
export function TabsNav({
  tabs,
}: {
  tabs: { label: string; value: string }[]
}) {
  const [params, setParams] = useSearchParams()
  const active = params.get("tab") ?? tabs[0].value
  return (
    <nav className="tabs-nav" aria-label="页面分类">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.value}
          className={active === tab.value ? "active" : ""}
          aria-current={active === tab.value ? "page" : undefined}
          onClick={() => {
            const next = new URLSearchParams(params)
            next.set("tab", tab.value)
            next.delete("page")
            next.delete("q")
            setParams(next)
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
export function SearchBox({ placeholder = "搜索" }: { placeholder?: string }) {
  const [params, setParams] = useSearchParams()
  return (
    <form
      className="search-box"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const next = new URLSearchParams(params)
        next.set("q", formText(data, "q"))
        next.delete("page")
        setParams(next)
      }}
    >
      <Search className="size-4" />
      <Input
        name="q"
        key={params.get("q")}
        defaultValue={params.get("q") ?? ""}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <button type="submit" className="sr-only">
        搜索
      </button>
    </form>
  )
}
export function Pagination({
  data,
}: {
  data: Pick<Page<unknown>, "page" | "total" | "limit">
}) {
  const [params, setParams] = useSearchParams()
  const go = (page: number) => {
    const next = new URLSearchParams(params)
    next.set("page", String(page))
    setParams(next)
  }
  return (
    <div className="pagination">
      <span>共 {data.total} 条</span>
      <div className="flex items-center gap-2">
        <span className="mr-2">每页 {data.limit} 条</span>
        <Button
          variant="outline"
          size="icon"
          aria-label="上一页"
          disabled={data.page <= 1}
          onClick={() => go(data.page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="page-number">{data.page}</span>
        <Button
          variant="outline"
          size="icon"
          aria-label="下一页"
          disabled={data.page * data.limit >= data.total}
          onClick={() => go(data.page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
export function Filter({
  name,
  options,
  label,
}: {
  name: string
  options: { value: string; label: string }[]
  label: string
}) {
  const [params, setParams] = useSearchParams()
  return (
    <SelectBox
      label={label}
      className="w-36"
      value={params.get(name) ?? ""}
      options={options}
      onChange={(v) => {
        const next = new URLSearchParams(params)
        next.set(name, v)
        next.delete("page")
        setParams(next)
      }}
    />
  )
}
