import { describe, expect, it } from "vitest";

import { dateOnlyInTimezone } from "../src/registry/registry-validation.js";
import { startOfLocalDate } from "../src/time/local-date.js";

describe("local calendar date conversion", () => {
  it("stores Asia/Jakarta midnight as the corresponding UTC instant", () => {
    const instant = startOfLocalDate("2026-08-12", "Asia/Jakarta");

    expect(instant.toISOString()).toBe("2026-08-11T17:00:00.000Z");
    expect(dateOnlyInTimezone(instant, "Asia/Jakarta")).toBe("2026-08-12");
  });

  it("handles timezone offsets that change across daylight-saving boundaries", () => {
    const winter = startOfLocalDate("2026-01-15", "America/New_York");
    const summer = startOfLocalDate("2026-07-15", "America/New_York");

    expect(winter.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });
});
