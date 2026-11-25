import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react"
import { isoDate, parseIso } from "./model"

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]

export function ColorDialog({
  label,
  value,
  onSave,
  onClose,
}: {
  label: string
  value: string
  onSave: (hex: string) => void
  onClose: () => void
}) {
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const color = hsvToHex(hsv.h, hsv.s, hsv.v)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [onClose])

  function setHue(event: ReactPointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left - box.width / 2
    const y = event.clientY - box.top - box.height / 2
    if (Math.hypot(x, y) < box.width * 0.28) return
    const hue = (Math.atan2(y, x) * 180) / Math.PI + 90
    setHsv((current) => ({ ...current, h: (hue + 360) % 360 }))
  }

  function setSquare(event: ReactPointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const s = clamp((event.clientX - box.left) / box.width)
    const v = clamp(1 - (event.clientY - box.top) / box.height)
    setHsv((current) => ({ ...current, s, v }))
  }

  return (
    <div className="picker" onMouseDown={onClose}>
      <div
        className="picker-card"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{label}</h2>
        <div className="color-tools">
          <div
            className="hue-wheel"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              setHue(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) setHue(event)
            }}
          >
            <span className="hue-core" style={{ background: color }} />
            <span
              className="hue-dot"
              style={{
                left: `${50 + Math.sin((hsv.h * Math.PI) / 180) * 39}%`,
                top: `${50 - Math.cos((hsv.h * Math.PI) / 180) * 39}%`,
              }}
            />
          </div>
          <div
            className="sv-square"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 1, 1)})` }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              setSquare(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) setSquare(event)
            }}
          >
            <span className="sv-dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
          </div>
        </div>
        <div className="picker-actions">
          <span />
          <div className="picker-actions-right">
            <button type="button" className="menu-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="save-btn" onClick={() => onSave(color)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DateDialog({
  label,
  value,
  optional,
  onSave,
  onClose,
}: {
  label: string
  value: string | null
  optional?: boolean
  onSave: (iso: string | null) => void
  onClose: () => void
}) {
  const initial = parseIso(value ?? isoDate(new Date()))
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const [selected, setSelected] = useState(value ?? isoDate(initial))
  const today = isoDate(new Date())

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [onClose])

  const cells = monthCells(cursor.year, cursor.month)
  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })

  function shift(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }

  return (
    <div className="picker" onMouseDown={onClose}>
      <div
        className="picker-card"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{label}</h2>
        <div className="month-bar">
          <button type="button" className="month-nav" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <span>{title}</span>
          <button type="button" className="month-nav" aria-label="Next month" onClick={() => shift(1)}>›</button>
        </div>
        <div className="cal">
          {WEEKDAYS.map((day, index) => (
            <span className="dow" key={`${day}-${index}`}>{day}</span>
          ))}
          {cells.map((cell, index) =>
            cell ? (
              <button
                key={cell.iso}
                type="button"
                className={cell.iso === selected ? "on" : cell.iso === today ? "today" : undefined}
                onClick={() => setSelected(cell.iso)}
              >
                {cell.day}
              </button>
            ) : (
              <span key={`empty-${index}`} />
            ),
          )}
        </div>
        <div className="picker-actions">
          {optional ? (
            <button type="button" className="menu-btn" onClick={() => onSave(null)}>Clear</button>
          ) : (
            <span />
          )}
          <div className="picker-actions-right">
            <button type="button" className="menu-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="save-btn" onClick={() => onSave(selected)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function monthCells(year: number, month: number): Array<{ iso: string; day: number } | null> {
  const first = new Date(year, month, 1).getDay()
  const count = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ iso: string; day: number } | null> = Array.from({ length: first }, () => null)
  for (let day = 1; day <= count; day += 1) cells.push({ day, iso: isoDate(new Date(year, month, day)) })
  return cells
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const value = Number.parseInt(hex.slice(1), 16)
  const r = ((value >> 16) & 255) / 255
  const g = ((value >> 8) & 255) / 255
  const b = (value & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const channels = [r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
  return `#${channels.join("")}`
}
