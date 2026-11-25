import { parseListDocument, serializeList, type ListDocument } from "./document"
import type { SourceId } from "./model"

const DB_NAME = "my-list"
const STORE = "local"
const DOCUMENT_KEY = "document"
const HANDLE_KEY = "handle"
const SOURCE_KEY = "source"
const LOCAL_DOCUMENT_KEY = "localDocument"
const DRIVE_FILE_KEY = "driveFile"
const DRIVE_BASE_KEY = "driveBase"

export type StoredDriveFile = { id: string; name: string }

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
  source: SourceId
  driveFile: StoredDriveFile | null
  driveBase: string | null
}

export type LocalCopy = {
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
    const source = parseSource(await idbGet<unknown>(db, SOURCE_KEY))
    let localDocument = await idbGet<ListDocument>(db, LOCAL_DOCUMENT_KEY)
    const driveFile = parseDriveFile(await idbGet<unknown>(db, DRIVE_FILE_KEY))
    const driveBaseValue = await idbGet<unknown>(db, DRIVE_BASE_KEY)
    const driveBase = typeof driveBaseValue === "string" ? driveBaseValue : null
    const handle = await idbGet<FileSystemFileHandle>(db, HANDLE_KEY)
    if (!localDocument && stored) {
      localDocument = stored
      await idbSet(db, LOCAL_DOCUMENT_KEY, stored)
    }
    const file = await readGrantedFile(handle)
    let document = source === "drive" ? (stored ?? fallback) : (file.document ?? localDocument ?? stored ?? fallback)
    if (!stored) {
      await idbSet(db, DOCUMENT_KEY, document)
      if (!localDocument) await idbSet(db, LOCAL_DOCUMENT_KEY, document)
    }
    return {
      document,
      fileName: handle?.name ?? null,
      needsPermission: file.needsPermission,
      source,
      driveFile,
      driveBase,
    }
  } finally {
    db.close()
  }
}

export async function loadLocalCopy(): Promise<LocalCopy | null> {
  const db = await openDb()
  try {
    const stored = await idbGet<ListDocument>(db, LOCAL_DOCUMENT_KEY)
    const visible = await idbGet<ListDocument>(db, DOCUMENT_KEY)
    const handle = await idbGet<FileSystemFileHandle>(db, HANDLE_KEY)
    const file = await readGrantedFile(handle)
    const document = file.document ?? stored ?? visible
    if (!document) return null
    return { document, fileName: handle?.name ?? null, needsPermission: file.needsPermission }
  } finally {
    db.close()
  }
}

export async function saveSource(source: SourceId) {
  const db = await openDb()
  try {
    await idbSet(db, SOURCE_KEY, source)
  } finally {
    db.close()
  }
}

export async function saveVisible(doc: ListDocument) {
  const db = await openDb()
  try {
    await idbSet(db, DOCUMENT_KEY, doc)
  } finally {
    db.close()
  }
}

export async function saveDriveSynced(doc: ListDocument, file: StoredDriveFile, base: string) {
  const db = await openDb()
  try {
    await idbSet(db, DOCUMENT_KEY, doc)
    await idbSet(db, DRIVE_FILE_KEY, file)
    await idbSet(db, DRIVE_BASE_KEY, base)
  } finally {
    db.close()
  }
}

export async function saveDriveLink(file: StoredDriveFile) {
  const db = await openDb()
  try {
    await idbSet(db, DRIVE_FILE_KEY, file)
  } finally {
    db.close()
  }
}

export async function persistLocal(doc: ListDocument): Promise<{ fileName: string | null; needsPermission: boolean }> {
  const db = await openDb()
  let handle: FileSystemFileHandle | undefined
  try {
    await idbSet(db, DOCUMENT_KEY, doc)
    await idbSet(db, LOCAL_DOCUMENT_KEY, doc)
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

export async function readGrantedList(): Promise<{ document: ListDocument | null; needsPermission: boolean }> {
  const db = await openDb()
  let handle: FileSystemFileHandle | undefined
  try {
    handle = await idbGet<FileSystemFileHandle>(db, HANDLE_KEY)
  } finally {
    db.close()
  }
  return readGrantedFile(handle)
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

async function readGrantedFile(handle: FileSystemFileHandle | undefined): Promise<{ document: ListDocument | null; needsPermission: boolean }> {
  if (!handle) return { document: null, needsPermission: false }
  if ((await permissionState(handle)) !== "granted") return { document: null, needsPermission: true }
  return { document: await readHandle(handle), needsPermission: false }
}

function parseSource(value: unknown): SourceId {
  return value === "drive" ? "drive" : "local"
}

function parseDriveFile(value: unknown): StoredDriveFile | null {
  if (typeof value !== "object" || value === null) return null
  const file = value as { id?: unknown; name?: unknown }
  if (typeof file.id !== "string" || typeof file.name !== "string") return null
  return { id: file.id, name: file.name }
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
