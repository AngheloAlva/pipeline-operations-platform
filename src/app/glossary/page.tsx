"use client";

/**
 * Glossary page — searchable, category-grouped reference for all domain terms.
 * "use client" required for the search input useState.
 * No Suspense wrapper needed (no useSearchParams usage here).
 */

import { useState, useMemo } from "react";
import {
  GLOSSARY,
  GLOSSARY_CATEGORIES,
  type GlossaryCategory,
} from "@/lib/glossary/glossary";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";
import { ConceptInfo } from "@/components/shared/ConceptInfo";
import { ConceptHintBadge } from "@/components/shared/ConceptHintBadge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_TERMS = Object.values(GLOSSARY);
const TOTAL_COUNT = ALL_TERMS.length;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GlossaryPage() {
  const [query, setQuery] = useState("");

  const filteredByCategory = useMemo<
    Record<GlossaryCategory, typeof ALL_TERMS>
  >(() => {
    const q = normalize(query.trim());

    const matched =
      q.length === 0
        ? ALL_TERMS
        : ALL_TERMS.filter(
            (t) =>
              normalize(t.label).includes(q) ||
              normalize(t.short).includes(q) ||
              (t.long && normalize(t.long).includes(q))
          );

    const grouped = {} as Record<GlossaryCategory, typeof ALL_TERMS>;
    for (const cat of GLOSSARY_CATEGORIES) {
      grouped[cat] = matched.filter((t) => t.category === cat);
    }
    return grouped;
  }, [query]);

  const totalFiltered = useMemo(
    () =>
      GLOSSARY_CATEGORIES.reduce(
        (acc, cat) => acc + filteredByCategory[cat].length,
        0
      ),
    [filteredByCategory]
  );

  const hasResults = totalFiltered > 0;

  return (
    <div className="mc-deck">
      <div className="mx-auto max-w-panel px-4 py-5 sm:px-6 flex flex-col gap-4">
        {/* Module header */}
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <span className="mc-rail-eyebrow">Mission Control · Glosario</span>
            <h1 className="mt-1 text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
              Glosario{" "}
              <span
                className="ml-1 text-[11px] font-normal tracking-[0.08em] tabular-nums"
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  color: "var(--ink-muted)",
                }}
              >
                {TOTAL_COUNT} términos
              </span>
            </h1>
          </div>
          <ConceptHintBadge />
        </header>

        {/* Search input */}
        <div className="w-full max-w-sm">
          <label htmlFor="glossary-search" className="sr-only">
            Buscar concepto
          </label>
          <input
            id="glossary-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar concepto…"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-sm px-3 py-2 text-sm"
            style={{
              background: "var(--mc-panel)",
              border: "1px solid var(--mc-cyan-line)",
              color: "var(--ink-primary)",
              fontFamily: "var(--font-mono), monospace",
              outline: "none",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.boxShadow =
                "0 0 0 2px var(--mc-cyan-line)")
            }
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
        </div>

        {/* Category sections */}
        {hasResults ? (
          <div className="flex flex-col gap-4">
            {GLOSSARY_CATEGORIES.map((cat) => {
              const terms = filteredByCategory[cat];
              if (terms.length === 0) return null;
              return (
                <section key={cat} aria-label={cat}>
                  <InstrumentBezel label={cat}>
                    <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
                      {terms.map((term) => (
                        <article
                          key={term.id}
                          className="flex flex-col gap-1 px-3 py-3"
                          style={{ borderBottom: "1px solid var(--mc-hairline)" }}
                        >
                          {/* Term label + info button */}
                          <div className="flex items-center gap-1.5">
                            <h2
                              className="text-[11px] font-semibold uppercase tracking-[0.1em] leading-tight"
                              style={{
                                fontFamily: "var(--font-mono), monospace",
                                color: "var(--mc-cyan)",
                              }}
                            >
                              {term.label}
                            </h2>
                            <ConceptInfo term={term.id} />
                          </div>

                          {/* Short definition */}
                          <p
                            className="text-[12px] leading-relaxed"
                            style={{ color: "var(--ink-secondary)" }}
                          >
                            {term.short}
                          </p>

                          {/* Unit / threshold chip */}
                          {(term.unit || term.threshold) && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {term.unit && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-sm"
                                  style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    background: "var(--mc-deck-bg)",
                                    border: "1px solid var(--mc-cyan-line)",
                                    color: "var(--mc-cyan)",
                                  }}
                                >
                                  {term.unit}
                                </span>
                              )}
                              {term.threshold && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-sm"
                                  style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    background: "var(--mc-deck-bg)",
                                    border: "1px solid var(--mc-cyan-line)",
                                    color: "var(--ink-tertiary)",
                                  }}
                                >
                                  {term.threshold}
                                </span>
                              )}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </InstrumentBezel>
                </section>
              );
            })}
          </div>
        ) : (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center py-16 gap-2"
            role="status"
            aria-live="polite"
          >
            <span
              className="text-[13px] uppercase tracking-[0.12em]"
              style={{
                fontFamily: "var(--font-mono), monospace",
                color: "var(--ink-muted)",
              }}
            >
              Sin resultados para &ldquo;{query}&rdquo;
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
