import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cockpit — Pipeline Ops",
};

export default function CockpitPage() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border-subtle bg-surface-raised py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-flow-bg text-status-flow">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">Cockpit</h1>
        <p className="max-w-md text-sm text-text-secondary">Módulo en desarrollo — Fase 1</p>
        <p className="text-xs text-text-disabled">
          Diagrama de flujo del oleoducto y control operativo en tiempo real
        </p>
      </div>
    </div>
  );
}
