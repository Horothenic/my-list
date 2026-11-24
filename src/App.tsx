import { useEffect, useState, type ReactNode } from "react"
import { Logo } from "./Logo"
import {
  addDays,
  dailyFilterLabel,
  dueIsSoon,
  formatMonthDay,
  formatToolbarDate,
  isoDate,
  scheduleLabel,
  todoFilterLabel,
  visibleDailies,
  visibleTodos,
  type Daily,
  type DailyFilter,
  type OpenMenu,
  type Pane,
  type SourceId,
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
  const [todos, setTodos] = useState<Todo[]>(sampleTodos)

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

  function addDaily() {
    setDailies((items) => [
      {
        id: crypto.randomUUID(),
        title: "New daily",
        description: "",
        schedule: { kind: "every-day" },
        doneOn: null,
      },
      ...items,
    ])
    setDailyFilter("remaining")
    setPane("dailies")
  }

  function addTodo() {
    setTodos((items) => [
      {
        id: crypto.randomUUID(),
        title: "New todo",
        description: "",
        start: today,
        due: addDays(today, 7),
        doneOn: null,
      },
      ...items,
    ])
    setTodoFilter("now")
    setPane("todos")
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
        <button type="button" className="plus-btn" aria-label={pane === "dailies" ? "Add a daily" : "Add a todo"} onClick={pane === "dailies" ? addDaily : addTodo}>
          +
        </button>
      </div>

      <div className="columns">
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
            <button type="button" className="plus-btn" aria-label="Add a daily" onClick={addDaily}>
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
                <span className="item">
                  <span className="title">{item.title}</span>
                  {item.description && <span className="desc">{item.description}</span>}
                  <span className="tag">{scheduleLabel(item.schedule)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

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
            <button type="button" className="plus-btn" aria-label="Add a todo" onClick={addTodo}>
              +
            </button>
          </div>
          <ul className="rows">
            {shownTodos.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.doneOn ? "check on" : "check"}
                  aria-pressed={item.doneOn !== null}
                  aria-label={item.doneOn ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
                  onClick={() => toggleTodo(item.id)}
                >
                  {item.doneOn && <CheckMark />}
                </button>
                <span className="item">
                  <span className="title">{item.title}</span>
                  {item.description && <span className="desc">{item.description}</span>}
                  <span className="dates">
                    <span className="from">From {formatMonthDay(item.start)}</span>
                    <span className={dueIsSoon(item.due, today) && !item.doneOn ? "due soon" : "due"}>
                      Due {formatMonthDay(item.due)}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
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
