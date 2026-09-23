import { describe, expect, it } from "vitest";
import { hueForPath, navSections, titleForPath } from "../../web/src/lib/nav";

describe("hueForPath", () => {
  it("gives every nav item a hue token", () => {
    for (const item of navSections.flatMap((s) => s.items)) {
      expect(item.hue).toMatch(/^var\(--color-nav-[a-z]+\)$/);
    }
  });

  it("matches the overview only on the exact root path", () => {
    expect(hueForPath("/")).toBe("var(--color-nav-overview)");
  });

  it("matches nested routes by prefix", () => {
    expect(hueForPath("/rankings")).toBe("var(--color-nav-ranking)");
    expect(hueForPath("/members/42")).toBe("var(--color-nav-members)");
    expect(hueForPath("/activities/bear_trap")).toBe("var(--color-nav-activities)");
    expect(hueForPath("/admin/roster")).toBe("var(--color-nav-admin)");
    expect(hueForPath("/kvk/keys")).toBe("var(--color-nav-kvk)");
  });

  it("returns null for an unknown path", () => {
    expect(hueForPath("/nope")).toBeNull();
  });
});

describe("titleForPath", () => {
  it("matches nested /kvk routes by prefix", () => {
    expect(titleForPath("/kvk/settings")).toBe("nav.kvk");
  });
});
