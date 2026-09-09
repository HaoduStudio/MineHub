import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/api"
import { Layout } from "./components/layout"
import { BrandTheme } from "./components/brand-theme"
import { ToastProvider } from "./components/ui/toast"
import { Loading } from "./components/common"
import { AuthPage, TwoFactorPage, Entry, ErrorPage } from "./pages/auth"

const Overview = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.Overview }))
)
const Characters = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.CharactersPage }))
)
const Character = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.CharacterDetail }))
)
const Claims = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.ClaimsPage }))
)
const Library = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.LibraryPage }))
)
const Texture = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.TextureDetail }))
)
const Servers = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.ServersPage }))
)
const Server = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.ServerDetail }))
)
const Announcements = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.AnnouncementsPage }))
)
const ReadAnnouncement = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.AnnouncementRead }))
)
const PublicAnnouncement = lazy(() =>
  import("./pages/player").then((m) => ({ default: m.PublicAnnouncement }))
)
const Settings = lazy(() => import("./pages/settings"))
const AdminOverview = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AdminOverview }))
)
const AdminUsers = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AdminUsers }))
)
const AdminUser = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AdminUserDetail }))
)
const AdminCharacters = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AdminCharacters }))
)
const AdminTextures = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AdminTextures }))
)
const AdminServers = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AdminServers }))
)
const ServerEditor = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.ServerEditor }))
)
const AdminAnnouncements = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AdminAnnouncements }))
)
const AnnouncementEditor = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AnnouncementEditor }))
)
const AdminSettings = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AdminSettings }))
)
const Audit = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.AuditPage }))
)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandTheme />
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Entry />} />
              <Route
                path="/login"
                element={<AuthPage key="login" mode="login" />}
              />
              <Route
                path="/register"
                element={<AuthPage key="register" mode="register" />}
              />
              <Route
                path="/forgot-password"
                element={<AuthPage key="forgot" mode="forgot" />}
              />
              <Route
                path="/reset-password"
                element={<AuthPage key="reset" mode="reset" />}
              />
              <Route
                path="/verify-email"
                element={<AuthPage key="verify" mode="verify" />}
              />
              <Route path="/two-factor" element={<TwoFactorPage />} />
              <Route
                path="/announcements/:id"
                element={<PublicAnnouncement />}
              />
              <Route path="/403" element={<ErrorPage status={403} />} />
              <Route path="/app" element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="characters" element={<Characters />} />
                <Route path="characters/claims" element={<Claims />} />
                <Route path="characters/:id" element={<Character />} />
                <Route path="wardrobe" element={<Library wardrobe />} />
                <Route path="library" element={<Library />} />
                <Route path="library/:id" element={<Texture />} />
                <Route path="servers" element={<Servers />} />
                <Route path="servers/:id" element={<Server />} />
                <Route path="announcements" element={<Announcements />} />
                <Route
                  path="announcements/:id"
                  element={<ReadAnnouncement />}
                />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="/admin" element={<Layout admin />}>
                <Route index element={<AdminOverview />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/:id" element={<AdminUser />} />
                <Route path="characters" element={<AdminCharacters />} />
                <Route path="characters/:id" element={<Character admin />} />
                <Route path="textures" element={<AdminTextures />} />
                <Route path="servers" element={<AdminServers />} />
                <Route path="servers/:id" element={<ServerEditor />} />
                <Route path="announcements" element={<AdminAnnouncements />} />
                <Route
                  path="announcements/:id"
                  element={<AnnouncementEditor />}
                />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="audit" element={<Audit />} />
              </Route>
              <Route path="*" element={<ErrorPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
