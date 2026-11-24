/// <reference types="vite/client" />

interface FileSystemHandle {
  queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>
  requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>
}

interface Window {
  showOpenFilePicker?(options?: {
    multiple?: boolean
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(options?: {
    suggestedName?: string
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }): Promise<FileSystemFileHandle>
}
