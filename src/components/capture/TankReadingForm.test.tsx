/**
 * TankReadingForm tests (MV-11) — flagship capture flow.
 * Acceptance (§6.4): validation AT ENTRY (block vs warn with a clear WHY),
 * PIN required on a valid commit, live propagation to the world.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { TankReadingForm } from "./TankReadingForm";
import { resetCaptureStores, declareStandardRoster, MARIA } from "./captureTestFixtures";
import { useWorldStore } from "@/store/worldStore";
import { useCaptureStore } from "@/store/captureStore";
import { useSimulationStore } from "@/store/simulationStore";

function levelInput(): HTMLInputElement {
  return screen.getByLabelText(/nivel medido/i) as HTMLInputElement;
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /confirmar con pin/i }) as HTMLButtonElement;
}

describe("TankReadingForm", () => {
  beforeEach(() => {
    resetCaptureStores();
    declareStandardRoster();
  });

  it("hard-blocks an impossible level (above capacity) with a clear WHY and disables confirm", () => {
    render(<TankReadingForm />);
    // T-101 capacity is 30 000 m³
    fireEvent.change(levelInput(), { target: { value: "40000" } });

    expect(screen.getByText(/supera la capacidad/i)).toBeTruthy();
    expect(screen.getByText(/físicamente imposible/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it("soft-warns an unusual level (beyond tolerance) but keeps confirm enabled", () => {
    render(<TankReadingForm />);
    // Book level is 18 000 m³ — 25 000 differs ~38.9% (warn, not block)
    fireEvent.change(levelInput(), { target: { value: "25000" } });

    expect(screen.getByText(/supera la tolerancia/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(false);
  });

  it("keeps confirm disabled while no level is typed", () => {
    render(<TankReadingForm />);
    expect(confirmButton().disabled).toBe(true);
  });

  it("accepts 24.421 m³ at 32 °F when it equals the live stock and explains the derived preview", () => {
    useSimulationStore.getState().applyCapturedLevels({ "TNK-1": 24_421 });
    render(<TankReadingForm />);
    fireEvent.change(levelInput(), { target: { value: "24.421" } });
    fireEvent.change(screen.getByLabelText(/temperatura/i), { target: { value: "32" } });

    expect(screen.queryByText(/supera la tolerancia/i)).toBeNull();
    expect(screen.getByText("Vista previa viva")).toBeTruthy();
    expect(screen.getByText(/Volumen a 15 °C/i)).toBeTruthy();
    expect(screen.getByText(/Descuadre estimado/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(false);
  });

  it("renders the PIN dialog OUTSIDE the host form (nested <form> navigates in real browsers)", () => {
    // Regression (MV-14 browser smoke): a <form> nested inside another <form>
    // is invalid HTML; in a real browser React never dispatched the inner
    // form's onSubmit, so confirming the PIN navigated the page and wiped the
    // whole in-memory session. The PIN dialog must be portaled out.
    render(<TankReadingForm />);
    fireEvent.change(levelInput(), { target: { value: "18100" } });
    fireEvent.click(confirmButton());

    // PIN dialog is open…
    expect(screen.getByLabelText("PIN")).toBeTruthy();
    // …and no form is a DOM descendant of another form
    expect(document.querySelector("form form")).toBeNull();
  });

  it("commits a valid reading after PIN and propagates it to the world live", () => {
    render(<TankReadingForm />);
    fireEvent.change(levelInput(), { target: { value: "18100" } });
    fireEvent.click(confirmButton());

    // PinPrompt opens; in the demo any non-empty PIN commits
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: MARIA.pin } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    // Success feedback names the record and the actor
    expect(screen.getByText(/CAP-0001 confirmado por María Soto/)).toBeTruthy();

    // The PIN dialog closed — the portaled form's submit must NOT propagate
    // to the host form's onSubmit, which would re-open the prompt (MV-14).
    expect(screen.queryByLabelText("PIN")).toBeNull();

    // Live propagation: the in-memory world already carries the new level
    const tank = useWorldStore.getState().world?.tanks.find((t) => t.id === "TNK-1");
    expect(tank?.currentLevelM3).toBe(18_100);

    // Ledger: the record is stamped with actor + workstation + timestamp
    const record = useCaptureStore.getState().records[0];
    expect(record.captureMeta.authorId).toBe(MARIA.id);
    expect(record.captureMeta.workstationId).toBe("WST-0585");
    expect(record.captureMeta.enteredAt).toBeTruthy();
  });

  it("rejects the commit attempt when no roster session exists", () => {
    useCaptureStore.setState({ workstationId: null, activeRoster: null });
    render(<TankReadingForm />);
    fireEvent.change(levelInput(), { target: { value: "18100" } });
    fireEvent.click(confirmButton());
    // PinPrompt has no roster to offer
    expect(screen.getByText(/declare la dotación del turno/i)).toBeTruthy();
  });
});
