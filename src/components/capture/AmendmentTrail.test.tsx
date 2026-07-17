/**
 * AmendmentTrail tests (MV-11) — visible amendment chain + UI amend flow.
 * Acceptance (§6.4): a correction creates a NEW record referencing the old
 * one (never overwrites) and the trace is visible.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { AmendmentTrail } from "./AmendmentTrail";
import {
  resetCaptureStores,
  declareStandardRoster,
  MARIA,
  JUAN,
} from "./captureTestFixtures";
import { useCaptureStore, CommitStatus } from "@/store/captureStore";
import { useWorldStore } from "@/store/worldStore";

/** Commit a baseline tank reading (CAP-0001, level 20 000) as María. */
function commitBaselineReading() {
  const result = useCaptureStore.getState().commitTankReading(
    { tankId: "TNK-1", levelM3: 20_000 },
    { operatorId: MARIA.id, pin: MARIA.pin },
    { enteredAt: "2026-06-12T20:30:00.000Z" },
  );
  if (result.status !== CommitStatus.COMMITTED) throw new Error("fixture commit failed");
  return result.record;
}

describe("AmendmentTrail", () => {
  beforeEach(() => {
    resetCaptureStores();
    declareStandardRoster();
  });

  it("shows a single-record chain as the record in force", () => {
    commitBaselineReading();
    render(<AmendmentTrail recordId="CAP-0001" />);

    expect(screen.getByText("CAP-0001")).toBeTruthy();
    expect(screen.getByText("VIGENTE")).toBeTruthy();
    expect(screen.getByText(/María Soto/)).toBeTruthy();
  });

  it("renders the full chain with the superseded record and its previous value", () => {
    commitBaselineReading();
    const amend = useCaptureStore.getState().amendRecord(
      "CAP-0001",
      { levelM3: 21_000 },
      { operatorId: JUAN.id, pin: JUAN.pin },
      { enteredAt: "2026-06-12T21:00:00.000Z" },
    );
    expect(amend.status).toBe(CommitStatus.COMMITTED);

    // Queried by ANY member of the chain — here the original.
    render(<AmendmentTrail recordId="CAP-0001" />);

    expect(screen.getByText("REEMPLAZADO")).toBeTruthy();
    expect(screen.getByText("VIGENTE")).toBeTruthy();
    expect(screen.getByText(/Corrige a CAP-0001/)).toBeTruthy();
    // The audit trail keeps the previous value visible
    expect(screen.getByText(/antes: T-101: nivel 20.000 m³/)).toBeTruthy();
    // Both authors are visible
    expect(screen.getByText(/María Soto/)).toBeTruthy();
    expect(screen.getByText(/Juan Pérez/)).toBeTruthy();
  });

  it("amends from the UI: the correction creates a new record referencing the old one", () => {
    commitBaselineReading();
    render(<AmendmentTrail recordId="CAP-0001" />);

    fireEvent.click(screen.getByRole("button", { name: /corregir registro vigente/i }));

    // The tank reading form opens prefilled with the effective values
    const level = screen.getByLabelText(/nivel medido/i) as HTMLInputElement;
    expect(level.value).toBe("20000");

    fireEvent.change(level, { target: { value: "21000" } });
    fireEvent.click(screen.getByRole("button", { name: /corregir con pin/i }));
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: MARIA.pin } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    // Ledger semantics: TWO records — the original untouched + the amendment
    const records = useCaptureStore.getState().records;
    expect(records.length).toBe(2);
    expect(records[0].id).toBe("CAP-0001");
    expect(records[0].kind === "TANK_READING" && records[0].values.levelM3).toBe(20_000);
    expect(records[1].id).toBe("CAP-0002");
    expect(records[1].captureMeta.supersedesId).toBe("CAP-0001");

    // The trail now shows the chain with the new record in force
    expect(screen.getByText("CAP-0002")).toBeTruthy();
    expect(screen.getByText("REEMPLAZADO")).toBeTruthy();

    // And the world reflects the corrected level live
    const tank = useWorldStore.getState().world?.tanks.find((t) => t.id === "TNK-1");
    expect(tank?.currentLevelM3).toBe(21_000);
  });
});
