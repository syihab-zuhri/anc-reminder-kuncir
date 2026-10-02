import { describe, expect, it } from "vitest";

import {
  facilityPolicyLabel,
  formatDate,
  formatDateRange,
  todayInJakarta,
  villageLabel,
  visitStatusLabel,
} from "../lib/display-format";

describe("display formatting", () => {
  it("prints calendar dates the Indonesian way without shifting the day", () => {
    expect(formatDate("2026-04-16")).toBe("16 Apr 2026");
    expect(formatDate("2026-12-31")).toBe("31 Des 2026");
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined, "Sesuai jadwal")).toBe("Sesuai jadwal");
  });

  it("drops the repeated year in a range", () => {
    expect(formatDateRange("2026-04-16", "2026-07-22")).toBe("16 Apr – 22 Jul 2026");
    expect(formatDateRange("2026-12-20", "2027-01-05")).toBe("20 Des 2026 – 5 Jan 2027");
  });

  it("never prints the village prefix twice", () => {
    expect(villageLabel("Desa Kuncir")).toBe("Desa Kuncir");
    expect(villageLabel("Kuncir")).toBe("Desa Kuncir");
    expect(villageLabel("Kelurahan Ngetos")).toBe("Kelurahan Ngetos");
  });

  it("names statuses and facility rules in Indonesian", () => {
    expect(visitStatusLabel("OVERDUE")).toBe("Terlewat");
    expect(facilityPolicyLabel("PONED_OR_RS_REQUIRED")).toBe("Wajib di PONED atau rumah sakit");
    expect(facilityPolicyLabel("FLEXIBLE", true)).toBe("Posyandu / Bidan");
  });

  it("uses the Jakarta calendar day for today", () => {
    // 23:30 UTC on 1 Oct is already 06:30 WIB on 2 Oct.
    expect(todayInJakarta(new Date("2026-10-01T23:30:00Z"))).toBe("2026-10-02");
  });
});
