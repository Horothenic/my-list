export type SourceId = "local" | "drive"

export type DailySchedule =
  | { kind: "every-day" }
  | { kind: "weekdays" }
  | { kind: "days"; days: number[] }

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
}

export type Todo = {
  id: string
  title: string
  description: string
  start: string
  due: string
  steps: Step[]
  doneOn: string | null
}

export type DailyFilter = "remaining" | "done" | "all"
export type TodoFilter = "now" | "later" | "overdue" | "done"
export type Pane = "dailies" | "todos"
export type OpenMenu = "source" | "daily" | "todo" | null

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

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
  return schedule.days.map((day) => DAY[day]).join(", ")
}

export function dueIsSoon(due: string, today: string): boolean {
  return due >= today && due <= addDays(today, 2)
}

export function visibleDailies(items: Daily[], filter: DailyFilter, today: string): Daily[] {
  if (filter === "done") return items.filter((item) => item.doneOn === today)
  if (filter === "remaining") return items.filter((item) => item.doneOn !== today)
  return items
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
    filter === "done"
      ? kept.filter((item) => item.doneOn !== null)
      : filter === "later"
        ? open.filter((item) => item.start > today)
        : filter === "overdue"
          ? open.filter((item) => item.due < today)
          : open.filter((item) => item.start <= today && item.due >= today)
  return [...list].sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
}

export const dailyFilterLabel: Record<DailyFilter, string> = {
  remaining: "Remaining",
  done: "Done today",
  all: "All",
}

export const todoFilterLabel: Record<TodoFilter, string> = {
  now: "Now",
  later: "Later",
  overdue: "Overdue",
  done: "Done",
}
