/**
 * Tests for NavLinks — MV-16: the REPORTES module link is wired into the
 * main nav with the same active-state handling as the other modules.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock next/navigation — NavLinks needs usePathname
// ---------------------------------------------------------------------------

const usePathnameMock = vi.fn(() => "/cockpit");

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { NavLinks } from "./NavLinks";

describe("NavLinks — Reportes module link (MV-16)", () => {
  it("renders the Reportes link pointing at /reportes", () => {
    usePathnameMock.mockReturnValue("/cockpit");
    render(<NavLinks />);

    // Desktop nav is always in the DOM (mobile sheet only when open)
    const link = screen.getByRole("link", { name: "Reportes" });
    expect(link.getAttribute("href")).toBe("/reportes");
    expect(link.getAttribute("aria-current")).toBeNull();
  });

  it("marks Reportes active on /reportes and its sub-pages", () => {
    usePathnameMock.mockReturnValue("/reportes/allocation");
    render(<NavLinks />);

    const link = screen.getByRole("link", { name: "Reportes" });
    expect(link.getAttribute("aria-current")).toBe("page");
    // Sibling modules are not active
    const cockpit = screen.getByRole("link", { name: "Cockpit" });
    expect(cockpit.getAttribute("aria-current")).toBeNull();
  });
});
