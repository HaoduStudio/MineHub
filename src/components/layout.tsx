import { Suspense, useEffect } from "react"
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
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "./ui/menu"
import { Button } from "./ui/button"
import { useTheme } from "./theme-provider"
import { useData, type Me, ApiError, authRequest, queryClient } from "@/lib/api"
import { Loading, Failure, SelectBox, reportError } from "./common"

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
function Navigation({ me, admin }: { me: Me; admin: boolean }) {
  const location = useLocation(),
    navigate = useNavigate(),
    { setOpenMobile } = useSidebar()
  const { theme, setTheme } = useTheme()
  const base = admin ? "/admin" : "/app"
  const nav = admin ? adminNav : userNav
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-5 pt-6 pb-5">
        <Brand />
        <div className="mt-5">
          {me.user.role === "admin" ? (
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
          ) : (
            <div className="panel-label">用户面板</div>
          )}
        </div>
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
      <SidebarFooter className="gap-4 px-5 pb-5">
        <Menu>
          <MenuTrigger
            render={<Button variant="ghost" className="account-switch" />}
          >
            <span className="letter-avatar">
              {me.user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{me.user.name}</span>
            <ChevronsUpDown className="ml-auto" />
          </MenuTrigger>
          <MenuPopup>
            <MenuItem onClick={() => navigate("/app/settings")}>
              账户设置
            </MenuItem>
            <MenuItem
              onClick={async () => {
                try {
                  await authRequest("/sign-out", {})
                  queryClient.clear()
                  void navigate("/login")
                } catch (error) {
                  reportError(error)
                }
              }}
            >
              <LogOut />
              退出登录
            </MenuItem>
          </MenuPopup>
        </Menu>
        <SelectBox
          label="主题"
          value={theme}
          onChange={(v) => setTheme(v as "light" | "dark" | "system")}
          options={[
            { value: "light", label: "浅色模式" },
            { value: "dark", label: "深色模式" },
            { value: "system", label: "跟随系统" },
          ]}
        />
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
