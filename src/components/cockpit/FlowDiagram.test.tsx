import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import seedData from "@/lib/data/seed.json";
import type { PipelineWorld } from "@/lib/domain";

vi.mock("@/store/simulationStore", () => ({
  selectTankLevel: () => () => 0,
  useActiveFlows: () => [],
  useSimulationStore: (selector: (state: { isRunning: boolean }) => unknown) =>
    selector({ isRunning: false }),
}));

vi.mock("@/store/selectionStore", () => ({
  EntityType: { STATION: "STATION", TANK: "TANK" },
  useSelectionStore: (selector: (state: { selectedEntityId: null; selectEntity: () => void }) => unknown) =>
    selector({ selectedEntityId: null, selectEntity: () => undefined }),
}));

vi.mock("./TankGauge", () => ({
  TankGauge: ({ label }: { label: string }) => <div>{label}</div>,
}));

import { FlowDiagram } from "./FlowDiagram";

const seedWorld = seedData as unknown as PipelineWorld;

describe("FlowDiagram dense station labels", () => {
  it("keeps every seeded endpoint marker focusable with inline PK labels in separate lanes", () => {
    const { container } = render(<FlowDiagram world={seedWorld} />);
    const svg = container.querySelector("svg");

    expect(svg?.querySelector("title")?.textContent).toBe("Diagrama de flujo del oleoducto");

    for (const station of seedWorld.stations) {
      const marker = screen.getByRole("button", {
        name: `Estación ${station.name} · pk ${Math.round(station.km)}`,
      });
      expect(marker.getAttribute("tabindex")).toBe("0");
      expect(marker.querySelector("title")?.textContent).toBe(
        `Estación ${station.name} · pk ${Math.round(station.km)}`,
      );
    }

    const labels = seedWorld.stations.map((station) => {
      const label = Array.from(container.querySelectorAll("text")).find(
        (node) => node.textContent === `${station.name}pk${Math.round(station.km)}`,
      );
      expect(label?.querySelector("tspan")?.textContent).toBe(`pk${Math.round(station.km)}`);
      return label;
    });

    const endpointLabels = labels.slice(0, 4);
    expect(new Set(endpointLabels.map((label) => label?.getAttribute("y"))).size).toBe(4);
    expect(endpointLabels[0]?.getAttribute("text-anchor")).toBe("start");
  });
});
