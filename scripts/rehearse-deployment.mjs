import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

console.log("=========================================");
console.log("  ANC REMINDER STAGING DEPLOYMENT REHEARSAL");
console.log("=========================================\n");

function runStep(name, command, options = {}) {
  console.log(`\n[STEP] ${name}...`);
  try {
    const output = execSync(command, { stdio: "pipe", encoding: "utf-8", ...options });
    console.log(`[PASS] ${name}`);
    return { success: true, output };
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    if (error.stdout) console.log(`Stdout:\n${error.stdout}`);
    if (error.stderr) console.error(`Stderr:\n${error.stderr}`);
    if (options.allowFailure) {
      return { success: false, error };
    }
    throw error;
  }
}

try {
  // 1. Verify secrets and environment
  runStep("1. Check Secret Leakage", "npm run security:secrets");

  // 2. Build shared packages
  runStep("2. Build Packages", "npm run build:packages");

  // 3. Check workspace formatting & types
  runStep("3. Format & Type Check", "npm run format:check && npm run typecheck");

  // 4. Verify all tests pass
  runStep("4. CI Test Suite", "npm run test:ci");

  // 5. Build all workspace applications (Web, API, Worker, Android)
  runStep("5. Build Workspace Applications", "npm run build");

  // 6. Security Dependency Audit
  runStep("6. Dependency Security Audit", "npm run security:dependencies");

  console.log("\n=========================================");
  console.log("  REHEARSAL COMPLETED SUCCESSFULLY!");
  console.log("=========================================\n");
} catch (err) {
  console.error("\n=========================================");
  console.error("  REHEARSAL FAILED!");
  console.error("=========================================\n");
  process.exit(1);
}
