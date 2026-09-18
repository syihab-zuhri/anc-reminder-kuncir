import { describe, expect, it } from "vitest";
import { useFacilities, useMothersList, useVillages } from "../hooks/use-organization-data";

describe("organization data custom hooks exports and signatures", () => {
  it("exports useVillages, useFacilities, and useMothersList hooks", () => {
    expect(typeof useVillages).toBe("function");
    expect(typeof useFacilities).toBe("function");
    expect(typeof useMothersList).toBe("function");
  });
});
