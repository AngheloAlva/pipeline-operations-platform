import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mantención — Pipeline Ops",
};

export default function MaintenancePage() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border-subtle bg-surface-raised py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-warning-bg text-status-warning">
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
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">Mantención</h1>
        <p className="max-w-md text-sm text-text-secondary">Módulo en desarrollo — Fase 1</p>
        <p className="text-xs text-text-disabled">
          Gestión de planes preventivos, órdenes de trabajo y programación de mantenimiento
        </p>
      </div>
    </div>
  );
}
