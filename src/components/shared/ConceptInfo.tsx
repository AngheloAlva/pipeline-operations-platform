"use client"

import { useEffect, useId, useRef, useState } from "react"
import { getTerm } from "@/lib/glossary/glossary"

interface ConceptInfoProps {
  term: string
  className?: string
  label?: string
}

export function ConceptInfo({ term, className, label }: ConceptInfoProps) {
  const entry = getTerm(term)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  // useId yields a DOM-unique id even when the same term is mounted multiple
  // times on a page, avoiding duplicate aria-labelledby targets.
  const titleId = useId()

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal()
      dialogRef.current?.focus()
    } else {
      dialogRef.current?.close()
      triggerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    const handleCancel = (e: Event) => {
      e.preventDefault()
      setOpen(false)
    }

    dialog.addEventListener("keydown", handleKeyDown)
    dialog.addEventListener("cancel", handleCancel)
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown)
      dialog.removeEventListener("cancel", handleCancel)
    }
  }, [])

  if (!entry) return null

  const buttonLabel = label ?? entry.label

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Qué es ${buttonLabel}`}
        title={`Qué es ${buttonLabel}`}
        onClick={() => setOpen(true)}
        className={[
          "inline-flex items-center justify-center align-middle shrink-0",
          "w-[18px] h-[18px] rounded-full",
          "transition-all duration-150 cursor-pointer",
          "hover:brightness-110 hover:shadow-[0_0_6px_var(--mc-cyan-glow)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          background: "var(--mc-cyan)",
          color: "var(--mc-deck-bg)",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ["--tw-ring-color" as any]: "var(--mc-cyan)",
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="8" cy="4" r="1.6" />
          <rect x="6.7" y="6.7" width="2.6" height="6.3" rx="1.3" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false)
        }}
        className="fixed inset-0 m-auto h-fit max-w-sm w-full backdrop:bg-black/60 bg-transparent border-0 p-0"
      >
        <div
          className="rounded-sm p-5 flex flex-col gap-3 shadow-2xl"
          style={{
            background: "var(--mc-panel)",
            border: "1px solid var(--mc-cyan-line)",
            color: "var(--ink-primary)",
          }}
        >
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <h2
              id={titleId}
              className="text-sm font-semibold leading-tight tracking-wide uppercase"
              style={{
                fontFamily: "var(--font-mono), monospace",
                color: "var(--mc-cyan)",
              }}
            >
              {entry.label}
            </h2>
            <button
              type="button"
              aria-label="Cerrar"
              autoFocus
              onClick={() => setOpen(false)}
              className="text-xs leading-none p-1 rounded opacity-60 hover:opacity-100 transition-opacity focus:outline-none"
              style={{ color: "var(--ink-secondary)" }}
            >
              ✕
            </button>
          </div>

          {/* Short description */}
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-secondary)" }}>
            {entry.short}
          </p>

          {/* Long description */}
          {entry.long && (
            <p
              className="text-xs leading-relaxed border-t pt-3"
              style={{
                borderColor: "var(--mc-hairline)",
                color: "var(--ink-tertiary)",
              }}
            >
              {entry.long}
            </p>
          )}

          {/* Unit / threshold metadata */}
          {(entry.unit || entry.threshold) && (
            <div
              className="flex flex-wrap gap-3 text-xs pt-2 border-t"
              style={{
                borderColor: "var(--mc-hairline)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {entry.unit && (
                <span>
                  <span style={{ color: "var(--ink-tertiary)" }}>Unidad: </span>
                  <span style={{ color: "var(--mc-cyan)" }}>{entry.unit}</span>
                </span>
              )}
              {entry.threshold && (
                <span>
                  <span style={{ color: "var(--ink-tertiary)" }}>Criterio: </span>
                  <span style={{ color: "var(--mc-cyan)" }}>{entry.threshold}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}
