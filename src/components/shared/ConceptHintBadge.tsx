/**
 * Inline legend that signals the ConceptInfo affordance: it tells the user the
 * small cyan icons reveal a definition for each concept. Rendered inside a
 * module header (not floating) so it stays visible without overlapping content.
 */
export function ConceptHintBadge() {
  return (
    <span
      aria-hidden="true"
      className="hidden sm:inline-flex items-center gap-2 rounded-sm px-2.5 py-1.5 shrink-0"
      style={{
        background: "var(--mc-panel)",
        border: "1px solid var(--mc-cyan-line)",
      }}
    >
      <span
        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0"
        style={{ background: "var(--mc-cyan)", color: "var(--mc-deck-bg)" }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
          <circle cx="8" cy="4" r="1.6" />
          <rect x="6.7" y="6.7" width="2.6" height="6.3" rx="1.3" />
        </svg>
      </span>
      <span
        className="text-[10px] leading-tight uppercase tracking-[0.08em]"
        style={{ fontFamily: "var(--font-mono), monospace", color: "var(--ink-secondary)" }}
      >
        Toca los íconos para ver definiciones
      </span>
    </span>
  )
}
