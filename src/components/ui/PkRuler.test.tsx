import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import seedData from "@/lib/data/seed.json";
import type { Pipeline, PipelineWorld, Station } from "@/lib/domain";
import { PkRuler, buildCollisionFreeStationLabels } from "./PkRuler";

const seedWorld = seedData as unknown as PipelineWorld;

const pipeline: Pipeline = {
  id: "PL-1",
  name: "Oleoducto de prueba",
  diameterInches: 16,
  totalLengthKm: 270,
  segments: [],
};

function station(id: string, name: string, km: number): Station {
  return {
    id,
    name,
    km,
    kind: "SOURCE",
    pipelineId: pipeline.id,
  };
}

describe("buildCollisionFreeStationLabels", () => {
  it("assigns overlapping endpoint labels to separate lanes without hiding any station", () => {
    const stations = [
      station("oldelval", "Ingreso OldelVal", 0.3),
      station("vmon", "Ingreso VMON", 0.7),
      station("ypf", "Ingreso Activo YPF", 1.1),
      station("puerto", "Puerto Hernández", 2),
    ];

    const placements = buildCollisionFreeStationLabels(stations, (km) => km * 4);

    expect(placements.map((placement) => placement.stationId)).toEqual([
      "oldelval",
      "vmon",
      "ypf",
      "puerto",
    ]);
    expect(new Set(placements.map((placement) => placement.lane)).size).toBe(stations.length);
  });

  it("keeps label intervals disjoint within each lane", () => {
    const placements = buildCollisionFreeStationLabels(
      [
        station("a", "Estación A", 0),
        station("b", "Estación B", 3),
        station("c", "Estación C", 30),
      ],
      (km) => km * 4,
    );

    for (const lane of new Set(placements.map((placement) => placement.lane))) {
      const inLane = placements.filter((placement) => placement.lane === lane);
      for (let index = 1; index < inLane.length; index += 1) {
        expect(inLane[index - 1].right).toBeLessThanOrEqual(inLane[index].left);
      }
    }
  });

  it("grows endpoint labels inward while retaining centered intervals for central labels", () => {
    const [left, center, right] = buildCollisionFreeStationLabels(
      [
        station("left", "Terminal occidental de transferencia", 0),
        station("center", "Estación central", 50),
        station("right", "Terminal oriental de transferencia", 100),
      ],
      (km) => km * 10,
      { left: 0, right: 1000 },
    );

    expect(left).toMatchObject({ x: 0, textAnchor: "start" });
    expect(left.x - left.left).toBe(4);
    expect(center).toMatchObject({ x: 500, textAnchor: "middle" });
    expect(center.left + center.right).toBe(center.x * 2);
    expect(right).toMatchObject({ x: 1000, textAnchor: "end" });
    expect(right.right - right.x).toBe(4);
  });
});

describe("PkRuler collision-free station labels", () => {
  it("preserves the compact two-line label and original ruler height by default", () => {
    const { container } = render(
      <PkRuler pipeline={pipeline} stations={[station("source", "Fuente", 0)]} />,
    );

    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 1080 64");
    expect(container.querySelector("svg g text")?.querySelector("tspan")).toBeNull();
    expect(screen.getByText("pk0")).not.toBeNull();
  });

  it("anchors long endpoint labels inward while leaving central labels centered", () => {
    const stations = [
      station("left", "Terminal occidental de transferencia", 0),
      station("center", "Estación central", 135),
      station("right", "Terminal oriental de transferencia", 270),
    ];

    render(<PkRuler pipeline={pipeline} stations={stations} stationLabelLayout="collision-free" />);

    expect(
      screen
        .getByRole("group", { name: "Terminal occidental de transferencia · pk 0" })
        .querySelector("text")
        ?.getAttribute("text-anchor"),
    ).toBe("start");
    expect(
      screen
        .getByRole("group", { name: "Estación central · pk 135" })
        .querySelector("text")
        ?.getAttribute("text-anchor"),
    ).toBe("middle");
    expect(
      screen
        .getByRole("group", { name: "Terminal oriental de transferencia · pk 270" })
        .querySelector("text")
        ?.getAttribute("text-anchor"),
    ).toBe("end");
  });

  it("keeps each marker focusable with its full station detail available by title", () => {
    const stations = [
      station("oldelval", "Ingreso OldelVal", 0.3),
      station("vmon", "Ingreso VMON", 0.7),
    ];

    render(<PkRuler pipeline={pipeline} stations={stations} stationLabelLayout="collision-free" />);

    const marker = screen.getByRole("group", { name: "Ingreso OldelVal · pk 0" });
    expect(marker.getAttribute("tabindex")).toBe("0");
    expect(marker.querySelector("title")?.textContent).toBe("Ingreso OldelVal · pk 0");

    const label = marker.querySelector("text");
    expect(label?.textContent).toBe("Ingreso OldelValpk0");
    expect(label?.querySelector("tspan")?.textContent).toBe("pk0");
    expect(marker.closest("svg")?.getAttribute("viewBox")).toBe("0 0 1080 70");
  });

  it("keeps every seeded station discoverable when the endpoint cluster needs multiple lanes", () => {
    render(
      <PkRuler
        pipeline={seedWorld.pipeline}
        stations={seedWorld.stations}
        stationLabelLayout="collision-free"
      />,
    );

    for (const station of seedWorld.stations) {
      const marker = screen.getByRole("group", {
        name: `${station.name} · pk ${Math.round(station.km)}`,
      });
      expect(marker.getAttribute("tabindex")).toBe("0");
    }
  });
});
