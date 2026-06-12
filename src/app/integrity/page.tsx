import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Integridad — Pipeline Ops",
};

export default function IntegrityPage() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border-subtle bg-surface-raised py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-ok-bg text-status-ok">
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
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">Integridad</h1>
        <p className="max-w-md text-sm text-text-secondary">Módulo en desarrollo — Fase 1</p>
        <p className="text-xs text-text-disabled">
          Monitoreo de protección catódica, lecturas de potencial y análisis de tendencias
        </p>
      </div>
    </div>
  );
}
