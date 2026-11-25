import { parseListDocument, serializeList, type ListDocument } from "./document"
import { keepEmptyList } from "./localStore"

const SCOPE = "https://www.googleapis.com/auth/drive.file"
const FILE_NAME = "my-list.json"
const APP_KEY = "my-list"

export type DriveLink = { id: string; name: string }

export type DriveSync =
  | { kind: "in-sync"; link: DriveLink; base: string }
  | { kind: "opened"; link: DriveLink; document: ListDocument; base: string }
  | { kind: "conflict"; link: DriveLink; document: ListDocument; driveText: string }

type TokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
}

type TokenClient = {
  requestAccessToken: (override?: { prompt?: string }) => void
}

type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type?: string }) => void
      }) => TokenClient
      revoke: (token: string) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

type CachedToken = { value: string; expiresAt: number }

const TOKEN_KEY = "my-list-drive-token"

let scriptPromise: Promise<void> | null = null
let cachedToken: CachedToken | null = null

export function googleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ""
}

export function driveConfigured(): boolean {
  return googleClientId() !== ""
}

function hasItems(doc: ListDocument): boolean {
  return doc.dailies.length > 0 || doc.todos.length > 0
}

export function decideSync(currentText: string, driveText: string, base: string | null): "same" | "upload" | "download" | "conflict" {
  if (driveText === currentText) return "same"
  if (base === null || currentText === base) return "download"
  if (driveText === base) return "upload"
  return "conflict"
}

const SIGN_IN_ERRORS = new Set([
  "auth",
  "popup_closed",
  "popup_closed_by_user",
  "popup_failed_to_open",
  "access_denied",
  "interaction_required",
  "consent_required",
  "login_required",
  "immediate_failed",
])

export function driveSignInCancelled(error: unknown): boolean {
  return error instanceof Error && (error.message === "popup_closed" || error.message === "popup_closed_by_user" || error.message === "access_denied")
}

export function driveNeedsSignIn(error: unknown): boolean {
  return error instanceof Error && SIGN_IN_ERRORS.has(error.message)
}

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("google-script"))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function currentDriveToken(): string | null {
  if (!cachedToken) cachedToken = readStoredToken()
  if (!cachedToken) return null
  if (Date.now() >= cachedToken.expiresAt) {
    cachedToken = null
    sessionStorage.removeItem(TOKEN_KEY)
    return null
  }
  return cachedToken.value
}

export function clearDriveToken() {
  const value = currentDriveToken()
  cachedToken = null
  sessionStorage.removeItem(TOKEN_KEY)
  if (value && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(value)
}

function rememberToken(token: CachedToken) {
  cachedToken = token
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  } catch {
    // The token still works for this page load.
  }
}

function readStoredToken(): CachedToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { value?: unknown; expiresAt?: unknown }
    if (typeof parsed.value !== "string" || typeof parsed.expiresAt !== "number") return null
    if (Date.now() >= parsed.expiresAt) return null
    return { value: parsed.value, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

export function requestDriveToken(prompt: "" | "select_account"): Promise<string> {
  const clientId = googleClientId()
  if (!clientId) return Promise.reject(new Error("missing-client"))
  const pending = loadGoogleIdentity().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const google = window.google
        if (!google?.accounts?.oauth2) {
          reject(new Error("google-script"))
          return
        }
        let settled = false
        const finish = (error?: string, accessToken?: string, expiresIn?: number) => {
          if (settled) return
          settled = true
          if (!accessToken) {
            reject(new Error(error || "auth"))
            return
          }
          rememberToken({ value: accessToken, expiresAt: Date.now() + (expiresIn ?? 3600) * 1000 - 60_000 })
          resolve(accessToken)
        }
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (response) => finish(response.error, response.access_token, response.expires_in),
          error_callback: (error) => finish(error.type),
        })
        client.requestAccessToken({ prompt })
      }),
  )
  return prompt === "" ? withTimeout(pending, 8000) : pending
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("auth")), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function driveTokenForSave(): Promise<string | null> {
  const existing = currentDriveToken()
  if (existing) return existing
  if (!driveConfigured()) return null
  try {
    return await requestDriveToken("")
  } catch {
    return null
  }
}

async function earlierList(token: string, id: string): Promise<ListDocument | null> {
  try {
    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/revisions?pageSize=10&fields=${encodeURIComponent("revisions(id,modifiedTime)")}`,
      token,
    )
    const data = (await response.json()) as { revisions?: Array<{ id?: string; modifiedTime?: string }> }
    const revisions = (data.revisions ?? [])
      .filter((item): item is { id: string; modifiedTime?: string } => typeof item.id === "string")
      .sort((a, b) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""))
    for (const revision of revisions.slice(0, 8)) {
      const older = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revision.id)}?alt=media`,
        token,
      )
      const doc = parseListDocument(await older.text())
      if (doc && hasItems(doc)) return doc
    }
  } catch {
    return null
  }
  return null
}

export async function openDriveList(token: string, current: ListDocument, link: DriveLink | null, base: string | null): Promise<DriveSync> {
  const currentText = serializeList(current)
  let resolved = link ? await getDriveFile(token, link.id) : null
  if (!resolved) resolved = await findDriveFile(token)
  if (!resolved) {
    const created = await createDriveFile(token, current)
    return { kind: "in-sync", link: created, base: currentText }
  }
  const driveText = await downloadDriveText(token, resolved.id)
  const document = parseListDocument(driveText)
  if (!document) throw new Error("invalid")
  if (!hasItems(document) && !keepEmptyList()) {
    const earlier = await earlierList(token, resolved.id)
    if (earlier) {
      await uploadDriveFile(token, resolved.id, earlier)
      return { kind: "opened", link: resolved, document: earlier, base: serializeList(earlier) }
    }
  }
  const decision = decideSync(currentText, driveText, base)
  if (decision === "upload") {
    const currentDoc = parseListDocument(currentText)
    if (currentDoc && !hasItems(currentDoc) && hasItems(document)) {
      return { kind: "opened", link: resolved, document, base: driveText }
    }
    await uploadDriveFile(token, resolved.id, current)
  }
  if (decision === "same" || decision === "upload") {
    return { kind: "in-sync", link: resolved, base: decision === "upload" ? currentText : driveText }
  }
  if (decision === "download") return { kind: "opened", link: resolved, document, base: driveText }
  return { kind: "conflict", link: resolved, document, driveText }
}

export async function uploadDriveFile(token: string, id: string, doc: ListDocument): Promise<void> {
  await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: serializeList(doc),
  })
}

async function getDriveFile(token: string, id: string): Promise<DriveLink | null> {
  try {
    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,trashed`,
      token,
    )
    const file = (await response.json()) as { id?: string; name?: string; trashed?: boolean }
    if (!file.id || file.trashed) return null
    return { id: file.id, name: file.name || FILE_NAME }
  } catch (error) {
    if (error instanceof Error && error.message === "missing") return null
    throw error
  }
}

async function findDriveFile(token: string): Promise<DriveLink | null> {
  const query = `trashed = false and appProperties has { key='app' and value='${APP_KEY}' }`
  const url = `https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=1&orderBy=${encodeURIComponent("modifiedTime desc")}&fields=files(id,name)&q=${encodeURIComponent(query)}`
  const response = await driveFetch(url, token)
  const data = (await response.json()) as { files?: Array<{ id?: string; name?: string }> }
  const file = data.files?.find((item) => item.id)
  if (!file?.id) return null
  return { id: file.id, name: file.name || FILE_NAME }
}

async function createDriveFile(token: string, doc: ListDocument): Promise<DriveLink> {
  const boundary = "my-list-boundary"
  const metadata = { name: FILE_NAME, mimeType: "application/json", appProperties: { app: APP_KEY } }
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    serializeList(doc),
    `--${boundary}--`,
    "",
  ].join("\r\n")
  const response = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", token, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  })
  const file = (await response.json()) as { id?: string; name?: string }
  if (!file.id) throw new Error("network")
  return { id: file.id, name: file.name || FILE_NAME }
}

async function downloadDriveText(token: string, id: string): Promise<string> {
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, token)
  return response.text()
}

async function driveFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init?.headers },
    })
  } catch {
    throw new Error("network")
  }
  if (response.status === 401) throw new Error("auth")
  if (response.status === 403) throw new Error("forbidden")
  if (response.status === 404) throw new Error("missing")
  if (!response.ok) throw new Error("network")
  return response
}
