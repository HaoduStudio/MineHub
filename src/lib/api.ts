import { QueryClient, useQuery } from "@tanstack/react-query"
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, error) =>
        count < 2 && (!(error instanceof ApiError) || error.status >= 500),
      retryDelay: 1000,
      refetchOnWindowFocus: false,
    },
  },
})
export class ApiError extends Error {
  status: number
  fields?: Record<string, string[]>
  constructor(
    message: string,
    status: number,
    fields?: Record<string, string[]>
  ) {
    super(message)
    this.status = status
    this.fields = fields
  }
}
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码错误",
  EMAIL_NOT_VERIFIED: "请先验证邮箱",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "该邮箱已注册",
  INVALID_PASSWORD: "密码错误",
  INVALID_CODE: "验证码无效",
  INVALID_TWO_FACTOR_COOKIE: "验证已过期，请重新登录",
  PASSWORD_TOO_SHORT: "密码至少需要 12 位",
  INVALID_TOKEN: "链接已失效，请重新申请",
  USER_BANNED: "账户已封禁",
  INVALID_BACKUP_CODE: "恢复码无效",
}
export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData))
    headers.set("Content-Type", "application/json")
  headers.set("X-MineHub-Request", "1")
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers,
  })
  const result =
    response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok)
    throw new ApiError(
      messages[result?.code] ?? result?.message ?? "服务暂不可用，请稍后重试",
      response.status,
      result?.fields
    )
  return result as T
}
export const api = <T>(path: string, options?: RequestInit) =>
  request<T>(`/api/v1${path}`, options)
export const authRequest = <
  T = { status?: boolean; twoFactorRedirect?: boolean },
>(
  path: string,
  data?: unknown
) =>
  request<T>(
    `/api/auth${path}`,
    data === undefined ? {} : { method: "POST", body: JSON.stringify(data) }
  )
export const mutate = <T = unknown>(
  path: string,
  method: string,
  data?: unknown
) =>
  api<T>(path, {
    method,
    ...(data === undefined
      ? {}
      : { body: data instanceof FormData ? data : JSON.stringify(data) }),
  })
export const useData = <T>(path: string, enabled = true) =>
  useQuery({ queryKey: [path], queryFn: () => api<T>(path), enabled })
export const BRAND_QUERY_KEY = ["/public/settings", "brand"]
export const refresh = () => queryClient.invalidateQueries()
export type Page<T> = { items: T[]; total: number; page: number; limit: number }
export type User = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string
  banned: boolean
  twoFactorEnabled: boolean
  mustChangePassword: boolean
  featuredCharacterId?: string
  avatarKind: "upload" | "skin" | null
  avatarHash: string | null
  avatarTextureId: string | null
  createdAt: string
  banReason?: string
}
export type Config = {
  name: string
  description: string
  registrationOpen: boolean
  characterLimit: number
  uploadLimit: number
  uploadBytes: number
  migrationEnabled: boolean
  migrationReady: boolean
  maintenanceMessage: string
  authImageLight: string
  authImageDark: string
  authImageCacheMinutes: number
  themeColorLight: string
  themeColorDark: string
}
export type Me = {
  user: User
  avatarTextureHash: string | null
  adminVerified: boolean
  config: Config
}
export type Texture = {
  id: string
  name: string
  hash: string
  kind: "skin" | "cape"
  model: "default" | "slim"
  public: boolean
  removedAt: string | null
  userId: string
  user: User | null
  blob: { blocked: boolean; width: number; height: number }
  _count: { favorites: number }
  favorites?: { userId: string }[]
  createdAt: string
}
export type Character = {
  id: string
  name: string
  skin: Texture | null
  cape: Texture | null
  userId: string | null
  user?: User | null
  disabled: boolean
  deletedAt: string | null
  createdAt: string
  legacyIdentities: { serverKey: string; originalName: string }[]
}
export type GameServer = {
  id: string
  key: string
  name: string
  address: string
  queryHost: string
  queryPort: number
  version: string
  description: string
  rules: string
  downloads: { name: string; url: string }[]
  status: string
  online: number | null
  maxPlayers: number | null
  checkedAt: string | null
  hidden: boolean
  sort: number
}
export type Announcement = {
  id: string
  title: string
  body: string
  pinned: boolean
  publishedAt: string | null
  createdAt: string
}
export type Claim = {
  id: string
  user?: User
  identity: { originalName: string; serverKey: string; characterId: string }
  evidence: string
  status: string
  resolution: string | null
  createdAt: string
}
export type Report = {
  id: string
  texture: Texture
  user: User
  reason: string
  status: string
  resolution: string | null
  createdAt: string
}
export type Audit = {
  id: string
  actorId: string | null
  action: string
  target: string
  details: Record<string, unknown>
  createdAt: string
}
