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

export function surfacePaint(background: string): {
  bar: string
  raised: string
  row: string
  line: string
  text: string
  textSoft: string
  muted: string
  faint: string
  warnBg: string
  scheme: "light" | "dark"
} {
  const light = luminance(background) > 0.4
  const toward = light ? "#1f2328" : "#ffffff"
  const lift = (amount: number) => mix(background, toward, amount)
  return {
    bar: lift(light ? 0.04 : 0.03),
    raised: lift(light ? 0.07 : 0.075),
    row: lift(light ? 0.04 : 0.055),
    line: lift(light ? 0.2 : 0.12),
    text: light ? "#1f2328" : "#e6edf3",
    textSoft: light ? "#424a53" : "#c9d1d9",
    muted: light ? "#656d76" : "#9da7b3",
    faint: "#6e7781",
    warnBg: mix(light ? "#fff8c5" : "#3d2e00", background, light ? 0.35 : 0.45),
    scheme: light ? "light" : "dark",
  }
}

export function accentPaint(accent: string, background: string): { accent: string; bg: string; ink: string } {
  return {
    accent,
    bg: mix(accent, background, 0.82),
    ink: luminance(accent) > 0.45 ? "#1E2227" : "#ffffff",
  }
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
