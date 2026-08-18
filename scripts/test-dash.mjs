import { createDatabasePool } from "../packages/database/dist/index.js";
import { PostgresDashboardRepository } from "../apps/api/dist/dashboard/dashboard.repository.js";

async function testDash() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/anc_posyandu_kuncir";
  const pool = createDatabasePool(databaseUrl);
  try {
    const userRes = await pool.query("SELECT id, health_center_id, role, display_name, status FROM staff_users WHERE login_identifier = $1", ["petugas.kuncir"]);
    const user = userRes.rows[0];
    const actor = {
      id: user.id,
      healthCenterId: user.health_center_id,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
      sessionId: "test"
    };
    const repo = new PostgresDashboardRepository(pool);
    const dash = await repo.getPuskesmasDashboard(actor, new Date(), "Asia/Jakarta");
    console.log("Puskesmas Dash Result:", JSON.stringify(dash, null, 2));

    const bidanRes = await pool.query("SELECT id, health_center_id, role, display_name, status FROM staff_users WHERE login_identifier = $1", ["bidan.kuncir"]);
    const bidanUser = bidanRes.rows[0];
    const bidanActor = {
      id: bidanUser.id,
      healthCenterId: bidanUser.health_center_id,
      displayName: bidanUser.display_name,
      role: bidanUser.role,
      status: bidanUser.status,
      sessionId: "test"
    };
    const bidanDash = await repo.getBidanDashboard(bidanActor, new Date(), "Asia/Jakarta");
    console.log("Bidan Dash Result:", JSON.stringify(bidanDash, null, 2));
  } catch (err) {
    console.error("Dash Error:", err);
  } finally {
    pool.end();
  }
}
testDash();
