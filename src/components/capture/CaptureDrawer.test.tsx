/**
 * CaptureDrawer tests (MV-10) — drawer container with capture-type selector,
 * hosted forms and the shift's capture ledger.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CaptureDrawer } from "./CaptureDrawer";
import { resetCaptureStores, declareStandardRoster, MARIA } from "./captureTestFixtures";
import { useCaptureStore, CommitStatus } from "@/store/captureStore";

describe("CaptureDrawer", () => {
  beforeEach(() => {
    resetCaptureStores();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<CaptureDrawer open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("opens with the roster declaration, the type selector and the flagship form", () => {
    render(<CaptureDrawer open onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Captura de datos" })).toBeTruthy();
    // Roster declaration (no roster declared yet)
    expect(screen.getByText(/declarar dotación del turno/i)).toBeTruthy();
    // Type selector with the four capture flows
    expect(screen.getByRole("button", { name: "Lectura de estanque" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Movimiento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Horas de bomba" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Novedad de turno" })).toBeTruthy();
    // Flagship form active by default
    expect(screen.getByLabelText(/nivel medido/i)).toBeTruthy();
  });

  it("switches the hosted form with the type selector", () => {
    render(<CaptureDrawer open onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Novedad de turno" }));
    expect(screen.getByLabelText(/descripción/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Movimiento" }));
    expect(screen.getByLabelText(/volumen/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Horas de bomba" }));
    expect(screen.getByLabelText(/horas de operación del turno/i)).toBeTruthy();
  });

  it("lists committed records in the shift ledger and expands their trail", () => {
    declareStandardRoster();
    const result = useCaptureStore.getState().commitTankReading(
      { tankId: "TNK-1", levelM3: 20_000 },
      { operatorId: MARIA.id, pin: MARIA.pin },
      { enteredAt: "2026-06-12T20:30:00.000Z" },
    );
    expect(result.status).toBe(CommitStatus.COMMITTED);

    render(<CaptureDrawer open onClose={() => {}} />);

    expect(screen.getByText(/CAP-0001 · Lectura de estanque/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /traza \/ corregir/i }));
    expect(screen.getByText("Traza de enmiendas")).toBeTruthy();
    expect(screen.getByText("VIGENTE")).toBeTruthy();
  });

  it("closes via the close button and the backdrop", () => {
    const onClose = vi.fn();
    render(<CaptureDrawer open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar captura de datos/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<CaptureDrawer open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
