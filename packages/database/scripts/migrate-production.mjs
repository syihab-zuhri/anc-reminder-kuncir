import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseDir = resolve(__dirname, "..");
const repoRoot = resolve(databaseDir, "../..");

const targetUrl =
  process.env.DATABASE_DIRECT_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!targetUrl) {
  console.error(
    "Error: DATABASE_DIRECT_URL or DATABASE_URL must be defined to run production migration.",
  );
  process.exit(1);
}

console.log("Starting production database migration (using direct connection)...");

const env = {
  ...process.env,
  DATABASE_URL: targetUrl,
};

try {
  execSync(
    "node ../../node_modules/node-pg-migrate/bin/node-pg-migrate --migrations-dir migrations --migrations-table anc_migrations --single-transaction up",
    {
      cwd: databaseDir,
      env,
      stdio: "inherit",
    },
  );
  console.log("Production database migration completed successfully.");
} catch (error) {
  console.error("Production database migration failed:", error?.message || error);
  process.exit(1);
}
