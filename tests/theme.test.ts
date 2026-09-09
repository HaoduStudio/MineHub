import { describe, expect, it } from "vite-plus/test"
import {
  AA_NORMAL,
  DARK_BG,
  LIGHT_BG,
  PRESETS,
  bestForeground,
  brandCssText,
  buildThemeVars,
  contrastGrade,
  contrastRatio,
  deriveDarkPrimary,
  hexToOklch,
  isHexColor,
  oklchToHex,
  relativeLuminance,
  hexToRgb,
  resolveBrand,
} from "../src/lib/theme"

describe("WCAG contrast", () => {
  it("matches the published AA boundary greys", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.542, 2)
    expect(contrastRatio("#757575", "#ffffff")).toBeCloseTo(4.608, 2)
  })
  it("is symmetric and spans 1 to 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1)
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1)
    expect(contrastRatio("#1447e6", "#1447e6")).toBeCloseTo(1, 5)
  })
  it("grades against the AA thresholds", () => {
    expect(contrastGrade(4.5)).toBe("aa")
    expect(contrastGrade(4.49)).toBe("aa-large")
    expect(contrastGrade(3)).toBe("aa-large")
    expect(contrastGrade(2.99)).toBe("fail")
  })
})

describe("OKLCH conversion", () => {
  it("resolves Tailwind neutral-950 to the dark background base", () => {
    expect(oklchToHex({ l: 0.145, c: 0, h: 0 })).toBe("#0a0a0a")
    expect(relativeLuminance(hexToRgb(DARK_BG))).toBeCloseTo(0.00802, 4)
  })
  it("round-trips saturated, degenerate and out-of-gamut inputs", () => {
    for (const hex of [
      "#1447e6",
      "#ffffff",
      "#000000",
      "#0000ff",
      "#bf000f",
      "#44403b",
    ])
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
  })
  it("never yields NaN or out-of-range channels", () => {
    for (const l of [0, 0.5, 1])
      for (const c of [0, 0.2, 0.4])
        for (const h of [0, 137, 359]) {
          const hex = oklchToHex({ l, c, h })
          expect(isHexColor(hex), `oklch(${l} ${c} ${h}) → ${hex}`).toBe(true)
          const { r, g, b } = hexToRgb(hex)
          for (const channel of [r, g, b]) {
            expect(Number.isNaN(channel)).toBe(false)
            expect(channel).toBeGreaterThanOrEqual(0)
            expect(channel).toBeLessThanOrEqual(1)
          }
        }
  })
})

describe("deriveDarkPrimary", () => {
  it("preserves hue, targets L 0.78 and caps chroma", () => {
    const source = hexToOklch("#1447e6")
    const derived = hexToOklch(deriveDarkPrimary("#1447e6"))
    expect(derived.l).toBeCloseTo(0.78, 2)
    expect(derived.l).toBeGreaterThan(0.75)
    expect(derived.l).toBeLessThanOrEqual(0.99)
    expect(derived.c).toBeLessThanOrEqual(0.16 + 1e-3)
    expect(Math.abs(derived.h - source.h)).toBeLessThan(1)
  })
  it("clears AA against the dark background for every preset", () => {
    for (const preset of PRESETS) {
      const derived = deriveDarkPrimary(preset.value)
      expect(
        contrastRatio(derived, DARK_BG),
        `${preset.label} ${preset.value} → ${derived}`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    }
  })
  it("keeps achromatic inputs achromatic", () => {
    expect(hexToOklch(deriveDarkPrimary("#000000")).c).toBeLessThan(1e-4)
    expect(hexToOklch(deriveDarkPrimary("#ffffff")).c).toBeLessThan(1e-4)
  })
})

describe("bestForeground", () => {
  it("picks ink on light-derived dark primaries and paper on light primaries", () => {
    expect(bestForeground("#94b6ff")).toBe("#0a0a0a")
    expect(bestForeground("#b55200")).toBe("#fafafa")
    expect(bestForeground(LIGHT_BG)).toBe("#0a0a0a")
    expect(bestForeground(DARK_BG)).toBe("#fafafa")
  })
  it("every preset clears AA in both modes", () => {
    for (const preset of PRESETS) {
      const dark = deriveDarkPrimary(preset.value)
      expect(
        contrastRatio(bestForeground(preset.value), preset.value),
        `${preset.label} light`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
      expect(
        contrastRatio(bestForeground(dark), dark),
        `${preset.label} dark`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    }
  })
})

describe("resolveBrand", () => {
  it("leaves the neutral theme untouched when nothing is set", () => {
    expect(resolveBrand("", "")).toBeNull()
    expect(brandCssText("", "")).toBe("")
  })
  it("derives the dark entry when only the light colour is set", () => {
    const brand = resolveBrand("#1447e6", "")
    expect(brand?.light).toEqual({ primary: "#1447e6", foreground: "#fafafa" })
    expect(brand?.dark).toEqual({
      primary: deriveDarkPrimary("#1447e6"),
      foreground: "#0a0a0a",
    })
  })
  it("honours a manual dark override and normalises case", () => {
    const brand = resolveBrand("#1447E6", "#FF9689")
    expect(brand?.light?.primary).toBe("#1447e6")
    expect(brand?.dark?.primary).toBe("#ff9689")
  })
  it("emits only the dark section when the light colour is absent", () => {
    const brand = resolveBrand("", "#ff9689")
    expect(brand?.light).toBeNull()
    expect(brand?.dark?.primary).toBe("#ff9689")
    expect(brandCssText("", "#ff9689")).toBe(
      ":root:root.dark{--primary:#ff9689;--primary-foreground:#0a0a0a;--ring:#ff9689}"
    )
  })
  it("ignores malformed values instead of emitting broken CSS", () => {
    expect(resolveBrand("red", "#12345")).toBeNull()
    expect(resolveBrand("#1447e6", "nope")?.dark?.primary).toBe(
      deriveDarkPrimary("#1447e6")
    )
  })
})

describe("brandCssText", () => {
  it("boosts specificity so the boot style survives the cascade", () => {
    const css = brandCssText("#1447e6", "")
    expect(css).toContain(":root:root{--primary:#1447e6")
    expect(css).toContain(":root:root.dark{--primary:#94b6ff")
    expect(css).toContain("--primary-foreground:#fafafa")
    expect(css).toContain("--ring:#1447e6")
    expect(css.startsWith(":root:root{")).toBe(true)
  })
})

describe("buildThemeVars", () => {
  it("returns a full light reset so a preview can undo an inherited .dark", () => {
    const vars = buildThemeVars("", "")
    expect(vars.light["--background"]).toBe("var(--color-white)")
    expect(vars.light["--primary"]).toBe("var(--color-neutral-800)")
    expect(vars.dark).toEqual({})
  })
  it("emits browser-valid colours instead of Tailwind compile-time --alpha()", () => {
    const vars = buildThemeVars("", "")
    expect(vars.light["--muted"]).toBe("rgba(0, 0, 0, 0.04)")
    expect(vars.light["--border"]).toBe("rgba(0, 0, 0, 0.08)")
    expect(JSON.stringify(vars.light)).not.toContain("--alpha(")
  })
  it("overrides only the primary pair on the dark side", () => {
    const vars = buildThemeVars("#1447e6", "")
    expect(vars.light["--primary"]).toBe("#1447e6")
    expect(vars.light["--ring"]).toBe("#1447e6")
    expect(vars.light["--background"]).toBe("var(--color-white)")
    expect(vars.dark).toEqual({
      "--primary": "#94b6ff",
      "--primary-foreground": "#0a0a0a",
      "--ring": "#94b6ff",
    })
  })
})
