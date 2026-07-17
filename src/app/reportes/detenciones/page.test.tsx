/**
 * Tests for /reportes/detenciones (MV-18) — pipeline stoppages from a fixture
 * world: event list, per-month totals, and the responsible-side breakdown.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { PipelineStoppage, PipelineWorld } from "@/lib/domain";
import { StoppageResponsible } from "@/lib/domain";
import { useWorldStore } from "@/store/worldStore";
import PipelineStoppagesReportPage from "./page";

// ---------------------------------------------------------------------------
// Fixture world — only the slices this page consumes
// ---------------------------------------------------------------------------

const pipelineStoppages: PipelineStoppage[] = [
  {
    id: "STP-1",
    period: "2026-05",
    startedAt: "2026-05-10T08:00:00.000Z",
    durationHours: 12.5,
    responsible: StoppageResponsible.OTA,
    cause: "Corte de energía en estación intermedia",
  },
  {
    id: "STP-2",
    period: "2026-05",
    startedAt: "2026-05-20T19:00:00.000Z",
    durationHours: 4.5,
    responsible: StoppageResponsible.OTC,
    cause: "Falla de válvula en terminal",
  },
  {
    id: "STP-3",
    period: "2026-03",
    startedAt: "2026-03-02T01:00:00.000Z",
    durationHours: 8,
    responsible: StoppageResponsible.OTA,
    cause: "Mantenimiento programado de bombas",
  },
  {
    id: "STP-4",
    period: "2026-06",
    startedAt: "2026-06-01T04:00:00.000Z",
    durationHours: 3,
    responsible: StoppageResponsible.BOTH,
    cause: "Clima adverso en alta montaña",
  },
];

const fixtureWorld = { pipelineStoppages } as unknown as PipelineWorld;

beforeEach(() => {
  useWorldStore.setState({ world: fixtureWorld, loaded: true });
});

describe("PipelineStoppagesReportPage — MV-18", () => {
  it("renders the report heading", () => {
    render(<PipelineStoppagesReportPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /detenciones de línea/i }),
    ).toBeTruthy();
  });

  it("totals count and hours per month, only for months with events", () => {
    render(<PipelineStoppagesReportPage />);

    const monthly = screen.getByRole("table", { name: /detenciones por mes/i });
    const march = within(monthly).getByText("2026-03").closest("tr");
    const may = within(monthly).getByText("2026-05").closest("tr");
    expect(within(march as HTMLElement).getByText("8,0")).toBeTruthy();
    expect(within(may as HTMLElement).getByText("2")).toBeTruthy();
    expect(within(may as HTMLElement).getByText("17,0")).toBeTruthy();
    // Sparse months are omitted, never fabricated with zeros
    expect(within(monthly).queryByText("2026-04")).toBeNull();
    // Overall totals row: 4 events, 28 hours
    const total = within(monthly).getByText(/^total$/i).closest("tr");
    expect(within(total as HTMLElement).getByText("4")).toBeTruthy();
    expect(within(total as HTMLElement).getByText("28,0")).toBeTruthy();
  });

  it("breaks stopped hours down by responsible side", () => {
    render(<PipelineStoppagesReportPage />);

    const breakdown = screen.getByRole("list", { name: /horas por responsable/i });
    const items = within(breakdown).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    // OTA leads: 20,5 h → 73,2 % of the 28 stopped hours
    expect(within(items[0]).getByText("OTA")).toBeTruthy();
    expect(within(items[0]).getByText(/20,5/)).toBeTruthy();
    expect(within(items[0]).getByText(/73,2/)).toBeTruthy();
    expect(within(items[1]).getByText("OTC")).toBeTruthy();
    expect(within(items[2]).getByText("Ambas")).toBeTruthy();
  });

  it("lists the events most recent first with responsible and cause", () => {
    render(<PipelineStoppagesReportPage />);

    const events = screen.getByRole("table", { name: /eventos de detención/i });
    const causes = within(events)
      .getAllByRole("row")
      .map((row) => row.textContent)
      .filter((text) => text?.includes("2026-"));
    expect(causes[0]).toContain("Clima adverso en alta montaña");
    expect(causes[3]).toContain("Mantenimiento programado de bombas");
    expect(within(events).getByText("Falla de válvula en terminal")).toBeTruthy();
    expect(within(events).getByText("12,5")).toBeTruthy();
  });

  it("shows the empty state when there are no stoppages", () => {
    useWorldStore.setState({
      world: { pipelineStoppages: [] } as unknown as PipelineWorld,
      loaded: true,
    });
    render(<PipelineStoppagesReportPage />);
    expect(screen.getByText(/sin detenciones registradas/i)).toBeTruthy();
  });
});
