import { describe, expect, it } from "vitest";

import { createTrustedServerConfig } from "../src/trusted-origin.js";

describe("createTrustedServerConfig", () => {
  it("allows an HTTPS production origin and only that host", () => {
    expect(createTrustedServerConfig("https://anc.example.id/path", "production")).toEqual({
      allowNavigation: ["anc.example.id"],
      cleartext: false,
      errorPath: "error.html",
      url: "https://anc.example.id",
    });
  });

  it("allows cleartext only for local development", () => {
    expect(createTrustedServerConfig("http://localhost:3000", "development")).toEqual({
      allowNavigation: ["localhost"],
      cleartext: true,
      errorPath: "error.html",
      url: "http://localhost:3000",
    });
  });

  it("rejects a cleartext remote production origin", () => {
    expect(() => createTrustedServerConfig("http://anc.example.id", "production")).toThrow(
      "must use HTTPS",
    );
  });
});

describe("offline error page", () => {
  it("ships a bundled page that loads only its own script", async () => {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(new URL("../www/error.html", import.meta.url), "utf8");
    const script = await readFile(new URL("../www/error.js", import.meta.url), "utf8");

    expect(html).toContain("script-src 'self'");
    expect(html).toContain('<script src="error.js"></script>');
    expect(html).toContain("Coba lagi");
    expect(script).toContain('getElementById("retry")');
  });
});
