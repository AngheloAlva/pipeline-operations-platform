import { ValueSourceBadge, ValueSourceKind } from "./ValueSourceBadge";
import { MONO_STYLE } from "./formKit";

export interface DerivedPreviewRow {
  label: string;
  value: string;
}

interface DerivedPreviewProps {
  title?: string;
  rows: DerivedPreviewRow[];
}

export function DerivedPreview({ title = "Vista previa viva", rows }: DerivedPreviewProps) {
  return (
    <section
      aria-label={title}
      aria-live="polite"
      className="border border-accent bg-accent-dim p-3"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3
          className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent"
          style={MONO_STYLE}
        >
          {title}
        </h3>
        <ValueSourceBadge kind={ValueSourceKind.CALCULATED} />
      </header>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt
              className="text-[10px] uppercase tracking-[0.08em] text-ink-tertiary"
              style={MONO_STYLE}
            >
              {row.label}
            </dt>
            <dd
              className="mt-0.5 break-words text-[14px] font-medium tabular-nums text-ink-primary"
              style={MONO_STYLE}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
