import { randomUUID } from "node:crypto";

import { closeDatabasePool, createDatabasePool } from "../packages/database/dist/index.js";
import { PostgresOperationalQueriesRepository } from "../apps/api/dist/operational-queries/operational-queries.repository.js";

// Keyset paging must return every mother exactly once, including rows that share a
// millisecond or an identical timestamp (bulk registration inside one transaction). The cursor
// used to round-trip created_at through a JS Date, which drops microseconds and made such rows
// fall between pages.

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");

const pool = createDatabasePool({
  connectionString: databaseUrl,
  applicationName: "smoke-pagination",
});
const repository = new PostgresOperationalQueriesRepository(pool);
const centerId = randomUUID();
const motherIds = [];

try {
  await pool.query("INSERT INTO health_centers (id, code, name) VALUES ($1, $2, $3)", [
    centerId,
    `SMOKE-PAGING-${centerId.slice(0, 8)}`,
    "Smoke pagination",
  ]);

  // Sub-millisecond differences and exact ties, all with a non-zero microsecond part.
  const createdAtValues = [
    "2026-08-12 10:00:00.123456+00",
    "2026-08-12 10:00:00.123456+00",
    "2026-08-12 10:00:00.123456+00",
    "2026-08-12 10:00:00.123456+00",
    "2026-08-12 10:00:01.500100+00",
    "2026-08-12 10:00:01.500900+00",
    "2026-08-12 10:00:02.000000+00",
  ];
  for (const createdAt of createdAtValues) {
    const id = randomUUID();
    motherIds.push(id);
    await pool.query(
      `INSERT INTO mothers (id, health_center_id, full_name, nik_ciphertext, address, phone_normalized, created_at)
       VALUES ($1, $2, 'Ibu Uji', 'ciphertext', 'Alamat uji', '628123456789', $3)`,
      [id, centerId, createdAt],
    );
  }

  const actor = { staffUserId: randomUUID(), healthCenterId: centerId, role: "PUSKESMAS" };
  const now = new Date("2026-08-13T00:00:00Z");
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const page = await repository.findMothers(
      actor,
      { limit: 2, ...(cursor === undefined ? {} : { cursor }) },
      now,
      "Asia/Jakarta",
    );
    seen.push(...page.items.map((item) => item.id));
    cursor = page.next_cursor ?? undefined;
    pages += 1;
    if (pages > 20) throw new Error("Pagination did not terminate");
  } while (cursor !== undefined);

  const missing = motherIds.filter((id) => !seen.includes(id));
  const duplicated = seen.filter((id, index) => seen.indexOf(id) !== index);
  if (missing.length > 0 || duplicated.length > 0 || seen.length !== motherIds.length) {
    throw new Error(
      `Mother pagination is not exact: ${missing.length} missing, ${duplicated.length} duplicated, saw ${seen.length}/${motherIds.length}`,
    );
  }
  process.stdout.write(`${JSON.stringify({ pages, mothers: seen.length, exact: true })}\n`);
} finally {
  if (motherIds.length > 0)
    await pool.query("DELETE FROM mothers WHERE id = ANY($1::uuid[])", [motherIds]);
  await pool.query("DELETE FROM health_centers WHERE id = $1", [centerId]);
  await closeDatabasePool(pool);
}
