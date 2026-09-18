import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const staffStyles = readFileSync(resolve(process.cwd(), "app/staff/staff.css"), "utf8");

describe("desktop staff navigation positioning", () => {
  it("pins the sidebar to the viewport while reserving its desktop grid column", () => {
    const railRule = staffStyles.match(/\.staff-rail\s*\{([^}]*)\}/)?.[1];
    const mainRule = staffStyles.match(/\.staff-workspace-main\s*\{([^}]*)\}/)?.[1];

    expect(railRule).toBeDefined();
    expect(railRule).toMatch(/position:\s*fixed;/);
    expect(railRule).toMatch(/bottom:\s*0;/);
    expect(mainRule).toMatch(/grid-column:\s*2;/);
  });

  it("restores the sidebar to the mobile document layout", () => {
    const mobileRules = staffStyles.slice(staffStyles.indexOf("@media (max-width: 900px)"));
    const mobileRailRule = mobileRules.match(/\.staff-rail\s*\{([^}]*)\}/)?.[1];
    const mobileMainRule = mobileRules.match(/\.staff-workspace-main\s*\{([^}]*)\}/)?.[1];

    expect(mobileRailRule).toBeDefined();
    expect(mobileRailRule).toMatch(/position:\s*sticky;/);
    expect(mobileRailRule).toMatch(/bottom:\s*auto;/);
    expect(mobileRailRule).toMatch(/width:\s*100%;/);
    expect(mobileMainRule).toMatch(/grid-column:\s*1;/);
  });
});
