import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react"
import { flushSync } from "react-dom"
import { parseListDocument, serializeList, type ListDocument } from "./document"
import {
  clearDriveToken,
  currentDriveToken,
  driveConfigured,
  driveNeedsSignIn,
  driveSignInCancelled,
  driveTokenForSave,
  loadGoogleIdentity,
  openDriveList,
  requestDriveToken,
  uploadDriveFile,
  type DriveSync,
} from "./drive"
import { Editor, type Draft } from "./Editor"
import { Logo } from "./Logo"
import { Settings } from "./Settings"
import {
  allowStoredFile,
  downloadList,
  filePickerAvailable,
  forgetListFile,
  loadLocal,
  loadLocalCopy,
  openListFile,
  persistLocal,
  pickerWasCancelled,
  readGrantedList,
  saveDriveLink,
  saveDriveSynced,
  saveListFile,
  saveSource,
  saveVisible,
  rememberEmptyList,
} from "./localStore"
import {
  dailyFilterLabel,
  dueMarker,
  formatMonthDay,
  formatToolbarDate,
  isoDate,
  itemTags,
  matchesTags,
  tagLabel,
  scheduleLabel,
  scheduledOn,
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
import { accentPaint, rememberColors, rememberTheme, storedColors, storedTheme, type CustomColors, type ThemeName } from "./theme"

const today = isoDate(new Date())
const NOTE_MS = 5000
const NOTE_EXIT_MS = 180
const HOLD_MS = 125
const CLOSE_MS = 280

type ActionNote = { id: number; pane: Pane; label: string; detail: string; undo: () => void }
type PendingDelete = { mode: "daily" | "todo"; id: string; title: string }
const toolbarDate = formatToolbarDate(new Date())
const PANE_KEY = "my-list-pane"
const DAILY_FILTER_KEY = "my-list-daily-filter"
const TODO_FILTER_KEY = "my-list-todo-filter"
const TAG_FILTER_KEY = "my-list-tag-filter"
const WIDTH_KEY = "my-list-dailies-width"
const REFRESH_EVERY_MS = 15_000

function storedPane(): Pane {
  try {
    return localStorage.getItem(PANE_KEY) === "todos" ? "todos" : "dailies"
  } catch {
    return "dailies"
  }
}

function storedDailyFilter(): DailyFilter {
  try {
    return localStorage.getItem(DAILY_FILTER_KEY) === "all" ? "all" : "due"
  } catch {
    return "due"
  }
}

function storedTodoFilter(): TodoFilter {
  try {
    const value = localStorage.getItem(TODO_FILTER_KEY)
    return value === "all" || value === "planned" ? value : "due"
  } catch {
    return "due"
  }
}

function storedDailiesWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY)
    const value = Number(raw)
    if (raw && Number.isFinite(value)) return Math.round(Math.min(Math.max(value, 260), 1600))
  } catch {
    /* Storage can be blocked in a private window. */
  }
  return 500
}

function rememberDailiesWidth(width: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(width))
  } catch {
    /* Storage can be blocked in a private window. */
  }
}

function storedTagFilter(): string[] {
  try {
    const raw = localStorage.getItem(TAG_FILTER_KEY)
    const data: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data.filter((item): item is string => typeof item === "string").map(tagLabel).filter((tag) => tag !== "") : []
  } catch {
    return []
  }
}

function catalogTags(doc: ListDocument): string[] {
  const fromItems = [...doc.dailies.flatMap((item) => itemTags(item)), ...doc.todos.flatMap((item) => itemTags(item))]
  const names = [...(Array.isArray(doc.tags) ? doc.tags : []), ...fromItems]
  const seen = new Set<string>()
  const tags: string[] = []
  for (const tag of names) {
    const label = tagLabel(tag)
    if (!label || seen.has(label)) continue
    seen.add(label)
    tags.push(label)
  }
  return tags
}

function scheduleFromDraft(draft: Extract<Draft, { mode: "daily" }>): DailySchedule {
  if (draft.scheduleKind === "days") return { kind: "days", days: [...draft.days].sort((a, b) => a - b) }
  if (draft.scheduleKind === "month-day") return { kind: "month-day", day: draft.monthDay }
  if (draft.scheduleKind === "month-weekday") return { kind: "month-weekday", week: draft.monthWeek, day: draft.monthWeekday }
  return { kind: draft.scheduleKind }
}

const dailyFilters: DailyFilter[] = ["all", "due"]
const todoFilters: TodoFilter[] = ["all", "due", "planned"]

export function App() {
  const [source, setSource] = useState<SourceId>("local")
  const [pane, setPane] = useState<Pane>(storedPane)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(storedTheme)
  const [colors, setColors] = useState<CustomColors>(storedColors)
  const [dailyFilter, setDailyFilter] = useState<DailyFilter>(storedDailyFilter)
  const [todoFilter, setTodoFilter] = useState<TodoFilter>(storedTodoFilter)
  const [selectedTags, setSelectedTags] = useState<string[]>(storedTagFilter)
  const [dailies, setDailies] = useState<Daily[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [storageNote, setStorageNote] = useState<string | null>(null)
  const [driveFileName, setDriveFileName] = useState<string | null>(null)
  const [, setDriveSignedIn] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [driveBanner, setDriveBanner] = useState<{ kind: "conflict" | "signin" | "error"; message: string } | null>(null)
  const [actionNote, setActionNote] = useState<ActionNote | null>(null)
  const [noteLeaving, setNoteLeaving] = useState(false)
  const noteExit = useRef(0)
  const noteLeavingRef = useRef(false)
  const dismissNoteRef = useRef<(id: number) => void>(() => {})
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const noteSeq = useRef(0)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true,
  )
  const [editor, setEditor] = useState<Draft | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sourceRef = useRef<SourceId>("local")
  const driveFileRef = useRef<{ id: string; name: string } | null>(null)
  const driveBaseRef = useRef<string | null>(null)
  const conflictRef = useRef(false)
  const pendingDriveDoc = useRef<ListDocument | null>(null)
  const lastSent = useRef<string | null>(null)
  const saveGen = useRef(0)
  const saveQueue = useRef(Promise.resolve())
  const connectingRef = useRef(false)
  const connectGen = useRef(0)
  const refreshingRef = useRef(false)
  const refreshFromSourceRef = useRef<(manual: boolean) => Promise<void>>(async () => {})
  const editorRef = useRef<Draft | null>(null)
  const pullRef = useRef<{ pane: Pane; id: number; y: number; pulling: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const [pull, setPull] = useState(0)
  const [pullPane, setPullPane] = useState<Pane | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const dailiesRef = useRef(dailies)
  const todosRef = useRef(todos)
  const tagsRef = useRef(tags)
  dailiesRef.current = dailies
  todosRef.current = todos
  tagsRef.current = tags
  editorRef.current = editor
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({})
  const [dailiesWidth, setDailiesWidth] = useState(storedDailiesWidth)
  const [dragging, setDragging] = useState(false)
  const columnsRef = useRef<HTMLDivElement>(null)
  const dailiesRowsRef = useRef<HTMLUListElement>(null)
  const todosRowsRef = useRef<HTMLUListElement>(null)
  const pendingExit = useRef<Record<string, number>>({})
  const closing = useRef(new Set<string>())
  const [leaving, setLeaving] = useState<Record<string, true>>({})

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

  useEffect(() => () => {
    window.clearTimeout(noteExit.current)
    for (const timer of Object.values(pendingExit.current)) window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!actionNote) return
    const id = actionNote.id
    const timer = window.setTimeout(() => dismissNoteRef.current(id), NOTE_MS)
    return () => window.clearTimeout(timer)
  }, [actionNote])

  useEffect(() => {
    if (!pendingDelete) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopImmediatePropagation()
      setPendingDelete(null)
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [pendingDelete])

  function listDocument(): ListDocument {
    return {
      version: 1,
      dailies: dailiesRef.current,
      todos: todosRef.current.filter((item) => todoStillKept(item, today)),
      tags: tagsRef.current,
    }
  }

  function applyDriveSync(sync: DriveSync, browserDoc: ListDocument) {
    saveGen.current += 1
    driveFileRef.current = sync.link
    setDriveFileName(sync.link.name)
    conflictRef.current = sync.kind === "conflict"
    if (sync.kind === "opened") {
      driveBaseRef.current = sync.base
      lastSent.current = sync.base
      showDocument(sync.document)
      setDriveBanner(null)
      void saveDriveSynced(sync.document, sync.link, sync.base)
      return
    }
    if (sync.kind === "in-sync") {
      driveBaseRef.current = sync.base
      lastSent.current = sync.base
      setDriveBanner(null)
      void saveDriveSynced(browserDoc, sync.link, sync.base)
      return
    }
    pendingDriveDoc.current = sync.document
    void saveVisible(browserDoc)
    void saveDriveLink(sync.link)
    setDriveBanner({ kind: "conflict", message: "This browser and Google Drive both have changes." })
  }

  async function refreshFromSource(manual: boolean) {
    if (refreshingRef.current || connectingRef.current || conflictRef.current || editorRef.current) return
    const currentText = serializeList(listDocument())
    if (lastSent.current !== null && currentText !== lastSent.current) return
    refreshingRef.current = true
    if (manual) setRefreshing(true)
    try {
      if (sourceRef.current === "drive") {
        const link = driveFileRef.current
        const token = currentDriveToken()
        if (!link || !token || sourceRef.current !== "drive" || editorRef.current) return
        const doc = listDocument()
        const started = serializeList(doc)
        const sync = await openDriveList(token, doc, link, driveBaseRef.current)
        if (sourceRef.current !== "drive" || editorRef.current || conflictRef.current) return
        if (serializeList(listDocument()) !== started) return
        applyDriveSync(sync, doc)
        return
      }
      const fresh = await readGrantedList()
      if (editorRef.current || sourceRef.current !== "local") return
      if (!fresh.document) {
        if (manual && fresh.needsPermission) setNeedsPermission(true)
        return
      }
      const latest = serializeList(listDocument())
      if (lastSent.current !== null && latest !== lastSent.current) return
      const text = serializeList(fresh.document)
      if (text === latest) return
      await persistLocal(fresh.document)
      lastSent.current = text
      showDocument(fresh.document)
    } catch (error) {
      if (manual && sourceRef.current === "drive" && currentDriveToken() && !driveNeedsSignIn(error)) {
        setDriveBanner({ kind: "error", message: driveErrorMessage(error, "Could not update from Google Drive.") })
      } else if (manual && sourceRef.current === "local") {
        setStorageNote("Could not update the list.")
      }
    } finally {
      refreshingRef.current = false
      if (manual) setRefreshing(false)
    }
  }
  refreshFromSourceRef.current = refreshFromSource

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  useEffect(() => {
    let cancel = false
    const fallback: ListDocument = {
      version: 1,
      dailies: sampleDailies,
      todos: sampleTodos.filter((item) => todoStillKept(item, today)),
      tags: [],
    }
    if (driveConfigured()) void loadGoogleIdentity().catch(() => undefined)
    loadLocal(fallback)
      .then(async (snapshot) => {
        if (cancel) return
        lastSent.current = serializeList(snapshot.document)
        sourceRef.current = snapshot.source
        driveFileRef.current = snapshot.driveFile
        driveBaseRef.current = snapshot.driveBase
        dailiesRef.current = snapshot.document.dailies
        todosRef.current = snapshot.document.todos.filter((item) => todoStillKept(item, today))
        tagsRef.current = catalogTags(snapshot.document)
        showDocument(snapshot.document)
        setFileName(snapshot.fileName)
        setNeedsPermission(snapshot.needsPermission)
        setSource(snapshot.source)
        setDriveFileName(snapshot.driveFile?.name ?? null)
        setLoaded(true)
        if (snapshot.source !== "drive") return
        if (!driveConfigured()) {
          setDriveBanner({ kind: "error", message: "Add a Google client ID to save to Google Drive." })
          return
        }
        const gen = ++connectGen.current
        connectingRef.current = true
        try {
          let token = currentDriveToken()
          if (!token) token = await requestDriveToken("")
          if (cancel || connectGen.current !== gen) return
          setDriveSignedIn(true)
          const saved = snapshot.document
          const sync = await openDriveList(token, saved, snapshot.driveFile, snapshot.driveBase)
          if (cancel || connectGen.current !== gen || sourceRef.current !== "drive") return
          applyDriveSync(sync, saved)
          if (
            sync.kind === "opened" &&
            saved.dailies.length + saved.todos.length === 0 &&
            sync.document.dailies.length + sync.document.todos.length > 0
          ) {
            setDriveBanner({ kind: "error", message: "Brought your list back from the previous copy on Google Drive." })
          }
        } catch (error) {
          if (cancel || connectGen.current !== gen) return
          if (currentDriveToken() && !driveNeedsSignIn(error)) {
            setDriveBanner({ kind: "error", message: driveErrorMessage(error, "Could not open Google Drive.") })
            return
          }
          clearDriveToken()
          setDriveSignedIn(false)
        } finally {
          if (connectGen.current === gen) connectingRef.current = false
        }
      })
      .catch(() => {
        if (cancel) return
        lastSent.current = serializeList(fallback)
        showDocument(fallback)
        setStorageNote("Could not open the saved list.")
        setLoaded(true)
      })
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    const doc: ListDocument = {
      version: 1,
      dailies,
      todos: todos.filter((item) => todoStillKept(item, today)),
      tags,
    }
    const text = serializeList(doc)
    if (text === lastSent.current) return
    const timer = window.setTimeout(() => {
      const gen = ++saveGen.current
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          while (connectingRef.current) await new Promise((resolve) => window.setTimeout(resolve, 40))
          if (saveGen.current !== gen) return
          const latest = listDocument()
          const latestText = serializeList(latest)
          try {
            if (sourceRef.current === "drive") {
              if (conflictRef.current) {
                await saveVisible(latest)
                return
              }
              const token = await driveTokenForSave()
              if (saveGen.current !== gen || sourceRef.current !== "drive") return
              const link = driveFileRef.current
              if (!token || !link) {
                await saveVisible(latest)
                setDriveSignedIn(false)
                setDriveBanner({ kind: "signin", message: "Sign in to Google Drive to save this list." })
                return
              }
              await uploadDriveFile(token, link.id, latest)
              if (saveGen.current !== gen || sourceRef.current !== "drive") return
              driveBaseRef.current = latestText
              await saveDriveSynced(latest, link, latestText)
              setDriveBanner(null)
              setDriveSignedIn(true)
            } else {
              const result = await persistLocal(latest)
              if (saveGen.current !== gen || sourceRef.current !== "local") return
              setFileName(result.fileName)
              setNeedsPermission(result.needsPermission)
              setStorageNote(null)
            }
            if (saveGen.current === gen) lastSent.current = latestText
            rememberEmptyList(latest.dailies.length === 0 && latest.todos.length === 0)
          } catch (error) {
            if (sourceRef.current === "drive") {
              await saveVisible(latest).catch(() => undefined)
              if (driveNeedsSignIn(error)) {
                setDriveSignedIn(false)
                setDriveBanner({ kind: "signin", message: "Sign in to Google Drive to save this list." })
              } else {
                setDriveBanner({ kind: "error", message: driveErrorMessage(error, "Could not save to Google Drive.") })
              }
              return
            }
            setStorageNote("Could not save the list.")
          }
        })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [loaded, dailies, todos, tags])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const root = document.documentElement
    if (theme === "custom") {
      const paint = accentPaint(colors.accent, colors.background)
      root.style.setProperty("--custom-bg", colors.background)
      root.style.setProperty("--accent", paint.accent)
      root.style.setProperty("--accent-bg", paint.bg)
      root.style.setProperty("--accent-ink", paint.ink)
    } else {
      root.style.removeProperty("--custom-bg")
      root.style.removeProperty("--accent")
      root.style.removeProperty("--accent-bg")
      root.style.removeProperty("--accent-ink")
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f6f8fa" : "#24292F")
    rememberTheme(theme)
  }, [theme, colors.background, colors.accent])

  useEffect(() => {
    rememberColors(colors)
  }, [colors])

  useEffect(() => {
    try {
      localStorage.setItem(DAILY_FILTER_KEY, dailyFilter)
      localStorage.setItem(TODO_FILTER_KEY, todoFilter)
      localStorage.setItem(TAG_FILTER_KEY, JSON.stringify(selectedTags))
    } catch {
      /* Storage can be blocked in a private window. */
    }
  }, [dailyFilter, todoFilter, selectedTags])

  useEffect(() => {
    try {
      localStorage.setItem(PANE_KEY, pane)
    } catch {
      /* Storage can be blocked in a private window. */
    }
  }, [pane])

  useEffect(() => {
    if (!loaded) return
    const update = () => {
      if (document.visibilityState !== "visible") return
      void refreshFromSourceRef.current(false)
    }
    const timer = window.setInterval(update, REFRESH_EVERY_MS)
    document.addEventListener("visibilitychange", update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", update)
    }
  }, [loaded])

  function showDocument(doc: ListDocument) {
    const nextTags = catalogTags(doc)
    tagsRef.current = nextTags
    setDailies(doc.dailies)
    setTodos(doc.todos.filter((item) => todoStillKept(item, today)))
    setTags(nextTags)
  }

  function driveDetail(): string {
    if (!driveConfigured()) return "Add a Google client ID to sign in. The list stays in the local file."
    if (connecting) return "Signing in…"
    if (source === "drive" && driveFileName) return driveFileName
    return "One my-list.json file in your Drive."
  }

  async function chooseLocal() {
    connectGen.current += 1
    connectingRef.current = false
    setConnecting(false)
    saveGen.current += 1
    sourceRef.current = "local"
    conflictRef.current = false
    pendingDriveDoc.current = null
    setSource("local")
    setDriveBanner(null)
    setOpenMenu(null)
    try {
      await saveSource("local")
      const copy = await loadLocalCopy()
      if (!copy) return
      lastSent.current = serializeList(copy.document)
      showDocument(copy.document)
      setFileName(copy.fileName)
      setNeedsPermission(copy.needsPermission)
    } catch {
      setStorageNote("Could not open the saved list.")
    }
  }

  async function connectDrive() {
    if (!driveConfigured()) {
      setStorageNote("Add a Google client ID to sign in.")
      return
    }
    const gen = ++connectGen.current
    connectingRef.current = true
    setConnecting(true)
    setStorageNote(null)
    try {
      const token = currentDriveToken() ?? (await requestDriveToken("select_account"))
      if (connectGen.current !== gen) return
      setDriveSignedIn(true)
      const doc = listDocument()
      const sync = await openDriveList(token, doc, driveFileRef.current, driveBaseRef.current)
      if (connectGen.current !== gen) return
      sourceRef.current = "drive"
      setSource("drive")
      await saveSource("drive")
      if (connectGen.current !== gen) return
      applyDriveSync(sync, doc)
      setOpenMenu(null)
    } catch (error) {
      if (connectGen.current === gen && !driveSignInCancelled(error)) setStorageNote(driveErrorMessage(error, "Could not open Google Drive."))
    } finally {
      if (connectGen.current === gen) {
        connectingRef.current = false
        setConnecting(false)
      }
    }
  }

  async function signOutOfDrive() {
    clearDriveToken()
    setDriveSignedIn(false)
    await chooseLocal()
  }

  async function keepBrowserList() {
    const link = driveFileRef.current
    if (!link) return
    try {
      const token = currentDriveToken() ?? (await requestDriveToken("select_account"))
      setDriveSignedIn(true)
      const doc = listDocument()
      await uploadDriveFile(token, link.id, doc)
      const base = serializeList(doc)
      saveGen.current += 1
      driveBaseRef.current = base
      lastSent.current = base
      conflictRef.current = false
      pendingDriveDoc.current = null
      setDriveBanner(null)
      await saveDriveSynced(doc, link, base)
    } catch (error) {
      if (!driveSignInCancelled(error)) setDriveBanner({ kind: "error", message: driveErrorMessage(error, "Could not save to Google Drive.") })
    }
  }

  async function useDriveFile() {
    const doc = pendingDriveDoc.current
    const link = driveFileRef.current
    if (!doc || !link) return
    const base = serializeList(doc)
    saveGen.current += 1
    driveBaseRef.current = base
    lastSent.current = base
    conflictRef.current = false
    pendingDriveDoc.current = null
    showDocument(doc)
    setDriveBanner(null)
    try {
      await saveDriveSynced(doc, link, base)
    } catch {
      setDriveBanner({ kind: "error", message: "Could not save to Google Drive." })
    }
  }

  function toggleMenu(menu: Exclude<OpenMenu, null>) {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  function dismissNote(id: number) {
    if (noteLeavingRef.current) return
    if (!motionOk()) {
      setActionNote((current) => (current?.id === id ? null : current))
      return
    }
    noteLeavingRef.current = true
    setNoteLeaving(true)
    noteExit.current = window.setTimeout(() => {
      noteLeavingRef.current = false
      setNoteLeaving(false)
      setActionNote((current) => (current?.id === id ? null : current))
    }, NOTE_EXIT_MS)
  }
  dismissNoteRef.current = dismissNote

  function showNote(pane: Pane, label: string, detail: string, undo: () => void) {
    window.clearTimeout(noteExit.current)
    noteLeavingRef.current = false
    setNoteLeaving(false)
    noteSeq.current += 1
    setActionNote({ id: noteSeq.current, pane, label, detail, undo })
  }

  function undoNote() {
    const current = actionNote
    if (!current) return
    dismissNote(current.id)
    current.undo()
  }

  function motionOk() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }

  function settleRows(list: HTMLUListElement | null, apply: () => void) {
    if (!list || !motionOk()) {
      apply()
      return
    }
    const before = new Map<string, number>()
    for (const child of list.children) {
      if (child instanceof HTMLElement && child.dataset.id) before.set(child.dataset.id, child.getBoundingClientRect().top)
    }
    apply()
    window.requestAnimationFrame(() => {
      for (const child of list.children) {
        if (!(child instanceof HTMLElement) || !child.dataset.id) continue
        const previous = before.get(child.dataset.id)
        if (previous == null) continue
        const shift = previous - child.getBoundingClientRect().top
        if (Math.abs(shift) < 1) continue
        child.style.transition = "none"
        child.style.transform = `translateY(${shift}px)`
        window.requestAnimationFrame(() => {
          child.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)"
          child.style.transform = ""
        })
      }
    })
  }

  function rowElements(list: HTMLUListElement) {
    return [...list.children].filter((child): child is HTMLLIElement => child instanceof HTMLLIElement)
  }

  function placeClosing(list: HTMLUListElement) {
    let offset = 0
    for (const child of rowElements(list)) {
      const rowId = child.dataset.id
      if (rowId && closing.current.has(rowId)) {
        child.style.opacity = "0"
        child.style.transform = ""
        offset += child.getBoundingClientRect().height
        continue
      }
      child.style.opacity = ""
      child.style.transform = offset > 0 ? `translateY(-${offset}px)` : ""
    }
  }

  function dropClosingStyles(list: HTMLUListElement | null) {
    if (!list) return
    for (const child of rowElements(list)) {
      child.style.transition = "none"
      child.style.transform = ""
      child.style.opacity = ""
    }
    list.getBoundingClientRect()
    for (const child of rowElements(list)) child.style.transition = ""
  }

  function listsWith(id: string) {
    return [dailiesRowsRef.current, todosRowsRef.current].filter(
      (list): list is HTMLUListElement => list?.querySelector(`[data-id="${CSS.escape(id)}"]`) != null,
    )
  }

  function cancelExit(id: string) {
    const timer = pendingExit.current[id]
    if (timer == null) return false
    window.clearTimeout(timer)
    delete pendingExit.current[id]
    closing.current.delete(id)
    setLeaving((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    for (const list of listsWith(id)) placeClosing(list)
    return true
  }

  function finishExit(id: string, list: HTMLUListElement | null, apply: () => void) {
    delete pendingExit.current[id]
    closing.current.delete(id)
    flushSync(() => {
      setLeaving((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      apply()
    })
    if (closing.current.size === 0) dropClosingStyles(list)
    else if (list) placeClosing(list)
  }

  function playExit(id: string, list: HTMLUListElement | null, apply: () => void) {
    setLeaving((current) => ({ ...current, [id]: true }))
    pendingExit.current[id] = window.setTimeout(() => {
      if (pendingExit.current[id] == null) return
      closing.current.add(id)
      if (list) placeClosing(list)
      pendingExit.current[id] = window.setTimeout(() => finishExit(id, list, apply), CLOSE_MS)
    }, HOLD_MS)
  }

  function toggleDaily(id: string, silent = false) {
    const item = dailies.find((entry) => entry.id === id)
    if (!item) return
    const completing = item.doneOn !== today
    const apply = () => {
      setDailies((items) =>
        items.map((entry) =>
          entry.id === id ? { ...entry, doneOn: entry.doneOn === today ? null : today } : entry,
        ),
      )
    }
    const leaves = completing && dailyFilter !== "all"
    if (!silent && leaves && motionOk()) {
      playExit(id, dailiesRowsRef.current, apply)
      showNote("dailies", "Done for today", item.title, () => {
        if (!cancelExit(id)) settleRows(dailiesRowsRef.current, () => toggleDaily(id, true))
      })
      return
    }
    if (!silent && !completing && dailyFilter !== "all" && motionOk()) settleRows(dailiesRowsRef.current, apply)
    else apply()
    if (!silent) showNote("dailies", completing ? "Done for today" : "Marked open", item.title, () => toggleDaily(id, true))
  }

  function toggleTodo(id: string, silent = false) {
    const item = todos.find((entry) => entry.id === id)
    if (!item) return
    const completing = item.doneOn === null
    const apply = () => {
      setTodos((items) =>
        items.map((entry) => (entry.id === id ? { ...entry, doneOn: entry.doneOn ? null : today } : entry)),
      )
    }
    const leaves = completing && todoFilter !== "all"
    if (!silent && leaves && motionOk()) {
      playExit(id, todosRowsRef.current, apply)
      showNote("todos", "Completed", item.title, () => {
        if (!cancelExit(id)) settleRows(todosRowsRef.current, () => toggleTodo(id, true))
      })
      return
    }
    if (!silent && !completing && todoFilter !== "all" && motionOk()) settleRows(todosRowsRef.current, apply)
    else apply()
    if (!silent) showNote("todos", completing ? "Completed" : "Marked open", item.title, () => toggleTodo(id, true))
  }

  function openNewDaily() {
    setOpenMenu(null)
    setEditor({
      mode: "daily",
      id: null,
      title: "",
      description: "",
      scheduleKind: "every-day",
      days: [],
      monthDay: 1,
      monthWeek: 1,
      monthWeekday: 4,
      steps: [],
      tags: [],
    })
  }

  function openNewTodo() {
    setOpenMenu(null)
    setEditor({ mode: "todo", id: null, title: "", description: "", start: null, due: today, steps: [], tags: [] })
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
      monthDay: item.schedule.kind === "month-day" ? item.schedule.day : 1,
      monthWeek: item.schedule.kind === "month-weekday" ? item.schedule.week : 1,
      monthWeekday: item.schedule.kind === "month-weekday" ? item.schedule.day : 4,
      steps: item.steps.map((step) => ({ ...step })),
      tags: itemTags(item),
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
      tags: itemTags(item),
    })
  }

  function rememberTags(names: string[]) {
    setTags((current) => {
      const next = [...current]
      for (const name of names.map(tagLabel)) {
        if (name && !next.includes(name)) next.push(name)
      }
      tagsRef.current = next
      return next
    })
  }

  function addCatalogTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    rememberTags([trimmed])
  }

  function renameTag(from: string, to: string) {
    const name = tagLabel(to)
    const previous = tagLabel(from)
    if (!name || name === previous) return
    const swap = (list: string[]) => {
      const next: string[] = []
      for (const tag of list.map((item) => (tagLabel(item) === previous ? name : tagLabel(item)))) {
        if (!next.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) next.push(tag)
      }
      return next
    }
    setTags((current) => {
      const next = swap(current)
      tagsRef.current = next
      return next
    })
    setDailies((items) => items.map((item) => ({ ...item, tags: swap(itemTags(item)) })))
    setTodos((items) => items.map((item) => ({ ...item, tags: swap(itemTags(item)) })))
    setSelectedTags((current) => swap(current))
  }

  function deleteTag(name: string) {
    const label = tagLabel(name)
    setTags((current) => {
      const next = current.filter((tag) => tagLabel(tag) !== label)
      tagsRef.current = next
      return next
    })
    setDailies((items) => items.map((item) => ({ ...item, tags: itemTags(item).filter((tag) => tag !== label) })))
    setTodos((items) => items.map((item) => ({ ...item, tags: itemTags(item).filter((tag) => tag !== label) })))
    setSelectedTags((current) => current.filter((tag) => tagLabel(tag) !== label))
  }

  function saveDraft(draft: Draft) {
    if (draft.mode === "daily") {
      const previous = draft.id ? dailies.find((item) => item.id === draft.id) : undefined
      const schedule = scheduleFromDraft(draft)
      const id = draft.id ?? crypto.randomUUID()
      const next: Daily = {
        id,
        title: draft.title,
        description: draft.description,
        schedule,
        steps: draft.steps,
        doneOn: previous?.doneOn ?? null,
        tags: draft.tags,
      }
      setDailies((items) => (draft.id ? items.map((item) => (item.id === draft.id ? next : item)) : [next, ...items]))
      rememberTags(draft.tags)
      if (!draft.id) setDailyFilter(scheduledOn(schedule, today) ? "due" : "all")
      setPane("dailies")
      showNote("dailies", "Saved", next.title, () => {
        if (previous) setDailies((items) => items.map((item) => (item.id === id ? previous : item)))
        else setDailies((items) => items.filter((item) => item.id !== id))
      })
    } else {
      const previous = draft.id ? todos.find((item) => item.id === draft.id) : undefined
      const id = draft.id ?? crypto.randomUUID()
      const next: Todo = {
        id,
        title: draft.title,
        description: draft.description,
        start: draft.start,
        due: draft.due,
        steps: draft.steps,
        doneOn: previous?.doneOn ?? null,
        tags: draft.tags,
      }
      setTodos((items) => (draft.id ? items.map((item) => (item.id === draft.id ? next : item)) : [next, ...items]))
      rememberTags(draft.tags)
      setTodoFilter(next.doneOn ? "all" : next.start !== null && next.start > today ? "planned" : "due")
      setPane("todos")
      showNote("todos", "Saved", next.title, () => {
        if (previous) setTodos((items) => items.map((item) => (item.id === id ? previous : item)))
        else setTodos((items) => items.filter((item) => item.id !== id))
      })
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
    let next = originWidth
    setDragging(true)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const move = (ev: PointerEvent) => {
      const total = columns.getBoundingClientRect().width
      next = Math.round(Math.min(Math.max(originWidth + ev.clientX - originX, 260), total - 260))
      setDailiesWidth(next)
    }
    const stop = () => {
      setDragging(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      rememberDailiesWidth(next)
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerup", stop)
    }
    document.addEventListener("pointermove", move)
    document.addEventListener("pointerup", stop)
  }

  async function chooseFile() {
    setStorageNote(null)
    try {
      if (!filePickerAvailable()) {
        fileInputRef.current?.click()
        return
      }
      const opened = await openListFile()
      if (!opened) return
      showDocument(opened.document)
      setFileName(opened.handle.name)
      setNeedsPermission(false)
      setOpenMenu(null)
    } catch (error) {
      if (pickerWasCancelled(error)) return
      setStorageNote(error instanceof Error && error.message === "invalid" ? "That file is not a My List file." : "Could not open that file.")
    }
  }

  async function saveAsFile() {
    setStorageNote(null)
    const doc: ListDocument = { version: 1, dailies, todos, tags }
    try {
      if (!filePickerAvailable()) {
        downloadList(doc, fileName)
        return
      }
      const handle = await saveListFile(doc)
      if (!handle) return
      setFileName(handle.name)
      setNeedsPermission(false)
      setOpenMenu(null)
    } catch (error) {
      if (pickerWasCancelled(error)) return
      setStorageNote("Could not save that file.")
    }
  }

  async function allowFile() {
    setStorageNote(null)
    try {
      const opened = await allowStoredFile()
      if (!opened) return
      showDocument(opened.document)
      setFileName(opened.handle.name)
      setNeedsPermission(false)
    } catch (error) {
      setStorageNote(error instanceof Error && error.message === "invalid" ? "That file is not a My List file." : "Could not open that file.")
    }
  }

  async function disconnectFile() {
    setStorageNote(null)
    try {
      await forgetListFile()
      setFileName(null)
      setNeedsPermission(false)
    } catch {
      setStorageNote("Could not disconnect that file.")
    }
  }

  async function installApp() {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === "accepted") setInstallEvent(null)
    setOpenMenu(null)
  }

  async function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const doc = parseListDocument(await file.text())
    if (!doc) {
      setStorageNote("That file is not a My List file.")
      return
    }
    showDocument(doc)
    setOpenMenu(null)
  }

  function deleteDraft() {
    if (!editor?.id) return
    setPendingDelete({ mode: editor.mode, id: editor.id, title: editor.title })
  }

  function confirmDelete() {
    if (!pendingDelete) return
    if (pendingDelete.mode === "daily") setDailies((items) => items.filter((item) => item.id !== pendingDelete.id))
    else setTodos((items) => items.filter((item) => item.id !== pendingDelete.id))
    setPendingDelete(null)
    setEditor(null)
  }

  function startPull(which: Pane, event: ReactPointerEvent<HTMLUListElement>) {
    if (event.button !== 0 || event.currentTarget.scrollTop > 0) return
    pullRef.current = { pane: which, id: event.pointerId, y: event.clientY, pulling: false }
  }

  function movePull(event: ReactPointerEvent<HTMLUListElement>) {
    const pullState = pullRef.current
    if (!pullState || pullState.id !== event.pointerId) return
    if (event.currentTarget.scrollTop > 0) {
      pullState.pulling = false
      setPull(0)
      return
    }
    const distance = event.clientY - pullState.y
    if (distance < 8) return
    if (!pullState.pulling) {
      pullState.pulling = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* The pointer can already be gone. The gesture still finishes on pointerup. */
      }
      setPullPane(pullState.pane)
    }
    setPull(Math.min(64, distance))
  }

  function endPull(event: ReactPointerEvent<HTMLUListElement>) {
    const pullState = pullRef.current
    if (!pullState || pullState.id !== event.pointerId) return
    pullRef.current = null
    const distance = event.clientY - pullState.y
    if (pullState.pulling) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 400)
    }
    setPull(0)
    if (pullState.pulling && distance >= 48) void refreshFromSource(true)
  }

  function ignorePullClick(event: ReactMouseEvent) {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  function refreshBar(which: Pane) {
    const active = pullPane === which && (pull > 0 || refreshing)
    if (!active) return null
    const label = refreshing ? "Updating…" : pull >= 48 ? "Release to update" : "Pull to update"
    return (
      <div className="refresh" style={{ height: refreshing ? 32 : pull }} aria-live="polite">
        <span>{label}</span>
      </div>
    )
  }

  const markerColors = theme === "custom" ? { waiting: colors.waiting, today: colors.today, late: colors.late } : undefined
  const shownDailies = visibleDailies(dailies, dailyFilter, today).filter((item) => matchesTags(item, selectedTags))
  const shownTodos = visibleTodos(todos, todoFilter, today).filter((item) => matchesTags(item, selectedTags))
  const localDetail = needsPermission
    ? "This file needs permission to save."
    : fileName
      ? fileName
      : "Saved in this browser until you choose a file."

  return (
    <div className="app" data-pane={pane}>
      <header className="toolbar">
        <Logo />
        <span className="name">My List</span>
        <span className="vdiv" />
        <span className="toolbar-date long">{toolbarDate}</span>
        <span className="toolbar-date short">{formatMonthDay(today)}</span>
        <div className="toolbar-actions">
          <div className="filter" data-menu-root="">
            <button
              type="button"
              className={openMenu === "filters" ? "menu-btn on" : "menu-btn"}
              aria-expanded={openMenu === "filters"}
              onClick={() => toggleMenu("filters")}
            >
              Filters
            </button>
            {openMenu === "filters" && (
              <div className="menu filters-menu" role="menu">
                <div className="menu-label">Dailies</div>
                {dailyFilters.map((filter) => (
                  <FilterOption
                    key={filter}
                    label={dailyFilterLabel[filter]}
                    selected={dailyFilter === filter}
                    onSelect={() => setDailyFilter(filter)}
                  />
                ))}
                <div className="menu-label">Todos</div>
                {todoFilters.map((filter) => (
                  <FilterOption
                    key={filter}
                    label={todoFilterLabel[filter]}
                    selected={todoFilter === filter}
                    onSelect={() => setTodoFilter(filter)}
                  />
                ))}
                <div className="menu-note">Finished ones stay for a week. Ordered by due date.</div>
                <div className="menu-label">Tags</div>
                <div className="filter-tags">
                  <button type="button" className={selectedTags.length === 0 ? "tag-choice on" : "tag-choice"} onClick={() => setSelectedTags([])}>
                    All
                  </button>
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={selectedTags.includes(tagLabel(tag)) ? "tag-choice on" : "tag-choice"}
                      aria-pressed={selectedTags.includes(tagLabel(tag))}
                      onClick={() =>
                        setSelectedTags((current) => {
                          const label = tagLabel(tag)
                          return current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
                        })
                      }
                    >
                      {tagLabel(tag)}
                    </button>
                  ))}
                </div>
                {tags.length === 0 && <div className="menu-note">Add tags from a task or from Settings.</div>}
              </div>
            )}
          </div>
          <button type="button" className="menu-btn" onClick={() => { setOpenMenu(null); setSettingsOpen(true) }}>
            Settings
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void onFileInput(event)} />
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

      <div className="columns" ref={columnsRef} style={{ "--dailies-width": `${dailiesWidth}px` } as CSSProperties}>
        <section className="pane pane-dailies">
          <div className="pane-head">
            <h1>Dailies</h1>
          </div>
          {refreshBar("dailies")}
          <ul
            ref={dailiesRowsRef}
            className="rows"
            onPointerDown={(event) => startPull("dailies", event)}
            onPointerMove={movePull}
            onPointerUp={endPull}
            onPointerCancel={endPull}
            onClickCapture={ignorePullClick}
          >
            {shownDailies.map((item) => (
              <li key={item.id} data-id={item.id} className={leaving[item.id] ? "leaving" : undefined}>
                <button
                  type="button"
                  className={item.doneOn === today || leaving[item.id] ? "check on" : "check"}
                  aria-pressed={item.doneOn === today || leaving[item.id] === true}
                  aria-label={item.doneOn === today ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
                  onClick={() => toggleDaily(item.id)}
                >
                  {(item.doneOn === today || leaving[item.id]) && <CheckMark />}
                </button>
                <div className="item-body">
                  <button type="button" className="item" onClick={() => openDaily(item)}>
                    <ItemTitle title={item.title} tags={item.tags} />
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
          {actionNote?.pane === "dailies" && (
            <div key={actionNote.id} className={noteLeaving ? "action-note leaving" : "action-note"} role="status">
              <span className="action-note-copy">
                <strong>{actionNote.label}</strong>
                <span>{actionNote.detail}</span>
              </span>
              <button type="button" onClick={undoNote}>Undo</button>
              <span className="action-note-meter" style={{ animationDuration: `${NOTE_MS}ms` }} aria-hidden="true" />
            </div>
          )}
          <button type="button" className="fab" aria-label="Add a daily" onClick={openNewDaily}>
            <PlusIcon />
          </button>
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
          </div>
          {refreshBar("todos")}
          <ul
            ref={todosRowsRef}
            className="rows"
            onPointerDown={(event) => startPull("todos", event)}
            onPointerMove={movePull}
            onPointerUp={endPull}
            onPointerCancel={endPull}
            onClickCapture={ignorePullClick}
          >
            {shownTodos.map((item) => {
              const marker = dueMarker(item.due, today, item.doneOn !== null, markerColors)
              return (
              <li key={item.id} data-id={item.id} className={leaving[item.id] ? "leaving" : undefined}>
                <span className="marker" style={{ background: marker.color }} title={marker.label} />
                <button
                  type="button"
                  className={item.doneOn || leaving[item.id] ? "check on" : "check"}
                  aria-pressed={item.doneOn !== null || leaving[item.id] === true}
                  aria-label={item.doneOn ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
                  onClick={() => toggleTodo(item.id)}
                >
                  {(item.doneOn || leaving[item.id]) && <CheckMark />}
                </button>
                <div className="item-body">
                  <button type="button" className="item" onClick={() => openTodo(item)}>
                    <ItemTitle title={item.title} tags={item.tags} />
                    {item.description && <span className="desc">{item.description}</span>}
                    <span className="dates">
                      {item.start && <span className="from">From {formatMonthDay(item.start)}</span>}
                      <span className="due" style={item.doneOn === null && (theme === "custom" || item.due <= today) ? { color: marker.color } : undefined}>
                        Due {formatMonthDay(item.due)}
                      </span>
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
          {actionNote?.pane === "todos" && (
            <div key={actionNote.id} className={noteLeaving ? "action-note leaving" : "action-note"} role="status">
              <span className="action-note-copy">
                <strong>{actionNote.label}</strong>
                <span>{actionNote.detail}</span>
              </span>
              <button type="button" onClick={undoNote}>Undo</button>
              <span className="action-note-meter" style={{ animationDuration: `${NOTE_MS}ms` }} aria-hidden="true" />
            </div>
          )}
          <button type="button" className="fab" aria-label="Add a todo" onClick={openNewTodo}>
            <PlusIcon />
          </button>
        </section>
      </div>
      {driveBanner && source === "drive" && (
        <div className="message-bar" role="status">
          <AlertIcon />
          <span className="message-text">{driveBanner.message}</span>
          {driveBanner.kind === "conflict" && (
            <>
              <button type="button" onClick={() => void keepBrowserList()}>
                Keep this list
              </button>
              <button type="button" onClick={() => void useDriveFile()}>
                Use the Drive file
              </button>
            </>
          )}
          {driveBanner.kind === "signin" && (
            <button type="button" onClick={() => void connectDrive()}>
              Sign in
            </button>
          )}
          {driveBanner.kind === "error" && driveConfigured() && (
            <button type="button" onClick={() => void connectDrive()}>
              Try again
            </button>
          )}
          {driveBanner.kind !== "conflict" && (
            <button type="button" className="dismiss" aria-label="Dismiss" onClick={() => setDriveBanner(null)}>
              <CloseIcon />
            </button>
          )}
        </div>
      )}
      {settingsOpen && (
        <Settings
          source={source}
          localDetail={localDetail}
          driveDetail={driveDetail()}
          connecting={connecting}
          fileName={fileName}
          driveNote={storageNote ?? ""}
          needsPermission={needsPermission}
          installLabel={!installed && installEvent ? "Add to Home Screen" : null}
          installHint={!installed && !installEvent ? homeScreenHint() : null}
          theme={theme}
          colors={colors}
          tags={tags}
          onTheme={setTheme}
          onColors={setColors}
          onAddTag={addCatalogTag}
          onRenameTag={renameTag}
          onDeleteTag={deleteTag}
          onChooseLocal={() => void chooseLocal()}
          onChooseFile={() => void chooseFile()}
          onNewFile={() => void saveAsFile()}
          onDisconnectFile={() => void disconnectFile()}
          onAllowFile={() => void allowFile()}
          onConnectDrive={() => void connectDrive()}
          onSignOut={() => void signOutOfDrive()}
          onInstall={() => void installApp()}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {editor && (
        <Editor
          key={`${editor.mode}-${editor.id ?? "new"}`}
          initial={editor}
          catalog={tags}
          onSave={saveDraft}
          onDelete={deleteDraft}
          onClose={() => {
            setPendingDelete(null)
            setEditor(null)
          }}
        />
      )}
      {pendingDelete && (
        <div className="picker" onMouseDown={() => setPendingDelete(null)}>
          <div
            className="picker-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-title">Delete this task?</h2>
            <p className="delete-detail">{pendingDelete.title}</p>
            <div className="picker-actions">
              <span />
              <div className="picker-actions-right">
                <button type="button" className="menu-btn" onClick={() => setPendingDelete(null)} autoFocus>
                  Cancel
                </button>
                <button type="button" className="text-danger" onClick={confirmDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemTitle({ title, tags }: { title: string; tags?: string[] }) {
  const labels = itemTags({ tags })
  return (
    <span className="title">
      {labels.map((tag) => (
        <span className="title-tag" key={tag}>{tag}</span>
      ))}
      {title}
    </span>
  )
}

function homeScreenHint(): string {
  if (/iphone|ipad|ipod/i.test(window.navigator.userAgent)) {
    return "On iPhone, use Share, then Add to Home Screen. The last list still opens offline."
  }
  return "Use the browser menu, then Add to Home Screen. The last list still opens offline."
}

function driveErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  if (error.message === "invalid") return "That Drive file is not a My List file."
  if (error.message === "forbidden") return "Google Drive refused the request. Enable the Drive API for this client."
  if (error.message === "missing-client") return "Add a Google client ID to sign in."
  if (error.message === "auth") return "Sign in to Google Drive to save this list."
  return fallback
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

function AlertIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.8 L14.4 13.2 H1.6 Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.1 V9.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.7" fill="currentColor" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.4 4.4 L11.6 11.6 M11.6 4.4 L4.4 11.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
      <path d="M8 3.25v9.5M3.25 8h9.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
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
