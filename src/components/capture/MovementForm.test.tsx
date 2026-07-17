/**
 * MovementForm tests (MV-11) — movement capture with validation at entry.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MovementForm } from "./MovementForm";
import { resetCaptureStores, declareStandardRoster, MARIA } from "./captureTestFixtures";
import { useWorldStore } from "@/store/worldStore";

function volumeInput(): HTMLInputElement {
  return screen.getByLabelText(/volumen/i) as HTMLInputElement;
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /confirmar con pin/i }) as HTMLButtonElement;
}

describe("MovementForm", () => {
  beforeEach(() => {
    resetCaptureStores();
    declareStandardRoster();
  });

  it("defaults origin and destination to the first two tanks", () => {
    render(<MovementForm />);
    expect((screen.getByLabelText("Origen") as HTMLSelectElement).value).toBe("TNK-1");
    expect((screen.getByLabelText("Destino") as HTMLSelectElement).value).toBe("TNK-2");
  });

  it("hard-blocks a movement that would overfill the destination tank", () => {
    render(<MovementForm />);
    // T-6010 holds 27 500 of 50 000 m³ — 30 000 more would overfill it
    // (and T-101 only holds 18 000, so origin stock also blocks).
    fireEvent.change(volumeInput(), { target: { value: "30000" } });

    expect(screen.getByText(/sobrellenaría el estanque/i)).toBeTruthy();
    expect(screen.getByText(/no puede despachar/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it("hard-blocks origin equal to destination", () => {
    render(<MovementForm />);
    fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "TNK-1" } });
    fireEvent.change(volumeInput(), { target: { value: "1000" } });

    expect(screen.getByText(/no pueden ser el mismo nodo/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it("commits a valid movement after PIN and moves both tank levels live", () => {
    render(<MovementForm />);
    fireEvent.change(volumeInput(), { target: { value: "5000" } });
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());

    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: MARIA.pin } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByText(/CAP-0001 confirmado por María Soto/)).toBeTruthy();

    const world = useWorldStore.getState().world;
    expect(world?.movements.length).toBe(1);
    expect(world?.movements[0].captureMeta?.authorId).toBe(MARIA.id);
    expect(world?.tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBe(13_000);
    expect(world?.tanks.find((t) => t.id === "TNK-2")?.currentLevelM3).toBe(32_500);
  });
});
