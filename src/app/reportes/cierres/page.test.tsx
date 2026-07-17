/**
 * Tests for /reportes/cierres (MV-18) — monthly closing comments per area
 * from a fixture world: period grouping, area + comment, and optional author.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { ClosingComment, PipelineWorld } from "@/lib/domain";
import { useWorldStore } from "@/store/worldStore";
import ClosingCommentsReportPage from "./page";

// ---------------------------------------------------------------------------
// Fixture world — only the slices this page consumes
// ---------------------------------------------------------------------------

const closingComments: ClosingComment[] = [
  {
    id: "CLC-1",
    period: "2026-05",
    area: "Operaciones",
    comment: "Bombeo estable durante todo el mes.",
    authorId: "OPR-1",
  },
  {
    id: "CLC-2",
    period: "2026-06",
    area: "Mantenimiento",
    comment: "Plan preventivo al día.",
    authorId: "OPR-2",
  },
  {
    id: "CLC-3",
    period: "2026-05",
    area: "Integridad",
    comment: "Potenciales catódicos dentro de banda.",
    // No author — must render without one
  },
];

const fixtureWorld = {
  closingComments,
  operators: [
    { id: "OPR-1", name: "Ana Ríos", initials: "AR" },
    { id: "OPR-2", name: "Bruno Soto", initials: "BS" },
  ],
} as unknown as PipelineWorld;

beforeEach(() => {
  useWorldStore.setState({ world: fixtureWorld, loaded: true });
});

describe("ClosingCommentsReportPage — MV-18", () => {
  it("renders the report heading", () => {
    render(<ClosingCommentsReportPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /cierres del mes/i }),
    ).toBeTruthy();
  });

  it("groups comments by period, most recent month first", () => {
    render(<ClosingCommentsReportPage />);

    const groups = screen.getAllByRole("heading", { level: 2 });
    expect(groups.map((h) => h.textContent)).toEqual(["Cierre 2026-06", "Cierre 2026-05"]);
  });

  it("shows area and comment for each entry, areas sorted inside the group", () => {
    render(<ClosingCommentsReportPage />);

    const may = screen.getByRole("list", { name: /cierre 2026-05/i });
    const items = within(may).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Integridad")).toBeTruthy();
    expect(within(items[0]).getByText(/potenciales catódicos/i)).toBeTruthy();
    expect(within(items[1]).getByText("Operaciones")).toBeTruthy();
    expect(within(items[1]).getByText(/bombeo estable/i)).toBeTruthy();
  });

  it("shows the author name when present and nothing when absent", () => {
    render(<ClosingCommentsReportPage />);

    expect(screen.getByText("Ana Ríos")).toBeTruthy();
    expect(screen.getByText("Bruno Soto")).toBeTruthy();

    const may = screen.getByRole("list", { name: /cierre 2026-05/i });
    const integrity = within(may).getAllByRole("listitem")[0];
    expect(within(integrity).queryByText(/OPR-/)).toBeNull();
  });

  it("shows the empty state when there are no closing comments", () => {
    useWorldStore.setState({
      world: { closingComments: [], operators: [] } as unknown as PipelineWorld,
      loaded: true,
    });
    render(<ClosingCommentsReportPage />);
    expect(screen.getByText(/sin comentarios de cierre/i)).toBeTruthy();
  });
});
