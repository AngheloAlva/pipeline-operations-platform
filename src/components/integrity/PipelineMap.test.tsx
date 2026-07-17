import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import seedData from "@/lib/data/seed.json";
import { EquipmentType, type PipelineWorld } from "@/lib/domain";

vi.mock("@/store/selectionStore", () => ({
  EntityType: { CATHODIC_POINT: "CATHODIC_POINT" },
  useSelectionStore: (selector: (state: { selectEntity: () => void }) => unknown) =>
    selector({ selectEntity: () => undefined }),
}));

import { PipelineMap } from "./PipelineMap";

const seedWorld = seedData as unknown as PipelineWorld;

describe("PipelineMap dense labels", () => {
  it("keeps seeded stations inline with PKs while retaining every grouped rectifier marker", () => {
    const { container } = render(<PipelineMap world={seedWorld} selectedPointKey={null} />);
    const svg = container.querySelector("svg");
    const rectifierCount = seedWorld.equipment.filter(
      (equipment) => equipment.type === EquipmentType.RECTIFIER,
    ).length;

    expect(svg?.querySelector("title")?.textContent).toBe("Mapa de integridad catódica");
    expect(container.querySelectorAll("rect[transform^='rotate']")).toHaveLength(rectifierCount);

    for (const station of seedWorld.stations) {
      const label = Array.from(container.querySelectorAll("text")).find(
        (node) => node.textContent === `${station.name}pk${Math.round(station.km)}`,
      );
      expect(label?.querySelector("tspan")?.textContent).toBe(`pk${Math.round(station.km)}`);
    }

    const stationLabels = Array.from(container.querySelectorAll("text")).filter((node) =>
      seedWorld.stations.some((station) => node.textContent === `${station.name}pk${Math.round(station.km)}`),
    );
    const rectifierLabels = Array.from(container.querySelectorAll("text")).filter((node) =>
      node.textContent?.startsWith("REC-") || node.textContent?.startsWith("×"),
    );

    expect(rectifierLabels.length).toBeGreaterThan(0);
    expect(Math.max(...rectifierLabels.map((label) => Number(label.getAttribute("y"))))).toBeLessThan(
      Math.min(...stationLabels.map((label) => Number(label.getAttribute("y")))),
    );

    for (const marker of screen.getAllByRole("button", { name: /Cathodic point km/ })) {
      expect(marker.getAttribute("tabindex")).toBe("0");
    }
  });
});
