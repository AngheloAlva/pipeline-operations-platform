/**
 * ShiftNoteForm tests (MV-11) — structured shift note stamped with
 * actor + workstation + timestamp.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ShiftNoteForm } from "./ShiftNoteForm";
import { resetCaptureStores, declareStandardRoster, MARIA } from "./captureTestFixtures";
import { useWorldStore } from "@/store/worldStore";

function descriptionInput(): HTMLTextAreaElement {
  return screen.getByLabelText(/descripción/i) as HTMLTextAreaElement;
}

function registerButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /registrar con pin/i }) as HTMLButtonElement;
}

describe("ShiftNoteForm", () => {
  beforeEach(() => {
    resetCaptureStores();
    declareStandardRoster();
  });

  it("keeps the register button disabled while the description is empty", () => {
    render(<ShiftNoteForm />);
    expect(registerButton().disabled).toBe(true);
  });

  it("blocks a whitespace-only description with a clear message", () => {
    render(<ShiftNoteForm />);
    fireEvent.change(descriptionInput(), { target: { value: "   " } });
    expect(screen.getByText(/no puede quedar vacía/i)).toBeTruthy();
    expect(registerButton().disabled).toBe(true);
  });

  it("commits a structured note stamped with actor + workstation + timestamp", () => {
    render(<ShiftNoteForm />);
    fireEvent.change(screen.getByLabelText(/tipo de novedad/i), {
      target: { value: "INCIDENT" },
    });
    fireEvent.change(descriptionInput(), {
      target: { value: "Vibración anómala en bomba P-201, se detuvo y avisó a mantención." },
    });
    fireEvent.change(screen.getByLabelText(/estación asociada/i), {
      target: { value: "STA-1" },
    });
    fireEvent.click(registerButton());

    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: MARIA.pin } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    // Feedback carries the stamp: actor + workstation
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/registrada por María Soto/);
    expect(status.textContent).toMatch(/SALA-OPS-PC1/);

    // The note reached the in-memory world's shift log, fully stamped
    const entries = useWorldStore.getState().world?.shiftLogEntries ?? [];
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe("INCIDENT");
    expect(entries[0].stationId).toBe("STA-1");
    expect(entries[0].authorId).toBe(MARIA.id);
    expect(entries[0].workstationId).toBe("WST-0585");
    expect(entries[0].timestamp).toBeTruthy();
  });
});
