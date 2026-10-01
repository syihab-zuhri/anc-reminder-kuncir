import "reflect-metadata";
import type { DatabasePool } from "@anc/database";
import { describe, expect, it, vi } from "vitest";

import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { PostgresOperationalQueriesRepository } from "../src/operational-queries/operational-queries.repository.js";

const centerId = "20000000-0000-4000-8000-000000000001";
const actor: StaffActor = {
  staffUserId: "30000000-0000-4000-8000-000000000001",
  sessionId: "40000000-0000-4000-8000-000000000001",
  healthCenterId: centerId,
  displayName: "Puskesmas",
  role: "PUSKESMAS",
  status: "ACTIVE",
  assignments: [],
};
const now = new Date("2026-08-13T00:00:00.000Z");

function row(index: number, createdAtCursor: string) {
  return {
    id: `10000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    health_center_id: centerId,
    full_name: `Ibu ${index.toString()}`,
    phone_normalized: "628123456789",
    address: "Jl. Kuncir No. 1",
    village_id: null,
    village_name: null,
    // pg hands back a JS Date, which has already lost the microseconds.
    created_at: new Date(createdAtCursor),
    created_at_cursor: createdAtCursor,
    active_pregnancy_id: null,
    active_pregnancy_dating_date: null,
    active_pregnancy_status: null,
    active_pregnancy_trimester_label: null,
  };
}

function repositoryReturning(rows: unknown[]) {
  const query = vi.fn(() => Promise.resolve({ rows }));
  const repository = new PostgresOperationalQueriesRepository({ query } as unknown as DatabasePool);
  return { repository, query };
}

function cursorParams(query: ReturnType<typeof vi.fn>): unknown[] {
  const call = query.mock.calls[0] as unknown as [string, unknown[]];
  return [call[1][6], call[1][7]];
}

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

describe("mother list keyset cursor", () => {
  it("carries created_at with microseconds so same-millisecond rows are not skipped", async () => {
    const rows = [
      row(3, "2026-08-12T10:00:00.123456Z"),
      row(2, "2026-08-12T10:00:00.123456Z"),
      row(1, "2026-08-12T10:00:00.123400Z"),
    ];
    const { repository } = repositoryReturning(rows);

    const page = await repository.findMothers(actor, { limit: 2 }, now, "Asia/Jakarta");

    expect(page.has_more).toBe(true);
    expect(page.items.map((item) => item.id)).toEqual([rows[0]?.id, rows[1]?.id]);
    const decoded = JSON.parse(Buffer.from(page.next_cursor ?? "", "base64url").toString()) as {
      createdAt: string;
      id: string;
    };
    expect(decoded).toEqual({ createdAt: "2026-08-12T10:00:00.123456Z", id: rows[1]?.id });
  });

  it("hands the exact stored timestamp and id back to the query for the next page", async () => {
    const { repository: first } = repositoryReturning([
      row(2, "2026-08-12T10:00:00.123456Z"),
      row(1, "2026-08-12T10:00:00.123456Z"),
    ]);
    const cursor = (await first.findMothers(actor, { limit: 1 }, now, "Asia/Jakarta")).next_cursor;

    const { repository, query } = repositoryReturning([]);
    await repository.findMothers(
      actor,
      { limit: 1, ...(cursor ? { cursor } : {}) },
      now,
      "Asia/Jakarta",
    );

    expect(cursorParams(query)).toEqual([
      "2026-08-12T10:00:00.123456Z",
      "10000000-0000-4000-8000-000000000002",
    ]);
  });

  it("still accepts millisecond cursors issued before the change", async () => {
    const { repository, query } = repositoryReturning([]);
    const legacy = encode({
      createdAt: "2026-08-12T10:00:00.123Z",
      id: "10000000-0000-4000-8000-000000000002",
    });

    await repository.findMothers(actor, { limit: 1, cursor: legacy }, now, "Asia/Jakarta");

    expect(cursorParams(query)).toEqual([
      "2026-08-12T10:00:00.123Z",
      "10000000-0000-4000-8000-000000000002",
    ]);
  });

  it.each([
    ["not base64 json", "%%%"],
    [
      "a bad timestamp",
      encode({ createdAt: "yesterday", id: "10000000-0000-4000-8000-000000000002" }),
    ],
    [
      "a non-uuid id",
      encode({ createdAt: "2026-08-12T10:00:00.123456Z", id: "1; DROP TABLE mothers" }),
    ],
    ["missing fields", encode({ createdAt: "2026-08-12T10:00:00.123456Z" })],
    [
      "a non-string timestamp",
      encode({ createdAt: 20260812, id: "10000000-0000-4000-8000-000000000002" }),
    ],
  ])(
    "ignores a malformed cursor (%s) instead of passing it to the database",
    async (_label, cursor) => {
      const { repository, query } = repositoryReturning([]);

      await repository.findMothers(actor, { limit: 1, cursor }, now, "Asia/Jakarta");

      expect(cursorParams(query)).toEqual([null, null]);
    },
  );
});

describe("mother list search", () => {
  it("matches user input literally instead of treating % and _ as wildcards", async () => {
    const { repository, query } = repositoryReturning([]);

    await repository.findMothers(actor, { limit: 5, search: "50%_a\\b" }, now, "Asia/Jakarta");

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[3]).toBe("%50\\%\\_a\\\\b%");
    expect(sql).toContain("ILIKE $4 ESCAPE '\\'");
    expect(sql.match(/ESCAPE/gu)).toHaveLength(2);
  });

  it("sends no pattern when there is no search term", async () => {
    const { repository, query } = repositoryReturning([]);

    await repository.findMothers(actor, { limit: 5 }, now, "Asia/Jakarta");

    expect((query.mock.calls[0] as unknown as [string, unknown[]])[1][3]).toBeNull();
  });
});
