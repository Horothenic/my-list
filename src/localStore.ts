import { parseListDocument, serializeList, type ListDocument } from "./document"

const DB_NAME = "my-list"
const STORE = "local"
const DOCUMENT_KEY = "document"
const HANDLE_KEY = "handle"

export const listFileTypes = [
  {
    description: "My List",
    accept: { "application/json": [".json"] },
  },
]

export type LocalSnapshot = {
  document: ListDocument
  fileName: string | null
  needsPermission: boolean
}

export function filePickerAvailable(): boolean {
  return typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function"
}

export async function loadLocal(fallback: ListDocument): Promise<LocalSnapshot> {
  const db = await openDb()
  try {
    const stored = await idbGet<ListDocument>(db, DOCUMENT_KEY)
    const handle = await idbGet<FileSystemFileHandle>(db, HANDLE_KEY)
    let document = stored ?? fallback
    let needsPermission = false
    if (handle) {
      const permission = await permissionState(handle)
      if (permission === "granted") {
        const parsed = await readHandle(handle)
        if (parsed) document = parsed
      } else {
        needsPermission = true
      }
    }
    return { document, fileName: handle?.name ?? null, needsPermission }
  } finally {
    db.close()
  }
}

export async function persistLocal(doc: ListDocument): Promise<{ fileName: string | null; needsPermission: boolean }> {
  const db = await openDb()
  let handle: FileSystemFileHandle | undefined
  try {
    await idbSet(db, DOCUMENT_KEY, doc)
    handle = await idbGet<FileSystemFileHandle>(db, HANDLE_KEY)
  } finally {
    db.close()
  }
  if (!handle) return { fileName: null, needsPermission: false }
  if ((await permissionState(handle)) !== "granted") return { fileName: handle.name, needsPermission: true }
  await writeHandle(handle, doc)
  return { fileName: handle.name, needsPermission: false }
}

export async function openListFile(): Promise<{ handle: FileSystemFileHandle; document: ListDocument } | null> {
  if (!window.showOpenFilePicker) return null
  const [handle] = await window.showOpenFilePicker({ multiple: false, types: listFileTypes })
  const document = await readHandle(handle)
  if (!document) throw new Error("invalid")
  await rememberHandle(handle)
  return { handle, document }
}

export async function saveListFile(doc: ListDocument): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) return null
  const handle = await window.showSaveFilePicker({ suggestedName: "my-list.json", types: listFileTypes })
  await writeHandle(handle, doc)
  await rememberHandle(handle)
  return handle
}

export async function allowStoredFile(): Promise<{ handle: FileSystemFileHandle; document: ListDocument } | null> {
  const db = await openDb()
  let handle: FileSystemFileHandle | undefined
  try {
    handle = await idbGet<FileSystemFileHandle>(db, HANDLE_KEY)
  } finally {
    db.close()
  }
  if (!handle?.requestPermission) return null
  const permission = await handle.requestPermission({ mode: "readwrite" })
  if (permission !== "granted") return null
  const document = await readHandle(handle)
  if (!document) throw new Error("invalid")
  return { handle, document }
}

export function downloadList(doc: ListDocument, fileName: string | null) {
  const blob = new Blob([serializeList(doc)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName && fileName.endsWith(".json") ? fileName : "my-list.json"
  link.click()
  URL.revokeObjectURL(url)
}

export function pickerWasCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

async function rememberHandle(handle: FileSystemFileHandle) {
  const db = await openDb()
  try {
    await idbSet(db, HANDLE_KEY, handle)
  } finally {
    db.close()
  }
}

async function readHandle(handle: FileSystemFileHandle): Promise<ListDocument | null> {
  const file = await handle.getFile()
  return parseListDocument(await file.text())
}

async function writeHandle(handle: FileSystemFileHandle, doc: ListDocument) {
  const writable = await handle.createWritable()
  await writable.write(serializeList(doc))
  await writable.close()
}

async function permissionState(handle: FileSystemFileHandle): Promise<PermissionState> {
  if (!handle.queryPermission) return "granted"
  return handle.queryPermission({ mode: "readwrite" })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

function idbSet(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
