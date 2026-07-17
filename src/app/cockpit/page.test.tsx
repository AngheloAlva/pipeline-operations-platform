/**
 * Integration tests for /cockpit — MV-14 (hero + capture mounted in the deck).
 *
 * Covers:
 *   1. The CrudeMovementDiagram hero renders ABOVE the technical per-km
 *      schematic (FlowDiagram stays, demoted).
 *   2. The "+ Captura de datos" deck action opens/closes the CaptureDrawer.
 *   3. THE SEAM: a capture commit republishes the world through
 *      worldStore.loadWorld, which re-fires the page's init(world) effect.
 *      The init guard must soft-sync (keep captured levels + transport +
 *      sim clock) instead of wiping the live session.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock next/navigation — useFocusSync needs searchParams/router/pathname
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
  usePathname: vi.fn(() => "/cockpit"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import seedData from "@/lib/data/seed.json";
import type { PipelineWorld } from "@/lib/domain";
import { useWorldStore } from "@/store/worldStore";
import { useSimulationStore, INITIAL_SLICE } from "@/store/simulationStore";
import { useCaptureStore, INITIAL_CAPTURE_SLICE, CommitStatus } from "@/store/captureStore";
import { mockPinFor } from "@/lib/capture/identity";
import CockpitPage from "./page";

const seedWorld = seedData as unknown as PipelineWorld;

// Real-seed identity + target tank (same data the demo uses)
const WORKSTATION_ID = "WST-0585"; // SALA-OPS-PC1
const OPERATOR_ID = "OPR-0580"; // María Soto
const TANK_ID = "TNK-0069"; // tag T-6010

beforeEach(() => {
  useWorldStore.setState({ world: seedWorld, loaded: true });
  useSimulationStore.setState(INITIAL_SLICE);
  useCaptureStore.setState(INITIAL_CAPTURE_SLICE);
});

describe("CockpitPage — MV-14 hero + capture", () => {
  it("renders the hero diagram above the technical per-km schematic", () => {
    render(<CockpitPage />);

    const hero = screen.getByRole("region", { name: /diagrama de movimiento de crudo/i });
    const schematicLabel = screen.getByText("ESQUEMÁTICO TÉCNICO POR KM");

    expect(hero).toBeTruthy();
    expect(schematicLabel).toBeTruthy();
    // Hero precedes the demoted schematic in document order
    const position = hero.compareDocumentPosition(schematicLabel);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens and closes the capture drawer from the deck action", () => {
    render(<CockpitPage />);

    expect(screen.queryByRole("dialog", { name: /captura de datos/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /captura de datos/i }));
    expect(screen.getByRole("dialog", { name: /captura de datos/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /cerrar captura de datos/i }));
    expect(screen.queryByRole("dialog", { name: /captura de datos/i })).toBeNull();
  });

  it("a capture commit does NOT wipe the live session (init guard seam)", async () => {
    render(<CockpitPage />);

    // Live session: transport running at 60×
    await act(async () => {
      useSimulationStore.getState().start();
      useSimulationStore.getState().setSpeed(60);
    });
    const timeBefore = useSimulationStore.getState().simulatedTime;
    expect(timeBefore).toBeGreaterThan(0);

    // Operator declares the roster and captures a T-6010 reading with PIN.
    // This republishes the world (new reference) → the page's init effect
    // re-fires while mounted — the exact seam MV-14 guards.
    await act(async () => {
      const roster = useCaptureStore.getState().declareRoster({
        workstationId: WORKSTATION_ID,
        operatorIds: [OPERATOR_ID],
      });
      expect(roster.ok).toBe(true);

      const result = useCaptureStore.getState().commitTankReading(
        { tankId: TANK_ID, levelM3: 28_000 },
        { operatorId: OPERATOR_ID, pin: mockPinFor(OPERATOR_ID) },
      );
      expect(result.status).toBe(CommitStatus.COMMITTED);
    });

    const state = useSimulationStore.getState();
    // Captured level is live…
    expect(state.tankLevels[TANK_ID]).toBe(28_000);
    // …and the session survived the world republish: no re-init wipe
    expect(state.isRunning).toBe(true);
    expect(state.speedMultiplier).toBe(60);
    expect(state.simulatedTime).toBe(timeBefore);
    // The sim adopted the derived world (schedules see the capture)
    expect(state._world).toBe(useWorldStore.getState().world);
  });
});
