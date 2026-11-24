import { useEffect, useState } from "react"
import type { DailySchedule, Step } from "./model"

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

export type ScheduleKind = DailySchedule["kind"]

export type Draft =
  | {
      mode: "daily"
      id: string | null
      title: string
      description: string
      scheduleKind: ScheduleKind
      days: number[]
      steps: Step[]
    }
  | {
      mode: "todo"
      id: string | null
      title: string
      description: string
      start: string
      due: string
      steps: Step[]
    }

export function Editor({
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Draft
  onSave: (draft: Draft) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState("")

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
    if (draft.mode === "todo" && (!draft.start || !draft.due)) {
      setError("Add a start date and a due date")
      return
    }
    if (draft.mode === "todo" && draft.due < draft.start) {
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
              </select>
            </label>
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
              Start
              <input
                type="date"
                value={draft.start}
                onChange={(event) => setDraft({ ...draft, start: event.target.value })}
              />
            </label>
            <label>
              Due
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
                ×
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

