import type { MarkerColors } from "./model"

export type ThemeName = "light" | "dark" | "custom"

export type CustomColors = MarkerColors & { background: string; accent: string }

const THEME_KEY = "my-list-theme"
const COLORS_KEY = "my-list-colors"

export const defaultColors: CustomColors = {
  background: "#1E2227",
  accent: "#E6EDF3",
  waiting: "#6E7781",
  today: "#57AB5A",
  late: "#F47067",
}

export function storedTheme(): ThemeName {
  try {
    const value = localStorage.getItem(THEME_KEY)
    if (value === "light" || value === "dark" || value === "custom") return value
  } catch {
    /* Storage can be blocked in a private window. */
  }
  return "dark"
}

export function storedColors(): CustomColors {
  try {
    const raw = localStorage.getItem(COLORS_KEY)
    if (!raw) return defaultColors
    const data = JSON.parse(raw) as Partial<CustomColors>
    return {
      background: colorOr(data.background, defaultColors.background),
      accent: colorOr(data.accent, defaultColors.accent),
      waiting: colorOr(data.waiting, defaultColors.waiting),
      today: colorOr(data.today, defaultColors.today),
      late: colorOr(data.late, defaultColors.late),
    }
  } catch {
    return defaultColors
  }
}

export function rememberTheme(theme: ThemeName) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* Storage can be blocked in a private window. */
  }
}

export function rememberColors(colors: CustomColors) {
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(colors))
  } catch {
    /* Storage can be blocked in a private window. */
  }
}

function colorOr(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

const DARK_INK = "#1f2328"
const LIGHT_INK = "#f6f8fa"

export function surfacePaint(background: string): {
  bar: string
  raised: string
  row: string
  line: string
  text: string
  textSoft: string
  muted: string
  faint: string
  warn: string
  danger: string
  warnBg: string
  scheme: "light" | "dark"
} {
  const light = readableInk([background]) === DARK_INK
  const toward = light ? DARK_INK : "#ffffff"
  const lift = (amount: number) => mix(background, toward, amount)
  const bar = lift(light ? 0.04 : 0.03)
  const raised = lift(light ? 0.07 : 0.075)
  const row = lift(light ? 0.04 : 0.055)
  const line = lift(light ? 0.2 : 0.12)
  const surfaces = [background, bar, raised, row]
  const text = readableInk(surfaces)
  return {
    bar,
    raised,
    row,
    line,
    text,
    textSoft: soften(text, background, surfaces, 4.5),
    muted: soften(text, background, surfaces, 3.5),
    faint: soften(text, background, surfaces, 3),
    warn: ensureContrast(light ? "#9a6700" : "#e3b341", surfaces, text),
    danger: ensureContrast(light ? "#d1242f" : "#f47067", surfaces, text),
    warnBg: mix(light ? "#fff8c5" : "#3d2e00", background, light ? 0.35 : 0.45),
    scheme: light ? "light" : "dark",
  }
}

export function accentPaint(accent: string, background: string): { accent: string; bg: string; ink: string } {
  return {
    accent,
    bg: mix(accent, background, 0.82),
    ink: readableInk([accent]),
  }
}

function readableInk(surfaces: string[]): string {
  return worstContrast(DARK_INK, surfaces) >= worstContrast(LIGHT_INK, surfaces) ? DARK_INK : LIGHT_INK
}

function worstContrast(ink: string, surfaces: string[]): number {
  return surfaces.reduce((lowest, surface) => Math.min(lowest, contrast(ink, surface)), Number.POSITIVE_INFINITY)
}

function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

function soften(ink: string, background: string, surfaces: string[], minimum: number): string {
  let chosen = ink
  for (let step = 1; step <= 12; step += 1) {
    const next = mix(ink, background, step * 0.06)
    if (worstContrast(next, surfaces) < minimum) break
    chosen = next
  }
  return chosen
}

function ensureContrast(color: string, surfaces: string[], ink: string): string {
  if (worstContrast(color, surfaces) >= 3) return color
  let chosen = color
  for (let step = 1; step <= 16; step += 1) {
    chosen = mix(color, ink, step * 0.06)
    if (worstContrast(chosen, surfaces) >= 3) break
  }
  return chosen
}

function mix(from: string, to: string, amount: number): string {
  const start = rgb(from)
  const end = rgb(to)
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function rgb(color: string): [number, number, number] {
  const hex = color.replace("#", "")
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
}
