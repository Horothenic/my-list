import { useState } from "react"
import { tagLabel, type SourceId } from "./model"
import type { CustomColors, ThemeName } from "./theme"

export function Settings({
  source,
  localDetail,
  driveDetail,
  connecting,
  fileName,
  driveNote,
  needsPermission,
  installLabel,
  installHint,
  theme,
  colors,
  tags,
  onTheme,
  onColors,
  onAddTag,
  onRenameTag,
  onDeleteTag,
  onChooseLocal,
  onChooseFile,
  onNewFile,
  onDisconnectFile,
  onAllowFile,
  onConnectDrive,
  onSignOut,
  onInstall,
  onClose,
}: {
  source: SourceId
  localDetail: string
  driveDetail: string
  connecting: boolean
  fileName: string | null
  driveNote: string
  needsPermission: boolean
  installLabel: string | null
  installHint: string | null
  theme: ThemeName
  colors: CustomColors
  tags: string[]
  onTheme: (theme: ThemeName) => void
  onColors: (colors: CustomColors) => void
  onAddTag: (name: string) => void
  onRenameTag: (from: string, to: string) => void
  onDeleteTag: (name: string) => void
  onChooseLocal: () => void
  onChooseFile: () => void
  onNewFile: () => void
  onDisconnectFile: () => void
  onAllowFile: () => void
  onConnectDrive: () => void
  onSignOut: () => void
  onInstall: () => void
  onClose: () => void
}) {
  const [tagName, setTagName] = useState("")

  return (
    <div className="settings">
      <header className="toolbar">
        <strong className="settings-title">Settings</strong>
        <button type="button" className="settings-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4.4 4.4 L11.6 11.6 M11.6 4.4 L4.4 11.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="settings-body">
        <p className="settings-label">Source</p>
        <div className="settings-card">
          <button type="button" className={source === "local" ? "source-choice on" : "source-choice"} aria-pressed={source === "local"} onClick={() => { if (source !== "local") onChooseLocal() }}>
            <span className="radio"><i /></span>
            <span>
              <span className="source-name">Local file</span>
              <span className="opt-sub">{source === "local" ? localDetail : "A file on this device, or this browser."}</span>
            </span>
          </button>
          {source === "local" && (
            <div className="source-options">
              <button type="button" className="settings-action" onClick={onChooseFile}>Choose a file</button>
              <button type="button" className="settings-action" onClick={onNewFile}>New file</button>
              {fileName && <button type="button" className="settings-action" onClick={onDisconnectFile}>Disconnect</button>}
              {needsPermission && <button type="button" className="settings-action" onClick={onAllowFile}>Allow this file</button>}
            </div>
          )}
          <button type="button" className={source === "drive" ? "source-choice on" : "source-choice"} aria-pressed={source === "drive"} onClick={() => { if (source !== "drive") onConnectDrive() }}>
            <span className="radio"><i /></span>
            <span>
              <span className="source-name">Google Drive</span>
              <span className="opt-sub">{source === "drive" ? driveDetail : connecting ? "Signing in…" : "One file in your Drive."}</span>
            </span>
          </button>
          {source === "drive" && (
            <div className="source-options">
              <button type="button" className="settings-action" onClick={onSignOut}>Sign out</button>
            </div>
          )}
        </div>
        {installLabel && <button type="button" className="settings-install" onClick={onInstall}>{installLabel}</button>}
        {installHint && <p className="settings-hint">{installHint}</p>}
        {driveNote && <p className="storage-note">{driveNote}</p>}

        <p className="settings-label">Theme</p>
        <div className="settings-choices">
          {(["dark", "light", "custom"] as const).map((name) => (
            <button key={name} type="button" className={theme === name ? "tag-pick on" : "tag-pick"} onClick={() => onTheme(name)}>
              {name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>
        {theme === "custom" && (
          <div className="settings-card" style={{ marginTop: 8 }}>
            <ColorRow label="Background" value={colors.background} onChange={(background) => onColors({ ...colors, background })} />
            <ColorRow label="Accent" value={colors.accent} onChange={(accent) => onColors({ ...colors, accent })} />
            <ColorRow label="Not due yet" value={colors.waiting} onChange={(waiting) => onColors({ ...colors, waiting })} />
            <ColorRow label="Due today" value={colors.today} onChange={(today) => onColors({ ...colors, today })} />
            <ColorRow label="Overdue" value={colors.late} onChange={(late) => onColors({ ...colors, late })} />
          </div>
        )}

        <p className="settings-label">Tags</p>
        <div className="settings-card">
          {tags.length === 0 && <div className="settings-row"><span className="opt-sub">No tags yet</span></div>}
          {tags.map((tag) => (
            <div className="settings-row" key={tag}>
              <span className="title-tag">{tagLabel(tag)}</span>
              <span>
                <button
                  type="button"
                  className="menu-action"
                  onClick={() => {
                    const next = tagLabel(window.prompt("Rename tag", tagLabel(tag)) ?? "")
                    if (next && next !== tagLabel(tag)) onRenameTag(tag, next)
                  }}
                >
                  Rename
                </button>
                <button type="button" className="menu-action" onClick={() => onDeleteTag(tag)}>Delete</button>
              </span>
            </div>
          ))}
        </div>
        <div className="tag-add">
          <input
            value={tagName}
            placeholder="New tag"
            onChange={(event) => setTagName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              const name = tagLabel(tagName)
              if (!name) return
              onAddTag(name)
              setTagName("")
            }}
          />
          <button
            type="button"
            className="menu-btn"
            onClick={() => {
              const name = tagLabel(tagName)
              if (!name) return
              onAddTag(name)
              setTagName("")
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-row settings-row">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
