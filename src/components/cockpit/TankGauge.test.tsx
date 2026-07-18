import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TankGauge } from "./TankGauge";

describe("TankGauge", () => {
  it("shows the operational m³ value and marks calculated values", () => {
    render(<TankGauge tankId="TNK-1" level={18_000} capacity={30_000} label="T-101" />);
    expect(screen.getByText("18.000 m³")).toBeTruthy();
    expect(screen.getByLabelText("Calculado por el sistema")).toBeTruthy();
  });

  it("exposes stable hooks for fill transition and alarm pulse reduction", () => {
    const { container } = render(
      <TankGauge tankId="TNK-1" level={28_500} capacity={30_000} label="T-101" />,
    );
    expect(container.querySelector(".tank-gauge-fill-motion")).toBeTruthy();
    expect(container.querySelector(".tank-gauge-alarm-pulse")).toBeTruthy();
  });
});
