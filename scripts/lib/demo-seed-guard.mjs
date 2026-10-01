/**
 * The demo seeds create well-known accounts and activate sample clinical data. They are for
 * local development only, so they refuse to run unless the operator says so explicitly, and never
 * when NODE_ENV=production. A host check is not enough: production Postgres can be on localhost.
 */
export const DEMO_SEED_CONFIRMATION = "SEED_DEMO_DATA";

export function assertDemoSeedAllowed(scriptName) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${scriptName} must never run with NODE_ENV=production.`);
  }
  if (process.env.SEED_DEMO_CONFIRM !== DEMO_SEED_CONFIRMATION) {
    throw new Error(
      `${scriptName} creates demo data for LOCAL development only. ` +
        `Re-run with SEED_DEMO_CONFIRM=${DEMO_SEED_CONFIRMATION} against a non-production database.`,
    );
  }
}
