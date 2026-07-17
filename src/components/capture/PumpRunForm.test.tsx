/**
 * PumpRunForm tests (MV-19) — the pump hour that advances the maintenance plan.
 * Acceptance (§7/§8 Slice 5): validation AT ENTRY (block vs warn with a clear
 * WHY), PIN required on a valid commit, live propagation of accumulated hours
 * to the world, and cross-nav to the affected /equipment/[id].
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PumpRunForm } from "./PumpRunForm";
import { resetCaptureStores, declareStandardRoster, MARIA } from "./captureTestFixtures";
import { useWorldStore } from "@/store/worldStore";
import { useCaptureStore } from "@/store/captureStore";

function hoursInput(): HTMLInputElement {
  return screen.getByLabelText(/horas de operación del turno/i) as HTMLInputElement;
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /confirmar con pin/i }) as HTMLButtonElement;
}

describe("PumpRunForm", () => {
  beforeEach(() => {
    resetCaptureStores();
    declareStandardRoster();
  });

  it("shows the selected equipment's accumulated hours and its usage-based outlook", () => {
    render(<PumpRunForm />);
    // Fixture pump J-100: 1995 h accumulated, BY_HOURS task due at 2000 h
    expect(screen.getByText(/horas acumuladas: 1.995 h/i)).toBeTruthy();
    expect(screen.getByText(/próxima mantención por horas a las 2.000 h/i)).toBeTruthy();
  });

  it("hard-blocks impossible hours (above 24 h per shift) with a clear WHY and disables confirm", () => {
    render(<PumpRunForm />);
    fireEvent.change(hoursInput(), { target: { value: "30" } });

    expect(screen.getByText(/físicamente imposible/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it("soft-warns hours beyond a typical shift but keeps confirm enabled", () => {
    render(<PumpRunForm />);
    fireEvent.change(hoursInput(), { target: { value: "16" } });

    expect(screen.getByText(/superan un turno típico/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(false);
  });

  it("keeps confirm disabled while no hours are typed", () => {
    render(<PumpRunForm />);
    expect(confirmButton().disabled).toBe(true);
  });

  it("renders the PIN dialog OUTSIDE the host form (nested <form> navigates in real browsers)", () => {
    render(<PumpRunForm />);
    fireEvent.change(hoursInput(), { target: { value: "8" } });
    fireEvent.click(confirmButton());

    expect(screen.getByLabelText("PIN")).toBeTruthy();
    expect(document.querySelector("form form")).toBeNull();
  });

  it("commits a valid run after PIN, accumulates the hours live, and links to the equipment", () => {
    render(<PumpRunForm />);
    fireEvent.change(hoursInput(), { target: { value: "8" } });
    fireEvent.click(confirmButton());

    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: MARIA.pin } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    // Success feedback names the record and the actor
    expect(screen.getByText(/CAP-0001 confirmado por María Soto/)).toBeTruthy();

    // Cross-nav: the success state offers the affected equipment detail
    const link = screen.getByRole("link", { name: /ver equipo/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/equipment/EQP-1");

    // Live propagation: 1995 + 8 = 2003 accumulated hours in the world
    const equipment = useWorldStore.getState().world?.equipment.find((e) => e.id === "EQP-1");
    expect(equipment?.operatingHours).toBe(2003);

    // Ledger: the record is stamped with actor + workstation + timestamp
    const record = useCaptureStore.getState().records[0];
    expect(record.captureMeta.authorId).toBe(MARIA.id);
    expect(record.captureMeta.workstationId).toBe("WST-0585");
  });

  it("rejects the commit attempt when no roster session exists", () => {
    useCaptureStore.setState({ workstationId: null, activeRoster: null });
    render(<PumpRunForm />);
    fireEvent.change(hoursInput(), { target: { value: "8" } });
    fireEvent.click(confirmButton());
    expect(screen.getByText(/declare la dotación del turno/i)).toBeTruthy();
  });
});
