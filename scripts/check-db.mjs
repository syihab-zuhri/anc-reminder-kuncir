import { createDatabasePool } from "../packages/database/dist/index.js";


async function checkConnection() {
  const databaseUrl = process.env.DATABASE_URL;
  console.log("Testing connection to Database host:", databaseUrl ? databaseUrl.split("@")[1]?.split("/")[0] : "UNDEFINED");
  
  const pool = createDatabasePool(databaseUrl);
  const client = await pool.connect();
  try {
    const timeRes = await client.query("SELECT NOW() as server_time, current_database(), current_user, version();");
    console.log("=== SUPABASE CONNECTION SUCCESS ===");
    console.log("Database:", timeRes.rows[0].current_database);
    console.log("User:", timeRes.rows[0].current_user);
    console.log("Server Time (UTC):", timeRes.rows[0].server_time);
    console.log("PostgreSQL Version:", timeRes.rows[0].version.split(",")[0]);

    // Check schema tables
    const tablesRes = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
    console.log(`\nFound ${tablesRes.rows.length} tables in public schema:`);
    console.log(tablesRes.rows.map(r => ` - ${r.table_name}`).join("\n"));

    // Check data row counts
    const countRes = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM health_centers) as total_health_centers,
        (SELECT COUNT(*) FROM villages) as total_villages,
        (SELECT COUNT(*) FROM facilities) as total_facilities,
        (SELECT COUNT(*) FROM staff_users) as total_staff,
        (SELECT COUNT(*) FROM mothers) as total_mothers,
        (SELECT COUNT(*) FROM pregnancies) as total_pregnancies,
        (SELECT COUNT(*) FROM pregnancy_milestones) as total_milestones,
        (SELECT COUNT(*) FROM anc_plan_versions) as total_plans
    `);
    console.log("\n=== DATA ROW COUNTS ===");
    console.log(JSON.stringify(countRes.rows[0], null, 2));

  } catch (error) {
    console.error("=== DATABASE CONNECTION FAILED ===");
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkConnection();
