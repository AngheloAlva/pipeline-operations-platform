/**
 * CrudeMovementDiagram tests (MV-13) — the demo hero over the canonical topology.
 * Covers: canonical nodes render, custody chip coherence + navigation target,
 * per-node status from seed (≥1 non-OK), node/tank click → selectionStore,
 * and live tank levels from simulationStore (the diagram "breathes").
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import seedData from "@/lib/data/seed.json";
import type { PipelineWorld } from "@/lib/domain";
import { CANONICAL_STATION_TAGS } from "@/lib/data/canonical";
import { computeCustodyDiff } from "@/lib/volumetrics/custody";
import { useSimulationStore } from "@/store/simulationStore";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import { INITIAL_CAPTURE_SLICE, useCaptureStore } from "@/store/captureStore";
import { CrudeMovementDiagram } from "./CrudeMovementDiagram";
import { CUSTODY_DIFF_ANCHOR } from "./CustodyDiffPanel";

const seedWorld = seedData as unknown as PipelineWorld;

const stationByTag = new Map(seedWorld.stations.filter((s) => s.tag).map((s) => [s.tag!, s]));
const phStation = stationByTag.get(CANONICAL_STATION_TAGS.PUERTO_HERNANDEZ)!;
const tank101 = seedWorld.tanks.find((t) => t.tag === "T-101")!;

beforeEach(() => {
  useCaptureStore.setState(INITIAL_CAPTURE_SLICE);
  useSimulationStore.getState().init(seedWorld);
  useSelectionStore.getState().clearSelection();
});

// ---------------------------------------------------------------------------
// Canonical topology renders
// ---------------------------------------------------------------------------

describe("canonical topology", () => {
  it("renders every canonical station name", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    for (const name of [
      "Ingreso OldelVal",
      "Ingreso VMON",
      "Ingreso Activo YPF",
      "Puerto Hernández",
      "Terminal Concepción",
      "Refinería Bío Bío",
      "Terminal San Vicente",
      "Buque Tanque",
    ]) {
      expect(screen.getByText(name), name).toBeTruthy();
    }
  });

  it("renders every canonical custody tank card", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    for (const tag of ["T-101", "T-102", "T-6010", "T-6020", "T-6030"]) {
      expect(screen.getByText(tag), tag).toBeTruthy();
    }
  });

  it("labels both custody regimes at the boundary", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    expect(screen.getByText(/OTA · 15\s?°C/)).toBeTruthy();
    expect(screen.getByText(/OTC · 60\s?°F/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Live tank levels — the diagram breathes
// ---------------------------------------------------------------------------

describe("live tank levels", () => {
  it("shows the live store level for T-101 (60% of 30000 m³)", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    const card = screen.getByText("T-101").closest("[data-tank-id]")!;
    expect(card.textContent).toContain("60%");
    expect(card.textContent).toContain("18.000 m³");
    expect(card.textContent).toContain("ƒ calc");
  });

  it("coordinates the propagation highlight on the touched tank and custody chip", () => {
    useCaptureStore.setState({
      lastPropagation: {
        sequence: 7,
        recordId: "CAP-0007",
        tankIds: [tank101.id],
        highlightBalance: true,
        highlightCustody: true,
      },
    });
    render(<CrudeMovementDiagram world={seedWorld} />);
    const tankCard = screen.getByText("T-101").closest("[data-tank-id]")!;
    expect(tankCard.querySelector(".capture-propagation-highlight")).toBeTruthy();
    expect(screen.getByRole("link", { name: /descuadre/i }).className).toContain(
      "capture-propagation-highlight",
    );
  });

  it("updates the gauge when the simulation store level changes", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    act(() => {
      useSimulationStore.getState().applyCapturedLevels({ [tank101.id]: 30000 });
    });
    const card = screen.getByText("T-101").closest("[data-tank-id]")!;
    expect(card.textContent).toContain("100%");
  });
});

// ---------------------------------------------------------------------------
// Custody-difference chip
// ---------------------------------------------------------------------------

describe("custody-difference chip", () => {
  it("shows the aggregated OTA↔OTC difference for the simulated month", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);

    // Expected: aggregate of the seed's custody records for the sim month.
    const simDay = new Date(useSimulationStore.getState().simulatedTime)
      .toISOString()
      .slice(0, 10);
    const month = simDay.slice(0, 7);
    const records = seedWorld.custodyDifferences.filter((r) => r.period.slice(0, 7) === month);
    expect(records.length).toBeGreaterThan(0);
    const origin = records.reduce((sum, r) => sum + r.originVolM3, 0);
    const dest = records.reduce((sum, r) => sum + r.destVolM3, 0);
    const { diffPct } = computeCustodyDiff(origin, dest);

    const chip = screen.getByRole("link", { name: /descuadre/i });
    // Percentage rendered with 2 decimals and the m³ unit present
    expect(chip.textContent).toContain(`${diffPct.toFixed(2).replace(".", ",")}%`);
    expect(chip.textContent).toContain("m³");
  });

  it("navigates to the custody-difference panel anchor (MV-15)", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    const chip = screen.getByRole("link", { name: /descuadre/i });
    // MV-15: the chip lands on the CustodyDiffPanel section in the cockpit.
    expect(chip.getAttribute("href")).toBe(`/cockpit#${CUSTODY_DIFF_ANCHOR}`);
  });
});

// ---------------------------------------------------------------------------
// Equipment cross-nav (MV-19) — hero node → /equipment/[id]
// ---------------------------------------------------------------------------

describe("equipment cross-nav", () => {
  it("links the custody manifold node to its equipment detail page", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    const manifold = seedWorld.equipment.find((e) => e.tag === "MOV-CUSTODY")!;
    const link = screen.getByRole("link", { name: /ver equipo/i });
    expect(link.getAttribute("href")).toBe(`/equipment/${manifold.id}`);
  });

  it("keeps the manifold glyph's focus/selection behavior alongside the link", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    const manifold = seedWorld.equipment.find((e) => e.tag === "MOV-CUSTODY")!;
    fireEvent.click(screen.getByRole("button", { name: /válvula de custodia/i }));
    const selection = useSelectionStore.getState();
    expect(selection.selectedEntityId).toBe(manifold.id);
    expect(selection.selectedEntityType).toBe(EntityType.EQUIPMENT);
  });
});

// ---------------------------------------------------------------------------
// Per-node status (resolveNodeStatus over seed)
// ---------------------------------------------------------------------------

describe("node status", () => {
  it("marks Terminal Concepción as LOTO (locked-out pump J-6010 in seed)", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    const node = screen.getByRole("button", { name: /Terminal Concepción/ });
    expect(node.getAttribute("data-status")).toBe("LOTO");
    expect(node.textContent).toContain("LOTO");
    // Status ring uses the critical semantic token
    const ring = node.querySelector("[data-status-ring]");
    expect(ring?.getAttribute("stroke")).toBe("var(--status-critical)");
  });

  it("marks at least the seeded non-OK nodes and keeps OK nodes neutral", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    const vmon = screen.getByRole("button", { name: /Ingreso VMON/ });
    expect(vmon.getAttribute("data-status")).toBe("OK");
    const nonOk = seedWorld.stations
      .filter((s) => s.tag)
      .map((s) => screen.getByRole("button", { name: new RegExp(s.name) }))
      .filter((el) => el.getAttribute("data-status") !== "OK");
    expect(nonOk.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Click-through selection (selectEntity + ?focus= pattern)
// ---------------------------------------------------------------------------

describe("selection", () => {
  it("selects the station in selectionStore when a node is clicked", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    fireEvent.click(screen.getByRole("button", { name: /Puerto Hernández/ }));
    const state = useSelectionStore.getState();
    expect(state.selectedEntityId).toBe(phStation.id);
    expect(state.selectedEntityType).toBe(EntityType.STATION);
  });

  it("selects the tank in selectionStore when a tank card is clicked", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    fireEvent.click(screen.getByRole("button", { name: /Tanque T-6010/ }));
    const state = useSelectionStore.getState();
    expect(state.selectedEntityId).toBe(seedWorld.tanks.find((t) => t.tag === "T-6010")!.id);
    expect(state.selectedEntityType).toBe(EntityType.TANK);
  });

  it("supports keyboard activation on station nodes", () => {
    render(<CrudeMovementDiagram world={seedWorld} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Refinería Bío Bío/ }), {
      key: "Enter",
    });
    const refStation = stationByTag.get(CANONICAL_STATION_TAGS.BIO_BIO_REFINERY)!;
    expect(useSelectionStore.getState().selectedEntityId).toBe(refStation.id);
  });
});
