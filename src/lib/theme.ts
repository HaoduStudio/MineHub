export type Rgb = { r: number; g: number; b: number }
export type Oklch = { l: number; c: number; h: number }
export type BrandEntry = { primary: string; foreground: string }
export type Brand = { light: BrandEntry | null; dark: BrandEntry | null }
export type Grade = "aa" | "aa-large" | "fail"

export const LIGHT_BG = "#ffffff"
export const DARK_BG = "#161616"
export const INK = "#0a0a0a"
export const PAPER = "#fafafa"
export const AA_NORMAL = 4.5
export const AA_LARGE = 3
const DARK_TARGET_L = 0.78
const DARK_MAX_C = 0.16

export const PRESETS = [
  { label: "红", value: "#bf000f" },
  { label: "橙", value: "#c43e00" },
  { label: "琥珀", value: "#b55200" },
  { label: "绿", value: "#00813a" },
  { label: "翡翠", value: "#007857" },
  { label: "水鸭", value: "#00776e" },
  { label: "青", value: "#005f78" },
  { label: "蓝", value: "#1447e6" },
  { label: "靛", value: "#4f39f6" },
  { label: "紫罗兰", value: "#7008e7" },
  { label: "紫", value: "#8200d9" },
  { label: "粉", value: "#c2005c" },
  { label: "玫瑰", value: "#c1003a" },
  { label: "石", value: "#44403b" },
] as const

export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace(/^#/, "")
  const channel = (offset: number) =>
    Number.parseInt(value.slice(offset, offset + 2), 16) / 255
  return { r: channel(0), g: channel(2), b: channel(4) }
}

export function rgbToHex({ r, g, b }: Rgb) {
  const channel = (value: number) =>
    Math.round(clamp01(value) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const toLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
const toGamma = (value: number) =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055

export const relativeLuminance = ({ r, g, b }: Rgb) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

export function contrastRatio(a: string, b: string) {
  const left = relativeLuminance(hexToRgb(a))
  const right = relativeLuminance(hexToRgb(b))
  const [high, low] = left > right ? [left, right] : [right, left]
  return (high + 0.05) / (low + 0.05)
}

export function contrastGrade(ratio: number): Grade {
  if (ratio >= AA_NORMAL) return "aa"
  if (ratio >= AA_LARGE) return "aa-large"
  return "fail"
}

export const hexToOklch = (hex: string) => rgbToOklch(hexToRgb(hex))

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r),
    lg = toLinear(g),
    lb = toLinear(b)
  const l = Math.cbrt(
      0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
    ),
    m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb),
    s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(a, bAxis),
    h: ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360,
  }
}

function oklabToLinear(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

const inGamut = ({ r, g, b }: Rgb) =>
  r >= -1e-4 &&
  r <= 1 + 1e-4 &&
  g >= -1e-4 &&
  g <= 1 + 1e-4 &&
  b >= -1e-4 &&
  b <= 1 + 1e-4

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const at = (scale: number) =>
    oklabToLinear(l, cos * c * scale, sin * c * scale)
  let linear = at(1)
  if (!inGamut(linear)) {
    let low = 0
    let high = 1
    for (let step = 0; step < 34; step++) {
      const mid = (low + high) / 2
      if (inGamut(at(mid))) low = mid
      else high = mid
    }
    linear = at(low)
  }
  return {
    r: toGamma(clamp01(linear.r)),
    g: toGamma(clamp01(linear.g)),
    b: toGamma(clamp01(linear.b)),
  }
}

export const oklchToHex = (oklch: Oklch) => rgbToHex(oklchToRgb(oklch))

export function deriveDarkPrimary(lightHex: string) {
  const { c, h } = hexToOklch(lightHex)
  const chroma = Math.min(c, DARK_MAX_C)
  let target = DARK_TARGET_L
  let hex = oklchToHex({ l: target, c: chroma, h })
  while (contrastRatio(hex, DARK_BG) < AA_NORMAL && target < 0.98) {
    target = Math.min(0.98, target + 0.01)
    hex = oklchToHex({ l: target, c: chroma, h })
  }
  return hex
}

export const bestForeground = (backgroundHex: string) =>
  contrastRatio(INK, backgroundHex) >= contrastRatio(PAPER, backgroundHex)
    ? INK
    : PAPER

const entry = (primary: string): BrandEntry => ({
  primary,
  foreground: bestForeground(primary),
})

const normalize = (value: string) =>
  isHexColor(value) ? value.toLowerCase() : null

export function resolveBrand(lightHex: string, darkHex: string): Brand | null {
  const light = normalize(lightHex)
  const dark = normalize(darkHex) ?? (light ? deriveDarkPrimary(light) : null)
  if (!light && !dark) return null
  return { light: light ? entry(light) : null, dark: dark ? entry(dark) : null }
}

const brandVars = ({ primary, foreground }: BrandEntry) => ({
  "--primary": primary,
  "--primary-foreground": foreground,
  "--ring": primary,
})

const declarations = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(";")

export function brandCssText(lightHex: string, darkHex: string) {
  const brand = resolveBrand(lightHex, darkHex)
  if (!brand) return ""
  return [
    brand.light ? `:root:root{${declarations(brandVars(brand.light))}}` : "",
    brand.dark ? `:root:root.dark{${declarations(brandVars(brand.dark))}}` : "",
  ].join("")
}

const LIGHT_VARS: Record<string, string> = {
  "--background": "var(--color-white)",
  "--foreground": "var(--color-neutral-800)",
  "--card": "var(--color-white)",
  "--card-foreground": "var(--color-neutral-800)",
  "--popover": "var(--color-white)",
  "--popover-foreground": "var(--color-neutral-800)",
  "--primary": "var(--color-neutral-800)",
  "--primary-foreground": "var(--color-neutral-50)",
  "--secondary": "rgba(0, 0, 0, 0.04)",
  "--secondary-foreground": "var(--color-neutral-800)",
  "--muted": "rgba(0, 0, 0, 0.04)",
  "--muted-foreground":
    "color-mix(in srgb, var(--color-neutral-500) 90%, var(--color-black))",
  "--accent": "rgba(0, 0, 0, 0.04)",
  "--accent-foreground": "var(--color-neutral-800)",
  "--destructive": "var(--color-red-500)",
  "--destructive-foreground": "var(--color-red-700)",
  "--border": "rgba(0, 0, 0, 0.08)",
  "--input": "rgba(0, 0, 0, 0.1)",
  "--ring": "var(--color-neutral-400)",
  "--info": "var(--color-blue-500)",
  "--info-foreground": "var(--color-blue-700)",
  "--success": "var(--color-emerald-500)",
  "--success-foreground": "var(--color-emerald-700)",
  "--warning": "var(--color-amber-500)",
  "--warning-foreground": "var(--color-amber-700)",
  "--sidebar": "var(--color-neutral-50)",
  "--sidebar-foreground":
    "color-mix(in srgb, var(--color-neutral-800) 64%, var(--sidebar))",
  "--sidebar-primary": "var(--color-neutral-800)",
  "--sidebar-primary-foreground": "var(--color-neutral-50)",
  "--sidebar-accent": "rgba(0, 0, 0, 0.04)",
  "--sidebar-accent-foreground": "var(--color-neutral-800)",
  "--sidebar-border": "rgba(0, 0, 0, 0.06)",
  "--sidebar-ring": "var(--color-neutral-400)",
  "--code": "var(--color-white)",
  "--code-foreground": "var(--foreground)",
  "--code-highlight": "rgba(0, 0, 0, 0.04)",
}

export function buildThemeVars(lightHex: string, darkHex: string) {
  const brand = resolveBrand(lightHex, darkHex)
  return {
    light: brand?.light
      ? { ...LIGHT_VARS, ...brandVars(brand.light) }
      : LIGHT_VARS,
    dark: brand?.dark ? brandVars(brand.dark) : {},
  }
}
