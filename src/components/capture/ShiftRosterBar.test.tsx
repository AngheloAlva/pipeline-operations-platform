/**
 * ShiftRosterBar tests (MV-10) — shift roster declaration UI.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ShiftRosterBar } from "./ShiftRosterBar";
import { resetCaptureStores, declareStandardRoster } from "./captureTestFixtures";
import { useCaptureStore } from "@/store/captureStore";

describe("ShiftRosterBar", () => {
  beforeEach(() => {
    resetCaptureStores();
  });

  it("shows the declaration form with every operator pre-checked when no roster exists", () => {
    render(<ShiftRosterBar />);
    expect(screen.getByLabelText(/estación de trabajo/i)).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.length).toBe(3);
    expect(checkboxes.every((c) => c.checked)).toBe(true);
  });

  it("declares the roster through the store and shows the declared crew", () => {
    render(<ShiftRosterBar />);
    fireEvent.click(screen.getByRole("button", { name: /declarar turno/i }));

    const roster = useCaptureStore.getState().activeRoster;
    expect(roster).not.toBeNull();
    expect(roster?.workstationId).toBe("WST-0585");
    expect(roster?.operatorIds).toEqual(["OPR-0580", "OPR-0581", "OPR-0599"]);

    // Declared view: workstation label + crew chips
    expect(screen.getByText(/SALA-OPS-PC1/)).toBeTruthy();
    expect(screen.getByText("María Soto")).toBeTruthy();
    expect(screen.getByText("Rosa Fuentes")).toBeTruthy();
  });

  it("excludes unchecked operators from the declared roster", () => {
    render(<ShiftRosterBar />);
    // Uncheck Rosa Fuentes
    const rosaCheckbox = screen
      .getAllByRole("checkbox")
      .find((c) => c.closest("label")?.textContent?.includes("Rosa Fuentes"));
    expect(rosaCheckbox).toBeTruthy();
    fireEvent.click(rosaCheckbox!);
    fireEvent.click(screen.getByRole("button", { name: /declarar turno/i }));

    const roster = useCaptureStore.getState().activeRoster;
    expect(roster?.operatorIds).toEqual(["OPR-0580", "OPR-0581"]);
  });

  it("rejects an empty crew with the store's message", () => {
    render(<ShiftRosterBar />);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }
    fireEvent.click(screen.getByRole("button", { name: /declarar turno/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/al menos un operador/i);
    expect(useCaptureStore.getState().activeRoster).toBeNull();
  });

  it("allows re-declaring the crew from the declared view", () => {
    declareStandardRoster();
    render(<ShiftRosterBar />);
    // Declared view first (María + Juan), then reopen the form
    fireEvent.click(screen.getByRole("button", { name: /cambiar dotación/i }));
    expect(screen.getByRole("button", { name: /declarar turno/i })).toBeTruthy();
  });
});
