/**
 * PinPrompt tests (MV-10) — per-action identity UI.
 * Component tests via RTL; native assertions only (no jest-dom).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PinPrompt } from "./PinPrompt";
import { declareStandardRoster, resetCaptureStores, MARIA } from "./captureTestFixtures";

describe("PinPrompt", () => {
  beforeEach(() => {
    resetCaptureStores();
  });

  it("renders nothing when closed", () => {
    declareStandardRoster();
    const { container } = render(
      <PinPrompt open={false} title="Confirmar" onCancel={() => {}} onResolved={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("asks to declare the roster when no session exists", () => {
    render(
      <PinPrompt open title="Confirmar" onCancel={() => {}} onResolved={() => {}} />,
    );
    expect(screen.getByText(/declare la dotación del turno/i)).toBeTruthy();
  });

  it("offers only the declared roster operators in the selector", () => {
    declareStandardRoster();
    render(
      <PinPrompt open title="Confirmar" onCancel={() => {}} onResolved={() => {}} />,
    );
    const select = screen.getByLabelText(/operador/i) as HTMLSelectElement;
    const names = Array.from(select.options).map((o) => o.textContent);
    // Rosa Fuentes exists in the world but is NOT on the declared roster.
    expect(names.some((n) => n?.includes("María Soto"))).toBe(true);
    expect(names.some((n) => n?.includes("Juan Pérez"))).toBe(true);
    expect(names.some((n) => n?.includes("Rosa Fuentes"))).toBe(false);
  });

  it("accepts any non-empty PIN in the demo and resolves the actor", () => {
    declareStandardRoster();
    const onResolved = vi.fn();
    render(<PinPrompt open title="Confirmar" onCancel={() => {}} onResolved={onResolved} />);

    fireEvent.change(screen.getByLabelText(/operador/i), { target: { value: MARIA.id } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onResolved).toHaveBeenCalledTimes(1);
    const [operator] = onResolved.mock.calls[0];
    expect(operator.id).toBe(MARIA.id);
  });

  it("resolves the actor on a correct PIN and returns it to the caller", () => {
    declareStandardRoster();
    const onResolved = vi.fn();
    render(<PinPrompt open title="Confirmar" onCancel={() => {}} onResolved={onResolved} />);

    fireEvent.change(screen.getByLabelText(/operador/i), { target: { value: MARIA.id } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: MARIA.pin } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onResolved).toHaveBeenCalledTimes(1);
    const [operator, credential] = onResolved.mock.calls[0];
    expect(operator.id).toBe(MARIA.id);
    expect(operator.name).toBe("María Soto");
    expect(credential).toEqual({ operatorId: MARIA.id, pin: MARIA.pin });
  });

  it("cancels via the Cancelar button", () => {
    declareStandardRoster();
    const onCancel = vi.fn();
    render(<PinPrompt open title="Confirmar" onCancel={onCancel} onResolved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
