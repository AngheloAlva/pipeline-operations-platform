# Interface Design System — Sala de Control

Adopted visual direction for the Pipeline Operations Platform. All UI work (Phase 1 Cockpit onward) builds on this system. Do not re-derive the direction; extend it.

## Direction & Feel

A modern reinterpretation of a SCADA control room for a crude pipeline operation. Dark-first
(control room at night), dense, precise, instrumented — calm-but-alert. NOT a SaaS dashboard.
Light theme exists as a toggle ("daylight control room") with the same accent discipline.

## Tokens (defined in src/app/globals.css)

Primitives (never used directly in className):
- `--graphite-900` #0c0e12 → `--graphite-50` — panel-steel elevation steps (5–7% lightness jumps)
- `--phosphor` — CRT telemetry green; the ONLY accent; means "system alive / OK" (light mode: #15803d, AA-safe as text)
- `--amber-safety` — WARNING
- `--alarm-red` — CRITICAL (desaturated for dark backgrounds)
- `--telemetry-blue` — flow channel (reserved, used sparingly)

Semantic layers (use these): `--surface-base/raised/overlay/interactive` (4 elevation steps),
`--ink-primary/secondary/tertiary/muted` (4 text levels; tertiary is AA-compliant ≥4.5:1 — verified
5.91:1 dark / 5.33:1 light), `--border-subtle/mid/strong` (3 separation weights),
`--status-ok/warning/critical/flow` + `-bg` variants. Tailwind classes via `@theme inline`
(`bg-surface-raised`, `text-ink-primary`, `text-status-ok`, ...).

## Depth Strategy

Borders-only. Low-opacity rgba border stack; NO shadows, NO radius on instrument frames.
Elevation expressed by whisper-quiet surface lightness shifts. Inputs darker than surroundings (inset).

## Typography

- Data/readouts: Geist Mono, `tabular-nums` — always for numeric values.
- Labels/section headings: uppercase, wide tracking, small size (10–11px), `ink-tertiary`.
- Prose/UI: Geist Sans. Headlines restrained.
- UI copy is SPANISH (neutral/professional). Code/comments English.

## Signature — "La Progresiva"

`src/components/ui/PkRuler.tsx`: horizontal pk ruler (0 → total km) with tick marks (10/50 km),
station dots at real `station.km` positions, segment terrain tints. Fully prop-driven from world
data — NEVER hardcode km values. Must appear in all three modules (overview ✓, cockpit, maintenance
context, integrity map) as the cross-module visual thread.

## Component Patterns

- **KpiCard** (instrument readout): hairline frame, no radius, big mono value, uppercase label,
  left accent bar via `style={{ borderLeftColor: "var(--border-strong)" }}` (inline style — Tailwind 4
  utility cascade makes `border-l-*` after `border-*` nondeterministic).
- **PanelLamp**: circular status lamp with subtle CSS glow + text label (never color alone).
- **Nav**: panel-selector tabs — `border-b-2 border-accent` underline on active, uppercase tracking,
  no pills/rounded backgrounds.
- **Theme**: class-based dark default; FOUC inline script in layout.tsx removes `dark` only when
  `localStorage.theme === "light"`; ThemeToggle syncs state from DOM class in useEffect with
  `suppressHydrationWarning` on the button.

## Rejected Defaults (do not reintroduce)

SaaS blue accent · icon-left metric cards · pill navigation · shadow-lifted white cards ·
multiple accent hues · pure-white surfaces in light mode.
