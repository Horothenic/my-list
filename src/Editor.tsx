import { useEffect, useState } from "react"
import type { DailySchedule, MonthWeek, Step } from "./model"

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const OCCURRENCE = ["First", "Second", "Third", "Fourth", "Last"]

export type ScheduleKind = DailySchedule["kind"]

export type Draft =
  | {
      mode: "daily"
      id: string | null
      title: string
      description: string
      scheduleKind: ScheduleKind
      days: number[]
      monthDay: number
      monthWeek: MonthWeek
      monthWeekday: number
      steps: Step[]
      tags: string[]
    }
  | {
      mode: "todo"
      id: string | null
      title: string
      description: string
      start: string | null
      due: string
      steps: Step[]
      tags: string[]
    }

export function Editor({
  initial,
  catalog,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Draft
  catalog: string[]
  onSave: (draft: Draft) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [tagName, setTagName] = useState("")
  const [error, setError] = useState("")

  function addTag() {
    const name = tagName.trim()
    if (!name || draft.tags.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase())) return
    setDraft({ ...draft, tags: [...draft.tags, name] })
    setTagName("")
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  function save() {
    const title = draft.title.trim()
    if (!title) {
      setError("Add a title")
      return
    }
    if (draft.mode === "daily" && draft.scheduleKind === "days" && draft.days.length === 0) {
      setError("Pick at least one day")
      return
    }
    if (draft.mode === "todo" && !draft.due) {
      setError("Add a due date")
      return
    }
    if (draft.mode === "todo" && draft.start && draft.due < draft.start) {
      setError("The due date has to be on or after the start")
      return
    }
    const steps = draft.steps
      .map((step) => ({ ...step, title: step.title.trim() }))
      .filter((step) => step.title !== "")
    onSave({ ...draft, title, description: draft.description.trim(), steps })
  }

  const heading = draft.id === null ? (draft.mode === "daily" ? "New daily" : "New todo") : draft.mode === "daily" ? "Edit daily" : "Edit todo"

  return (
    <div className="scrim" onMouseDown={onClose}>
      <form
        className="editor"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <h2>{heading}</h2>
        <label>
          Title
          <input
            autoFocus
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>

        {draft.mode === "daily" ? (
          <div className="schedule">
            <label>
              Schedule
              <select
                value={draft.scheduleKind}
                onChange={(event) =>
                  setDraft({ ...draft, scheduleKind: event.target.value as ScheduleKind })
                }
              >
                <option value="every-day">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="days">Specific days</option>
                <option value="month-day">Day of the month</option>
                <option value="month-weekday">Weekday of the month</option>
              </select>
            </label>
            {draft.scheduleKind === "month-day" && (
              <label>
                Day
                <select
                  value={draft.monthDay}
                  onChange={(event) => setDraft({ ...draft, monthDay: Number(event.target.value) })}
                >
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.scheduleKind === "month-weekday" && (
              <div className="schedule-row">
                <label>
                  Week
                  <select
                    value={draft.monthWeek}
                    onChange={(event) => setDraft({ ...draft, monthWeek: Number(event.target.value) as MonthWeek })}
                  >
                    {OCCURRENCE.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Day
                  <select
                    value={draft.monthWeekday}
                    onChange={(event) => setDraft({ ...draft, monthWeekday: Number(event.target.value) })}
                  >
                    {WEEKDAY_NAMES.map((label, day) => (
                      <option key={label} value={day}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {draft.scheduleKind === "days" && (
              <div className="days">
                {DAY_LABELS.map((label, day) => {
                  const on = draft.days.includes(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      className={on ? "day on" : "day"}
                      aria-pressed={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          days: on ? draft.days.filter((value) => value !== day) : [...draft.days, day],
                        })
                      }
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="date-fields">
            <label>
              <span className="field-name">
                From <span className="optional">Optional</span>
              </span>
              <span className="date-line">
                <input
                  type="date"
                  value={draft.start ?? ""}
                  onChange={(event) => setDraft({ ...draft, start: event.target.value || null })}
                />
                {draft.start && (
                  <button
                    type="button"
                    className="step-remove"
                    aria-label="Clear from date"
                    onClick={() => setDraft({ ...draft, start: null })}
                  >
                    <RemoveIcon />
                  </button>
                )}
              </span>
            </label>
            <label>
              <span className="field-name">Due</span>
              <input
                type="date"
                value={draft.due}
                onChange={(event) => setDraft({ ...draft, due: event.target.value })}
              />
            </label>
          </div>
        )}

        <div className="steps-edit">
          <span className="steps-label">Steps</span>
          {draft.steps.map((step, index) => (
            <div className="step-edit" key={step.id}>
              <input
                aria-label={`Step ${index + 1}`}
                placeholder="Step"
                value={step.title}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.map((item) =>
                      item.id === step.id ? { ...item, title: event.target.value } : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="step-remove"
                aria-label={`Remove step ${index + 1}`}
                onClick={() =>
                  setDraft({ ...draft, steps: draft.steps.filter((item) => item.id !== step.id) })
                }
              >
                <RemoveIcon />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="add-step"
            onClick={() =>
              setDraft({
                ...draft,
                steps: [...draft.steps, { id: crypto.randomUUID(), title: "", done: false }],
              })
            }
          >
            + Add a step
          </button>
        </div>

        <span className="field-label">Tags</span>
        <div className="tag-picks">
          {[...new Set([...catalog, ...draft.tags])].map((tag) => (
            <button
              key={tag}
              type="button"
              className={draft.tags.includes(tag) ? "tag-pick on" : "tag-pick"}
              onClick={() =>
                setDraft({
                  ...draft,
                  tags: draft.tags.includes(tag) ? draft.tags.filter((item) => item !== tag) : [...draft.tags, tag],
                })
              }
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="tag-add">
          <input
            value={tagName}
            placeholder="New tag"
            onChange={(event) => setTagName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              addTag()
            }}
          />
          <button type="button" className="menu-btn" onClick={addTag}>
            Add
          </button>
        </div>

        {error && <p className="editor-error">{error}</p>}

        <div className="editor-actions">
          {draft.id !== null ? (
            <button type="button" className="text-danger" onClick={onDelete}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="editor-actions-right">
            <button type="button" className="menu-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="save-btn">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.2 4.2 L11.8 11.8 M11.8 4.2 L4.2 11.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

