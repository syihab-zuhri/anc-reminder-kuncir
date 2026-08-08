import { describe, expect, it } from "vitest";

import { createTrustedServerConfig } from "../src/trusted-origin.js";

describe("createTrustedServerConfig", () => {
  it("allows an HTTPS production origin and only that host", () => {
    expect(createTrustedServerConfig("https://anc.example.id/path", "production")).toEqual({
      allowNavigation: ["anc.example.id"],
      cleartext: false,
      url: "https://anc.example.id",
    });
  });

  it("allows cleartext only for local development", () => {
    expect(createTrustedServerConfig("http://localhost:3000", "development")).toEqual({
      allowNavigation: ["localhost"],
      cleartext: true,
      url: "http://localhost:3000",
    });
  });

  it("rejects a cleartext remote production origin", () => {
    expect(() => createTrustedServerConfig("http://anc.example.id", "production")).toThrow(
      "must use HTTPS",
    );
  });
});
