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

    const dialog = screen.getByRole("dialog", { name: "Captura de datos" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Roster declaration (no roster declared yet)
    expect(screen.getByText(/declarar dotación del turno/i)).toBeTruthy();
    // Type selector includes the representative deep capture flow.
    expect(screen.getByRole("tablist", { name: "Tipo de ingreso" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Lectura de estanque" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Movimiento" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Horas de bomba" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Novedad de turno" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Batch horario" })).toBeTruthy();
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("tab-TANK_READING");
    // Flagship form active by default
    expect(screen.getByLabelText(/nivel medido/i)).toBeTruthy();
  });

  it("switches the hosted form with the type selector", () => {
    render(<CaptureDrawer open onClose={() => {}} />);

    fireEvent.click(screen.getByRole("tab", { name: "Novedad de turno" }));
    expect(screen.getByLabelText(/descripción/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Movimiento" }));
    expect(screen.getByLabelText(/volumen/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Horas de bomba" }));
    expect(screen.getByLabelText(/horas de operación del turno/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Batch horario" }));
    expect(screen.getByLabelText(/flujómetro inicial/i)).toBeTruthy();
  });

  it("supports arrow-key navigation across capture types", () => {
    render(<CaptureDrawer open onClose={() => {}} />);

    const tankTab = screen.getByRole("tab", { name: "Lectura de estanque" });
    fireEvent.keyDown(tankTab, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: "Movimiento" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByLabelText(/volumen/i)).toBeTruthy();
  });

  it("lists committed records in the shift ledger and expands their trail", () => {
    declareStandardRoster();
    const result = useCaptureStore
      .getState()
      .commitTankReading(
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
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Captura de datos" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus inside on open and restores it after unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<CaptureDrawer open onClose={() => {}} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /cerrar captura de datos/i }),
    );

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
