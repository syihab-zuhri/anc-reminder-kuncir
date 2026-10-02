import { describe, expect, it } from "vitest";
import { useFacilities, useVillages } from "../hooks/use-organization-data";

describe("organization data custom hooks exports and signatures", () => {
  it("exports useVillages and useFacilities hooks", () => {
    expect(typeof useVillages).toBe("function");
    expect(typeof useFacilities).toBe("function");
  });
});
