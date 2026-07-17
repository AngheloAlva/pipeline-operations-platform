/**
 * Tests for the /reportes landing (MV-16/MV-18) — the section index links to
 * the built report pages (Allocation, Presupuesto vs Real, Diferencias,
 * Detenciones, Medio Ambiente, Cierres).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ReportsPage from "./page";

describe("ReportsPage — section landing (MV-16)", () => {
  it("renders the section heading", () => {
    render(<ReportsPage />);
    expect(screen.getByRole("heading", { level: 1, name: /reportes/i })).toBeTruthy();
  });

  it("links to the Allocation report", () => {
    render(<ReportsPage />);
    const link = screen.getByRole("link", { name: /allocation/i });
    expect(link.getAttribute("href")).toBe("/reportes/allocation");
  });

  it("links to the Presupuesto vs Real report", () => {
    render(<ReportsPage />);
    const link = screen.getByRole("link", { name: /presupuesto vs real/i });
    expect(link.getAttribute("href")).toBe("/reportes/presupuesto");
  });

  it("links to the four monthly BI report pages (MV-18)", () => {
    render(<ReportsPage />);
    expect(
      screen.getByRole("link", { name: /diferencias/i }).getAttribute("href"),
    ).toBe("/reportes/diferencias");
    expect(
      screen.getByRole("link", { name: /detenciones de línea/i }).getAttribute("href"),
    ).toBe("/reportes/detenciones");
    expect(
      screen.getByRole("link", { name: /medio ambiente/i }).getAttribute("href"),
    ).toBe("/reportes/medio-ambiente");
    expect(
      screen.getByRole("link", { name: /cierres del mes/i }).getAttribute("href"),
    ).toBe("/reportes/cierres");
  });

  it("only links to built report pages (no broken placeholders)", () => {
    render(<ReportsPage />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/reportes/allocation",
      "/reportes/presupuesto",
      "/reportes/diferencias",
      "/reportes/detenciones",
      "/reportes/medio-ambiente",
      "/reportes/cierres",
    ]);
  });
});
