import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { Editor, type Draft } from "./Editor"
import { Logo } from "./Logo"
import {
  addDays,
  dailyFilterLabel,
  dueMarker,
  formatMonthDay,
  formatToolbarDate,
  isoDate,
  scheduleLabel,
  todoFilterLabel,
  todoStillKept,
  visibleDailies,
  visibleTodos,
  type Daily,
  type DailyFilter,
  type DailySchedule,
  type OpenMenu,
  type Pane,
  type SourceId,
  type Step,
  type Todo,
  type TodoFilter,
} from "./model"
import { sampleDailies, sampleTodos } from "./sample"

const today = isoDate(new Date())
const toolbarDate = formatToolbarDate(new Date())

const dailyFilters: DailyFilter[] = ["remaining", "done", "all"]
const todoFilters: TodoFilter[] = ["now", "later", "overdue", "done"]

export function App() {
  const [source, setSource] = useState<SourceId>("local")
  const [pane, setPane] = useState<Pane>("dailies")
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [dailyFilter, setDailyFilter] = useState<DailyFilter>("remaining")
  const [todoFilter, setTodoFilter] = useState<TodoFilter>("now")
  const [dailies, setDailies] = useState<Daily[]>(sampleDailies)
  const [todos, setTodos] = useState<Todo[]>(() => sampleTodos.filter((item) => todoStillKept(item, today)))
  const [editor, setEditor] = useState<Draft | null>(null)
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({})
  const [dailiesWidth, setDailiesWidth] = useState(500)
  const [dragging, setDragging] = useState(false)
  const columnsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const close = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-menu-root]")) return
      setOpenMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null)
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [openMenu])

  function toggleMenu(menu: Exclude<OpenMenu, null>) {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  function toggleDaily(id: string) {
    setDailies((items) =>
      items.map((item) =>
        item.id === id ? { ...item, doneOn: item.doneOn === today ? null : today } : item,
      ),
    )
  }

  function toggleTodo(id: string) {
    setTodos((items) =>
      items.map((item) =>
        item.id === id ? { ...item, doneOn: item.doneOn ? null : today } : item,
      ),
    )
  }

  function openNewDaily() {
    setOpenMenu(null)
    setEditor({ mode: "daily", id: null, title: "", description: "", scheduleKind: "every-day", days: [], steps: [] })
  }

  function openNewTodo() {
    setOpenMenu(null)
    setEditor({ mode: "todo", id: null, title: "", description: "", start: null, due: addDays(today, 7), steps: [] })
  }

  function openDaily(item: Daily) {
    setOpenMenu(null)
    setEditor({
      mode: "daily",
      id: item.id,
      title: item.title,
      description: item.description,
      scheduleKind: item.schedule.kind,
      days: item.schedule.kind === "days" ? item.schedule.days : [],
      steps: item.steps.map((step) => ({ ...step })),
    })
  }

  function openTodo(item: Todo) {
    setOpenMenu(null)
    setEditor({
      mode: "todo",
      id: item.id,
      title: item.title,
      description: item.description,
      start: item.start,
      due: item.due,
      steps: item.steps.map((step) => ({ ...step })),
    })
  }

  function saveDraft(draft: Draft) {
    if (draft.mode === "daily") {
      const schedule: DailySchedule =
        draft.scheduleKind === "days"
          ? { kind: "days", days: [...draft.days].sort((a, b) => a - b) }
          : { kind: draft.scheduleKind }
      const next: Daily = {
        id: draft.id ?? crypto.randomUUID(),
        title: draft.title,
        description: draft.description,
        schedule,
        steps: draft.steps,
        doneOn: draft.id ? (dailies.find((item) => item.id === draft.id)?.doneOn ?? null) : null,
      }
      setDailies((items) => (draft.id ? items.map((item) => (item.id === draft.id ? next : item)) : [next, ...items]))
      if (!draft.id) setDailyFilter("remaining")
      setPane("dailies")
    } else {
      const previous = draft.id ? todos.find((item) => item.id === draft.id) : undefined
      const next: Todo = {
        id: draft.id ?? crypto.randomUUID(),
        title: draft.title,
        description: draft.description,
        start: draft.start,
        due: draft.due,
        steps: draft.steps,
        doneOn: previous?.doneOn ?? null,
      }
      setTodos((items) => (draft.id ? items.map((item) => (item.id === draft.id ? next : item)) : [next, ...items]))
      setTodoFilter(next.doneOn ? "done" : next.start !== null && next.start > today ? "later" : next.due < today ? "overdue" : "now")
      setPane("todos")
    }
    setEditor(null)
  }

  function toggleDailyStep(itemId: string, stepId: string) {
    setDailies((items) => items.map((item) => (item.id === itemId ? { ...item, steps: flipStep(item.steps, stepId) } : item)))
  }

  function toggleTodoStep(itemId: string, stepId: string) {
    setTodos((items) => items.map((item) => (item.id === itemId ? { ...item, steps: flipStep(item.steps, stepId) } : item)))
  }

  function toggleSteps(id: string) {
    setOpenSteps((current) => ({ ...current, [id]: !current[id] }))
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    const columns = columnsRef.current
    if (!columns) return
    event.preventDefault()
    const originX = event.clientX
    const originWidth = columns.querySelector(".pane-dailies")?.getBoundingClientRect().width ?? dailiesWidth
    setDragging(true)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const move = (ev: PointerEvent) => {
      const total = columns.getBoundingClientRect().width
      const next = Math.round(Math.min(Math.max(originWidth + ev.clientX - originX, 260), total - 260))
      setDailiesWidth(next)
    }
    const stop = () => {
      setDragging(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerup", stop)
    }
    document.addEventListener("pointermove", move)
    document.addEventListener("pointerup", stop)
  }

  function deleteDraft() {
    if (!editor?.id) return
    if (editor.mode === "daily") setDailies((items) => items.filter((item) => item.id !== editor.id))
    else setTodos((items) => items.filter((item) => item.id !== editor.id))
    setEditor(null)
  }

  const shownDailies = visibleDailies(dailies, dailyFilter, today)
  const shownTodos = visibleTodos(todos, todoFilter, today)

  return (
    <div className="app" data-pane={pane}>
      <header className="toolbar">
        <Logo />
        <span className="name">My List</span>
        <span className="vdiv" />
        <span className="toolbar-date">{toolbarDate}</span>
        <div className="source" data-menu-root="">
          <button
            type="button"
            className={openMenu === "source" ? "menu-btn on" : "menu-btn"}
            aria-expanded={openMenu === "source"}
            onClick={() => toggleMenu("source")}
          >
            Source <Caret />
          </button>
          {openMenu === "source" && (
            <div className="menu wide" role="menu">
              <div className="menu-label">One source at a time</div>
              <SourceOption
                title="Local file"
                detail="On this computer. This is the default."
                selected={source === "local"}
                onSelect={() => {
                  setSource("local")
                  setOpenMenu(null)
                }}
              />
              <SourceOption
                title="Google Drive"
                detail="Optional. One file in your Drive."
                selected={source === "drive"}
                onSelect={() => {
                  setSource("drive")
                  setOpenMenu(null)
                }}
              />
            </div>
          )}
        </div>
      </header>

      <div className="segment" role="tablist">
        <button
          type="button"
          className={pane === "dailies" ? "seg on" : "seg"}
          onClick={() => setPane("dailies")}
        >
          Dailies
        </button>
        <button
          type="button"
          className={pane === "todos" ? "seg on" : "seg"}
          onClick={() => setPane("todos")}
        >
          Todos
        </button>
      </div>

      <div className="phone-bar">
        <span className="when">{toolbarDate}</span>
        {pane === "dailies" ? (
          <FilterMenu
            menu="daily"
            open={openMenu === "daily"}
            label={dailyFilterLabel[dailyFilter]}
            onToggle={() => toggleMenu("daily")}
          >
            {dailyFilters.map((filter) => (
              <FilterOption
                key={filter}
                label={dailyFilterLabel[filter]}
                selected={dailyFilter === filter}
                onSelect={() => {
                  setDailyFilter(filter)
                  setOpenMenu(null)
                }}
              />
            ))}
          </FilterMenu>
        ) : (
          <FilterMenu
            menu="todo"
            open={openMenu === "todo"}
            label={todoFilterLabel[todoFilter]}
            onToggle={() => toggleMenu("todo")}
            note="Always ordered by due date"
          >
            {todoFilters.map((filter) => (
              <FilterOption
                key={filter}
                label={todoFilterLabel[filter]}
                selected={todoFilter === filter}
                onSelect={() => {
                  setTodoFilter(filter)
                  setOpenMenu(null)
                }}
              />
            ))}
          </FilterMenu>
        )}
        <button type="button" className="plus-btn" aria-label={pane === "dailies" ? "Add a daily" : "Add a todo"} onClick={pane === "dailies" ? openNewDaily : openNewTodo}>
          +
        </button>
      </div>

      <div className="columns" ref={columnsRef} style={{ "--dailies-width": `${dailiesWidth}px` } as CSSProperties}>
        <section className="pane pane-dailies">
          <div className="pane-head">
            <h1>Dailies</h1>
            <FilterMenu
              menu="daily"
              open={openMenu === "daily"}
              label={dailyFilterLabel[dailyFilter]}
              onToggle={() => toggleMenu("daily")}
            >
              {dailyFilters.map((filter) => (
                <FilterOption
                  key={filter}
                  label={dailyFilterLabel[filter]}
                  selected={dailyFilter === filter}
                  onSelect={() => {
                    setDailyFilter(filter)
                    setOpenMenu(null)
                  }}
                />
              ))}
            </FilterMenu>
            <button type="button" className="plus-btn" aria-label="Add a daily" onClick={openNewDaily}>
              +
            </button>
          </div>
          <ul className="rows">
            {shownDailies.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.doneOn === today ? "check on" : "check"}
                  aria-pressed={item.doneOn === today}
                  aria-label={item.doneOn === today ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
                  onClick={() => toggleDaily(item.id)}
                >
                  {item.doneOn === today && <CheckMark />}
                </button>
                <div className="item-body">
                  <button type="button" className="item" onClick={() => openDaily(item)}>
                    <span className="title">{item.title}</span>
                    {item.description && <span className="desc">{item.description}</span>}
                    <span className="tag">{scheduleLabel(item.schedule)}</span>
                  </button>
                  <StepsBlock
                    steps={item.steps}
                    open={openSteps[item.id] === true}
                    onToggleOpen={() => toggleSteps(item.id)}
                    onToggleStep={(stepId) => toggleDailyStep(item.id, stepId)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div
          className={dragging ? "splitter dragging" : "splitter"}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the lists"
          aria-valuenow={dailiesWidth}
          tabIndex={0}
          onPointerDown={startResize}
        />

        <section className="pane pane-todos">
          <div className="pane-head">
            <h1>Todos</h1>
            <FilterMenu
              menu="todo"
              open={openMenu === "todo"}
              label={todoFilterLabel[todoFilter]}
              onToggle={() => toggleMenu("todo")}
              note="Always ordered by due date"
            >
              {todoFilters.map((filter) => (
                <FilterOption
                  key={filter}
                  label={todoFilterLabel[filter]}
                  selected={todoFilter === filter}
                  onSelect={() => {
                    setTodoFilter(filter)
                    setOpenMenu(null)
                  }}
                />
              ))}
            </FilterMenu>
            <button type="button" className="plus-btn" aria-label="Add a todo" onClick={openNewTodo}>
              +
            </button>
          </div>
          <ul className="rows">
            {shownTodos.map((item) => {
              const marker = dueMarker(item.due, today, item.doneOn !== null)
              return (
              <li key={item.id}>
                <span className="marker" style={{ background: marker.color }} title={marker.label} />
                <button
                  type="button"
                  className={item.doneOn ? "check on" : "check"}
                  aria-pressed={item.doneOn !== null}
                  aria-label={item.doneOn ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
                  onClick={() => toggleTodo(item.id)}
                >
                  {item.doneOn && <CheckMark />}
                </button>
                <div className="item-body">
                  <button type="button" className="item" onClick={() => openTodo(item)}>
                    <span className="title">{item.title}</span>
                    {item.description && <span className="desc">{item.description}</span>}
                    <span className="dates">
                      {item.start && <span className="from">From {formatMonthDay(item.start)}</span>}
                      <span className="due">Due {formatMonthDay(item.due)}</span>
                    </span>
                  </button>
                  <StepsBlock
                    steps={item.steps}
                    open={openSteps[item.id] === true}
                    onToggleOpen={() => toggleSteps(item.id)}
                    onToggleStep={(stepId) => toggleTodoStep(item.id, stepId)}
                  />
                </div>
              </li>
              )
            })}
          </ul>
        </section>
      </div>
      {editor && (
        <Editor
          key={`${editor.mode}-${editor.id ?? "new"}`}
          initial={editor}
          onSave={saveDraft}
          onDelete={deleteDraft}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}

function flipStep(steps: Step[], stepId: string): Step[] {
  return steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step))
}

function StepsBlock({
  steps,
  open,
  onToggleOpen,
  onToggleStep,
}: {
  steps: Step[]
  open: boolean
  onToggleOpen: () => void
  onToggleStep: (stepId: string) => void
}) {
  if (steps.length === 0) return null
  const done = steps.filter((step) => step.done).length
  const label = done === 0 ? `${steps.length} ${steps.length === 1 ? "step" : "steps"}` : `${done}/${steps.length} steps`
  return (
    <>
      <button type="button" className="steps-toggle" aria-expanded={open} onClick={onToggleOpen}>
        <i className={open ? "caret" : "caret shut"} />
        {label}
      </button>
      {open && (
        <ul className="steps">
          {steps.map((step) => (
            <li key={step.id}>
              <button type="button" className="step" aria-pressed={step.done} onClick={() => onToggleStep(step.id)}>
                <span className={step.done ? "check on" : "check"} aria-hidden="true">
                  {step.done && <CheckMark />}
                </span>
                <span className={step.done ? "step-title done" : "step-title"}>{step.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Caret() {
  return <i className="caret" />
}

function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.2 8.2 L6.4 11.2 L12.8 4.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SourceOption({
  title,
  detail,
  selected,
  onSelect,
}: {
  title: string
  detail: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button type="button" className={selected ? "option on" : "option"} role="menuitemradio" aria-checked={selected} onClick={onSelect}>
      <span className="radio"><i /></span>
      <span>
        <span className="opt-title">{title}</span>
        <span className="opt-sub">{detail}</span>
      </span>
    </button>
  )
}

function FilterMenu({
  menu,
  open,
  label,
  onToggle,
  note,
  children,
}: {
  menu: "daily" | "todo"
  open: boolean
  label: string
  onToggle: () => void
  note?: string
  children: ReactNode
}) {
  return (
    <div className="filter" data-menu-root="">
      <button type="button" className={open ? "menu-btn on" : "menu-btn"} aria-expanded={open} onClick={onToggle}>
        {label} <Caret />
      </button>
      {open && (
        <div className="menu" role="menu" data-filter={menu}>
          {children}
          {note && <div className="menu-note">{note}</div>}
        </div>
      )}
    </div>
  )
}

function FilterOption({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button type="button" className={selected ? "option check-row on" : "option check-row"} role="menuitemradio" aria-checked={selected} onClick={onSelect}>
      <span className="tick">{selected ? "✓" : ""}</span>
      <span className="opt-title">{label}</span>
    </button>
  )
}
