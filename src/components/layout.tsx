import { Suspense, useEffect, useState } from "react"
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom"
import {
  Box,
  Home,
  UserRound,
  Shirt,
  Images,
  Server,
  Megaphone,
  Settings,
  UsersRound,
  ClipboardList,
  LogOut,
  ChevronsUpDown,
  ImageUp,
  Sun,
  Moon,
  MonitorSmartphone,
} from "lucide-react"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar"
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from "./ui/menu"
import { Button } from "./ui/button"
import { useTheme } from "./theme-provider"
import {
  useData,
  type Me,
  type Config,
  ApiError,
  authRequest,
  queryClient,
} from "@/lib/api"
import { Loading, Failure, SelectBox, Modal, reportError } from "./common"
import { AvatarEditor } from "./avatar-editor"
import { UserAvatar } from "./skin-preview"

const userNav = [
  ["概览", "", Home],
  ["我的角色", "/characters", UserRound],
  ["衣柜", "/wardrobe", Shirt],
  ["皮肤库", "/library", Images],
  ["服务器", "/servers", Server],
  ["公告", "/announcements", Megaphone],
  ["账户设置", "/settings", Settings],
] as const
const adminNav = [
  ["概览", "", Home],
  ["用户", "/users", UsersRound],
  ["角色", "/characters", UserRound],
  ["皮肤管理", "/textures", Shirt],
  ["服务器", "/servers", Server],
  ["公告", "/announcements", Megaphone],
  ["站点设置", "/settings", Settings],
  ["审计日志", "/audit", ClipboardList],
] as const
export function Brand() {
  return (
    <Link to="/" className="brand">
      <Box className="size-8" strokeWidth={1.5} />
      <span>MineHub</span>
    </Link>
  )
}
export function SiteFooter({
  config,
  className = "site-footer",
}: {
  config?: Config
  className?: string
}) {
  const icp = config?.icpNumber?.trim()
  const police = config?.policeNumber?.trim()
  if (!icp && !police) return null
  return (
    <div className={className}>
      {icp && (
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noreferrer noopener"
        >
          {icp}
        </a>
      )}
      {police && (
        <a
          href="https://beian.mps.gov.cn/"
          target="_blank"
          rel="noreferrer noopener"
        >
          {police}
        </a>
      )}
    </div>
  )
}
function Navigation({ me, admin }: { me: Me; admin: boolean }) {
  const location = useLocation(),
    navigate = useNavigate(),
    { setOpenMobile } = useSidebar()
  const { theme, setTheme } = useTheme()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const base = admin ? "/admin" : "/app"
  const nav = admin ? adminNav : userNav
  async function signOut() {
    try {
      await authRequest("/sign-out", {})
      queryClient.clear()
      void navigate("/login")
    } catch (error) {
      reportError(error)
    }
  }
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-5 pt-6 pb-5">
        <Brand />
        {me.user.role === "admin" && (
          <div className="mt-5">
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                  />
                }
              >
                <span>{admin ? "管理面板" : "用户面板"}</span>
                <ChevronsUpDown />
              </MenuTrigger>
              <MenuPopup align="start">
                <MenuItem
                  onClick={() => {
                    setOpenMobile(false)
                    void navigate(
                      sessionStorage.getItem("minehub:user-path") ?? "/app"
                    )
                  }}
                >
                  用户面板
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setOpenMobile(false)
                    void navigate(
                      sessionStorage.getItem("minehub:admin-path") ?? "/admin"
                    )
                  }}
                >
                  管理面板
                </MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="px-3">
        <SidebarMenu>
          {nav.map(([label, suffix, Icon]) => (
            <SidebarMenuItem key={label}>
              <SidebarMenuButton
                className="mine-nav-item"
                isActive={
                  suffix
                    ? location.pathname.startsWith(base + suffix)
                    : location.pathname === base
                }
                render={
                  <Link
                    to={base + suffix}
                    onClick={() => setOpenMobile(false)}
                  />
                }
              >
                <Icon />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-4">
        <SiteFooter config={me.config} className="sidebar-beian" />
        <div className="sidebar-account">
          <Menu>
            <MenuTrigger
              render={<Button variant="ghost" className="account-switch" />}
            >
              <UserAvatar user={me.user} skinHash={me.avatarTextureHash} />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium">
                  {me.user.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {me.user.email}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </MenuTrigger>
            <MenuPopup align="start" className="w-(--anchor-width)">
              <MenuItem onClick={() => navigate("/app/settings")}>
                <Settings />
                账户设置
              </MenuItem>
              <MenuItem onClick={() => setAvatarOpen(true)}>
                <ImageUp />
                头像设置
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => void signOut()}>
                <LogOut />
                退出登录
              </MenuItem>
            </MenuPopup>
          </Menu>
          <div className="sidebar-theme">
            {theme === "dark" ? (
              <Moon />
            ) : theme === "light" ? (
              <Sun />
            ) : (
              <MonitorSmartphone />
            )}
            <span>主题</span>
            <SelectBox
              label="主题"
              className="ml-auto w-28 min-w-0"
              value={theme}
              onChange={(v) => setTheme(v as "light" | "dark" | "system")}
              options={[
                { value: "light", label: "浅色模式" },
                { value: "dark", label: "深色模式" },
                { value: "system", label: "跟随系统" },
              ]}
            />
          </div>
        </div>
        <Modal
          title="头像设置"
          description="上传自定义头像，或使用角色皮肤的头部"
          open={avatarOpen}
          onOpenChange={setAvatarOpen}
        >
          <AvatarEditor me={me} />
        </Modal>
      </SidebarFooter>
    </Sidebar>
  )
}
export function Layout({ admin = false }: { admin?: boolean }) {
  const { data: me, isPending, error, refetch } = useData<Me>("/me"),
    location = useLocation()
  useEffect(() => {
    sessionStorage.setItem(
      `minehub:${admin ? "admin" : "user"}-path`,
      location.pathname + location.search
    )
  }, [admin, location.pathname, location.search])
  if (isPending) return <Loading />
  if (error instanceof ApiError && error.status === 401)
    return <Navigate to="/login" replace />
  if (error || !me)
    return <Failure error={error} retry={() => void refetch()} />
  if (me.user.mustChangePassword && location.pathname !== "/app/settings")
    return <Navigate to="/app/settings?tab=security" replace />
  if (admin && me.user.role !== "admin") return <Navigate to="/403" replace />
  if (admin && (!me.user.twoFactorEnabled || !me.adminVerified))
    return (
      <Navigate
        to={
          me.user.twoFactorEnabled
            ? "/two-factor?stepup=1"
            : "/two-factor?setup=1"
        }
        replace
      />
    )
  const base = admin ? "/admin" : "/app",
    nav = admin ? adminNav : userNav
  const title =
    [...nav]
      .reverse()
      .find(([, suffix]) => location.pathname.startsWith(base + suffix))?.[0] ??
    "概览"
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "232px" } as React.CSSProperties}
      className="isolate"
    >
      <Navigation me={me} admin={admin} />
      <SidebarInset className="min-w-0">
        <header className="topbar">
          <SidebarTrigger className="md:hidden" />
          <span>{admin ? "管理面板" : "用户面板"}</span>
          <span className="text-muted-foreground/50">/</span>
          <span>{title}</span>
        </header>
        {me.config.maintenanceMessage && (
          <div className="maintenance">{me.config.maintenanceMessage}</div>
        )}
        <div className="page-content">
          <Suspense fallback={<Loading />}>
            <Outlet context={me} />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
