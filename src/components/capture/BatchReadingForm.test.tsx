import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useCaptureStore, CaptureRecordKind } from "@/store/captureStore";
import { useWorldStore } from "@/store/worldStore";
import { BatchReadingForm } from "./BatchReadingForm";
import { declareStandardRoster, MARIA, resetCaptureStores } from "./captureTestFixtures";

describe("BatchReadingForm", () => {
  beforeEach(() => {
    resetCaptureStores();
    declareStandardRoster();
  });

  it("derives custody volumes, barrels and new stocks before confirmation", () => {
    render(<BatchReadingForm />);
    fireEvent.change(screen.getByLabelText(/flujómetro inicial/i), {
      target: { value: "120.000" },
    });
    fireEvent.change(screen.getByLabelText(/flujómetro final/i), { target: { value: "121.250" } });
    fireEvent.change(screen.getByLabelText(/temperatura \(°F\)/i), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText(/gravedad api/i), { target: { value: "35" } });

    expect(screen.getByText("Cálculo automático del batch")).toBeTruthy();
    expect(screen.getByText(/GSV a 15 °C/i)).toBeTruthy();
    expect(screen.getByText(/BRLS/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /confirmar batch con pin/i }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("commits through the existing movement ledger and updates both stocks", () => {
    render(<BatchReadingForm />);
    fireEvent.change(screen.getByLabelText(/flujómetro inicial/i), { target: { value: "120000" } });
    fireEvent.change(screen.getByLabelText(/flujómetro final/i), { target: { value: "121250" } });
    fireEvent.change(screen.getByLabelText(/temperatura \(°F\)/i), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText(/gravedad api/i), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar batch con pin/i }));
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: MARIA.pin } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    const record = useCaptureStore.getState().records[0];
    expect(record.kind).toBe(CaptureRecordKind.MOVEMENT);
    expect(
      useWorldStore.getState().world?.tanks.find((tank) => tank.id === "TNK-1")?.currentLevelM3,
    ).toBe(16750);
    expect(
      useWorldStore.getState().world?.tanks.find((tank) => tank.id === "TNK-2")?.currentLevelM3,
    ).toBe(28750);
  });
});
