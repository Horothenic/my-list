import type { MarkerColors } from "./model"

export type ThemeName = "light" | "dark" | "custom"

export type CustomColors = MarkerColors & { background: string }

const THEME_KEY = "my-list-theme"
const COLORS_KEY = "my-list-colors"

export const defaultColors: CustomColors = {
  background: "#1E2227",
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
