import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  resolve(process.cwd(), "components/registered-mothers-panel.tsx"),
  "utf8",
);

describe("archive mother payload contract", () => {
  it("includes idempotency_key in archive mother DELETE request", () => {
    // Check that handleArchive provides idempotency_key matching contracts schema
    expect(panelSource).toMatch(
      /body:\s*JSON\.stringify\(\s*\{\s*idempotency_key:\s*crypto\.randomUUID\(\),\s*reason:/,
    );
  });

  it("does not send disallowed fields in pregnancy close request", () => {
    // contracts schema for PregnancyCloseRequest is strictly { idempotency_key, reason } without outcome
    const closeSnippetMatch = panelSource.match(
      /fetch\(\s*`\/api\/staff-proxy\/pregnancies\/[^`]*\/close`[\s\S]*?body:\s*JSON\.stringify\(\{([\s\S]*?)\}\)/,
    );
    expect(closeSnippetMatch).toBeDefined();
    const closeSnippet = closeSnippetMatch?.[1] ?? "";
    expect(closeSnippet).not.toContain("outcome:");
    expect(closeSnippet).toContain("idempotency_key:");
    expect(closeSnippet).toContain("reason:");
  });
});
