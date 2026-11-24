import type { Daily, DailySchedule, MonthWeek, Step, Todo } from "./model"

export type ListDocument = {
  version: 1
  dailies: Daily[]
  todos: Todo[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function serializeList(doc: ListDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}

export function parseListDocument(text: string): ListDocument | null {
  if (text.trim() === "") return { version: 1, dailies: [], todos: [] }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(data) || data.version !== 1) return null
  if (!Array.isArray(data.dailies) || !Array.isArray(data.todos)) return null
  const dailies: Daily[] = []
  for (const item of data.dailies) {
    const daily = parseDaily(item)
    if (!daily) return null
    dailies.push(daily)
  }
  const todos: Todo[] = []
  for (const item of data.todos) {
    const todo = parseTodo(item)
    if (!todo) return null
    todos.push(todo)
  }
  return { version: 1, dailies, todos }
}

function parseDaily(value: unknown): Daily | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return null
  const schedule = parseSchedule(value.schedule)
  const steps = parseSteps(value.steps)
  const doneOn = parseOptionalDate(value.doneOn)
  if (!schedule || !steps || doneOn === undefined) return null
  return {
    id: value.id,
    title: value.title,
    description: typeof value.description === "string" ? value.description : "",
    schedule,
    steps,
    doneOn,
  }
}

function parseTodo(value: unknown): Todo | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return null
  const start = value.start === null ? null : parseOptionalDate(value.start)
  const due = typeof value.due === "string" && DATE.test(value.due) ? value.due : null
  const steps = parseSteps(value.steps)
  const doneOn = parseOptionalDate(value.doneOn)
  if (start === undefined || !due || !steps || doneOn === undefined) return null
  return {
    id: value.id,
    title: value.title,
    description: typeof value.description === "string" ? value.description : "",
    start,
    due,
    steps,
    doneOn,
  }
}

function parseSchedule(value: unknown): DailySchedule | null {
  if (!isRecord(value)) return null
  if (value.kind === "every-day" || value.kind === "weekdays") return { kind: value.kind }
  if (value.kind === "month-day" && typeof value.day === "number" && value.day >= 1 && value.day <= 31) {
    return { kind: "month-day", day: value.day }
  }
  if (
    value.kind === "month-weekday" &&
    typeof value.week === "number" &&
    value.week >= 1 &&
    value.week <= 5 &&
    typeof value.day === "number" &&
    value.day >= 0 &&
    value.day <= 6
  ) {
    return { kind: "month-weekday", week: value.week as MonthWeek, day: value.day }
  }
  if (value.kind !== "days" || !Array.isArray(value.days)) return null
  const days = value.days.filter((day): day is number => typeof day === "number" && day >= 0 && day <= 6)
  return { kind: "days", days }
}

function parseSteps(value: unknown): Step[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const steps: Step[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.done !== "boolean") return null
    steps.push({ id: item.id, title: item.title, done: item.done })
  }
  return steps
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === "string" && DATE.test(value)) return value
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
