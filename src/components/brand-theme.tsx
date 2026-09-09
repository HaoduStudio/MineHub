import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useDark } from "@/components/theme-provider"
import { api, BRAND_QUERY_KEY, type Config } from "@/lib/api"
import { DARK_BG, LIGHT_BG, brandCssText, resolveBrand } from "@/lib/theme"

const STYLE_ID = "minehub-brand"
const BOOT_STYLE_ID = "minehub-brand-boot"
const CACHE_KEY = "minehub-brand"

function applyBrand(config: Config | undefined, dark: boolean) {
  if (!config) return
  const css = brandCssText(config.themeColorLight, config.themeColorDark)
  const brand = resolveBrand(config.themeColorLight, config.themeColorDark)
  const meta = {
    light: brand?.light?.primary ?? LIGHT_BG,
    dark: brand?.dark?.primary ?? DARK_BG,
  }
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
  }
  style.textContent = css
  document.head.appendChild(style)
  document.getElementById(BOOT_STYLE_ID)?.remove()
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? meta.dark : meta.light)
  localStorage.setItem(CACHE_KEY, JSON.stringify({ css, meta }))
}

export function BrandTheme() {
  const { data } = useQuery({
    queryKey: BRAND_QUERY_KEY,
    queryFn: () => api<Config>("/public/settings", { cache: "no-store" }),
  })
  const dark = useDark()
  useEffect(() => {
    applyBrand(data, dark)
  }, [data, dark])
  return null
}
