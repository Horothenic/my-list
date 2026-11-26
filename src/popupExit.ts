import { useCallback, useEffect, useRef, useState } from "react"

export const POPUP_EXIT_MS = 160

export function usePopupExit(onDone: () => void) {
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const timer = useRef(0)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const finish = useCallback(() => {
    if (leavingRef.current) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      doneRef.current()
      return
    }
    leavingRef.current = true
    setLeaving(true)
    timer.current = window.setTimeout(() => {
      leavingRef.current = false
      setLeaving(false)
      doneRef.current()
    }, POPUP_EXIT_MS)
  }, [])

  return { leaving, finish }
}
