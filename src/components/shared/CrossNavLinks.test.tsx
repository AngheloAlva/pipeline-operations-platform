/**
 * CrossNavLinks render tests — TDD (RED→GREEN).
 * F4-3-R1 through F4-3-R8: href correctness per entity type, exclude/hub-link rules.
 *
 * Uses @testing-library/react for DOM rendering and link href assertions.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EntityType } from "@/store/selectionStore";
import type { ResolvedEntity } from "@/lib/domain/resolveEntity";
import { CrossNavLinks } from "./CrossNavLinks";
// ResolvedEntity is imported for null-cast test below (used via 'as unknown as ResolvedEntity')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EQUIPMENT_ENTITY: ResolvedEntity = {
  id: "EQP-0012",
  type: EntityType.EQUIPMENT,
  stationId: "STA-0005",
};

const STATION_ENTITY: ResolvedEntity = {
  id: "STA-0001",
  type: EntityType.STATION,
  stationId: "STA-0001",
};

const TANK_ENTITY: ResolvedEntity = {
  id: "TNK-0001",
  type: EntityType.TANK,
  stationId: "STA-0001",
};

const CATHODIC_WITH_STATION: ResolvedEntity = {
  id: "12.5:SEG-001",
  type: EntityType.CATHODIC_POINT,
  stationId: "STA-0007",
};

const CATHODIC_NO_STATION: ResolvedEntity = {
  id: "15.0:SEG-002",
  type: EntityType.CATHODIC_POINT,
  stationId: null,
};

// ---------------------------------------------------------------------------
// Helper — get all rendered hrefs
// ---------------------------------------------------------------------------

function getAllHrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
}

// ---------------------------------------------------------------------------
// EQUIPMENT entity tests
// ---------------------------------------------------------------------------

describe("CrossNavLinks — EQUIPMENT entity", () => {
  it("renders hub link + cockpit + maintenance + integrity links (no exclude)", () => {
    const { container } = render(
      <CrossNavLinks entity={EQUIPMENT_ENTITY} />,
    );
    const hrefs = getAllHrefs(container);

    // Hub link: /equipment/<id>
    expect(hrefs).toContain("/equipment/EQP-0012");
    // Cockpit: stationId focus (equipment bridges via station)
    expect(hrefs).toContain("/cockpit?focus=STA-0005");
    // Maintenance: equipment id focus (maintenance natively selects equipment)
    expect(hrefs).toContain("/maintenance?focus=EQP-0012");
    // Integrity: stationId focus
    expect(hrefs).toContain("/integrity?focus=STA-0005");
  });

  it("excludes equipment hub link when 'equipment' is in exclude", () => {
    const { container } = render(
      <CrossNavLinks entity={EQUIPMENT_ENTITY} exclude={["equipment"]} />,
    );
    const hrefs = getAllHrefs(container);

    expect(hrefs).not.toContain("/equipment/EQP-0012");
    // Other module links still present
    expect(hrefs).toContain("/cockpit?focus=STA-0005");
    expect(hrefs).toContain("/maintenance?focus=EQP-0012");
    expect(hrefs).toContain("/integrity?focus=STA-0005");
  });

  it("excludes 'maintenance' link when maintenance is in exclude", () => {
    const { container } = render(
      <CrossNavLinks entity={EQUIPMENT_ENTITY} exclude={["maintenance"]} />,
    );
    const hrefs = getAllHrefs(container);

    expect(hrefs).not.toContain("/maintenance?focus=EQP-0012");
    expect(hrefs).toContain("/equipment/EQP-0012");
    expect(hrefs).toContain("/cockpit?focus=STA-0005");
    expect(hrefs).toContain("/integrity?focus=STA-0005");
  });
});

// ---------------------------------------------------------------------------
// STATION entity tests
// ---------------------------------------------------------------------------

describe("CrossNavLinks — STATION entity", () => {
  it("does NOT render hub link; cockpit excluded via exclude prop", () => {
    const { container } = render(
      <CrossNavLinks entity={STATION_ENTITY} exclude={["cockpit"]} />,
    );
    const hrefs = getAllHrefs(container);

    // No equipment hub link — station is not an equipment
    expect(hrefs.some((h) => h.startsWith("/equipment/"))).toBe(false);
    // Cockpit link excluded
    expect(hrefs.some((h) => h.startsWith("/cockpit"))).toBe(false);
    // Maintenance and integrity use stationId (which IS entity.id for a station)
    expect(hrefs).toContain("/maintenance?focus=STA-0001");
    expect(hrefs).toContain("/integrity?focus=STA-0001");
  });

  it("shows cockpit link when not excluded (uses entity.id)", () => {
    const { container } = render(
      <CrossNavLinks entity={STATION_ENTITY} />,
    );
    const hrefs = getAllHrefs(container);
    expect(hrefs).toContain("/cockpit?focus=STA-0001");
  });
});

// ---------------------------------------------------------------------------
// TANK entity tests
// ---------------------------------------------------------------------------

describe("CrossNavLinks — TANK entity", () => {
  it("does NOT render hub link; links use stationId for maintenance/integrity", () => {
    const { container } = render(
      <CrossNavLinks entity={TANK_ENTITY} exclude={["cockpit"]} />,
    );
    const hrefs = getAllHrefs(container);

    // No equipment hub link
    expect(hrefs.some((h) => h.startsWith("/equipment/"))).toBe(false);
    // Maintenance → stationId
    expect(hrefs).toContain("/maintenance?focus=STA-0001");
    // Integrity → stationId
    expect(hrefs).toContain("/integrity?focus=STA-0001");
    // Cockpit excluded
    expect(hrefs.some((h) => h.startsWith("/cockpit"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CATHODIC_POINT with stationId tests
// ---------------------------------------------------------------------------

describe("CrossNavLinks — CATHODIC_POINT with stationId", () => {
  it("renders cockpit + maintenance links using stationId; no hub link; integrity excluded", () => {
    const { container } = render(
      <CrossNavLinks entity={CATHODIC_WITH_STATION} exclude={["integrity"]} />,
    );
    const hrefs = getAllHrefs(container);

    // No equipment hub link
    expect(hrefs.some((h) => h.startsWith("/equipment/"))).toBe(false);
    // Cockpit and maintenance use stationId
    expect(hrefs).toContain("/cockpit?focus=STA-0007");
    expect(hrefs).toContain("/maintenance?focus=STA-0007");
    // Integrity excluded
    expect(hrefs.some((h) => h.startsWith("/integrity"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CATHODIC_POINT with null stationId — the critical null-bridge case
// ---------------------------------------------------------------------------

describe("CrossNavLinks — CATHODIC_POINT with null stationId", () => {
  it("renders nothing (no dead links, no ?focus=null in DOM)", () => {
    const { container } = render(
      <CrossNavLinks entity={CATHODIC_NO_STATION} exclude={["integrity"]} />,
    );
    const hrefs = getAllHrefs(container);

    // No ?focus=null link
    expect(hrefs.some((h) => h.includes("focus=null"))).toBe(false);
    // No cockpit or maintenance links (stationId is null, so buildFocusHref returns null)
    expect(hrefs.some((h) => h.startsWith("/cockpit"))).toBe(false);
    expect(hrefs.some((h) => h.startsWith("/maintenance"))).toBe(false);
    // No equipment hub link
    expect(hrefs.some((h) => h.startsWith("/equipment/"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// null entity — F4-3-R8
// ---------------------------------------------------------------------------

describe("CrossNavLinks — null entity", () => {
  it("renders nothing and does not throw", () => {
    const { container } = render(<CrossNavLinks entity={null as unknown as ResolvedEntity} />);
    expect(getAllHrefs(container)).toHaveLength(0);
    // No text content either
    expect(container.textContent?.trim()).toBe("");
  });
});
