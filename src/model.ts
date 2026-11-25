export type SourceId = "local" | "drive"

export type MonthWeek = 1 | 2 | 3 | 4 | 5

export type DailySchedule =
  | { kind: "every-day" }
  | { kind: "weekdays" }
  | { kind: "days"; days: number[] }
  | { kind: "month-day"; day: number }
  | { kind: "month-weekday"; week: MonthWeek; day: number }

export type Step = {
  id: string
  title: string
  done: boolean
}

export type Daily = {
  id: string
  title: string
  description: string
  schedule: DailySchedule
  steps: Step[]
  doneOn: string | null
  tags?: string[]
}

export type Todo = {
  id: string
  title: string
  description: string
  start: string | null
  due: string
  steps: Step[]
  doneOn: string | null
  tags?: string[]
}

export type DailyFilter = "all" | "due"
export type TodoFilter = "all" | "due" | "planned"
export type Pane = "dailies" | "todos"
export type OpenMenu = "filters" | null

export type MarkerColors = {
  waiting: string
  today: string
  late: string
}

export function itemTags(item: { tags?: string[] }): string[] {
  return item.tags ?? []
}

export function matchesTags(item: { tags?: string[] }, selected: string[]): boolean {
  if (selected.length === 0) return true
  return itemTags(item).some((tag) => selected.includes(tag))
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const OCCURRENCE = ["First", "Second", "Third", "Fourth", "Last"]

export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

export function formatMonthDay(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function formatToolbarDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

export function scheduleLabel(schedule: DailySchedule): string {
  if (schedule.kind === "every-day") return "Every day"
  if (schedule.kind === "weekdays") return "Weekdays"
  if (schedule.kind === "month-day") return `${ordinal(schedule.day)} of the month`
  if (schedule.kind === "month-weekday") return `${OCCURRENCE[schedule.week - 1]} ${WEEKDAY[schedule.day]}`
  return schedule.days.map((day) => DAY[day]).join(", ")
}

export function scheduledOn(schedule: DailySchedule, today: string): boolean {
  const date = parseIso(today)
  const weekday = date.getDay()
  if (schedule.kind === "every-day") return true
  if (schedule.kind === "weekdays") return weekday >= 1 && weekday <= 5
  if (schedule.kind === "days") return schedule.days.includes(weekday)
  if (schedule.kind === "month-day") return date.getDate() === schedule.day
  if (weekday !== schedule.day) return false
  if (schedule.week === 5) return parseIso(addDays(today, 7)).getMonth() !== date.getMonth()
  return Math.floor((date.getDate() - 1) / 7) + 1 === schedule.week
}

function ordinal(day: number): string {
  const teen = day % 100
  if (teen >= 11 && teen <= 13) return `${day}th`
  if (day % 10 === 1) return `${day}st`
  if (day % 10 === 2) return `${day}nd`
  if (day % 10 === 3) return `${day}rd`
  return `${day}th`
}

export function dueIsSoon(due: string, today: string): boolean {
  return due >= today && due <= addDays(today, 2)
}

type Rgb = [number, number, number]

const GREEN: Rgb = [87, 171, 90]
const AMBER: Rgb = [227, 179, 65]
const RED: Rgb = [244, 112, 103]

function mix(from: Rgb, to: Rgb, amount: number): string {
  const channels = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount))
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`
}

/** Gray until the due date arrives, green on the due day, then a week-long ramp to red. */
export function dueMarker(due: string, today: string, done: boolean, colors?: MarkerColors): { color: string; label: string } {
  if (colors) {
    if (done) return { color: colors.waiting, label: "Done" }
    if (due > today) return { color: colors.waiting, label: "Not due yet" }
    const late = daysLate(due, today)
    if (late <= 0) return { color: colors.today, label: "Due today" }
    if (late >= 7) return { color: colors.late, label: `${late} days overdue` }
    return { color: mix(rgb(colors.today), rgb(colors.late), late / 7), label: late === 1 ? "1 day overdue" : `${late} days overdue` }
  }
  if (done) return { color: "#6E7781", label: "Done" }
  if (due > today) return { color: "#6E7781", label: "Not due yet" }
  const late = daysLate(due, today)
  if (late <= 0) return { color: "#57AB5A", label: "Due today" }
  if (late >= 7) return { color: "#F47067", label: `${late} days overdue` }
  const color = late <= 3 ? mix(GREEN, AMBER, late / 3) : mix(AMBER, RED, (late - 3) / 4)
  return { color, label: late === 1 ? "1 day overdue" : `${late} days overdue` }
}

function daysLate(due: string, today: string): number {
  return Math.round((parseIso(today).getTime() - parseIso(due).getTime()) / 86_400_000)
}

function rgb(color: string): Rgb {
  const hex = color.replace("#", "")
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
}

export function visibleDailies(items: Daily[], filter: DailyFilter, today: string): Daily[] {
  if (filter === "all") return items
  return items.filter((item) => item.doneOn !== today && scheduledOn(item.schedule, today))
}

/** A finished todo stays through the 7th day after it was completed, then it is removed. */
export function todoStillKept(item: Todo, today: string): boolean {
  if (item.doneOn === null) return true
  return today <= addDays(item.doneOn, 7)
}

export function visibleTodos(items: Todo[], filter: TodoFilter, today: string): Todo[] {
  const kept = items.filter((item) => todoStillKept(item, today))
  const open = kept.filter((item) => item.doneOn === null)
  const list =
    filter === "all"
      ? kept
      : filter === "planned"
        ? open.filter((item) => item.start !== null && item.start > today)
        : open.filter((item) => item.start === null || item.start <= today)
  return [...list].sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
}

export const dailyFilterLabel: Record<DailyFilter, string> = {
  all: "All",
  due: "Due",
}

export const todoFilterLabel: Record<TodoFilter, string> = {
  all: "All",
  due: "Due",
  planned: "Planned",
}
