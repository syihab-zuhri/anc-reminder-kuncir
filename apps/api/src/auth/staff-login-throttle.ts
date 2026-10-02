import { createHmac } from "node:crypto";
import type { ApiConfig } from "@anc/config";

export type StaffLoginRateLimitScope = "ACCOUNT_IP" | "ACCOUNT" | "IP";

export interface StaffLoginBucket {
  readonly hash: string;
  readonly scope: StaffLoginRateLimitScope;
  readonly limit: number;
}

type ThrottleLimits = Pick<
  ApiConfig,
  "staffLoginMaxFailures" | "staffLoginAccountMaxFailures" | "staffLoginIpMaxFailures"
>;

/**
 * The three counters a staff login attempt is measured against:
 *
 * - ACCOUNT_IP: this account from this address. The tight limit; one address cannot lock the
 *   operator out for anyone else.
 * - ACCOUNT: this account from anywhere. A higher limit that still stops a distributed guess.
 * - IP: this address against any account. Stops one source spraying many accounts, and bounds
 *   the number of expensive scrypt verifications it can force.
 *
 * Buckets are keyed on the submitted identifier whether or not the account exists, so being
 * throttled reveals nothing about which accounts are real.
 */
export function staffLoginBuckets(
  secret: string,
  identifier: string,
  sourceIp: string,
  limits: ThrottleLimits,
): readonly StaffLoginBucket[] {
  return [
    {
      scope: "ACCOUNT_IP",
      hash: bucketHash(secret, "ACCOUNT_IP", `${identifier}\0${sourceIp}`),
      limit: limits.staffLoginMaxFailures,
    },
    {
      scope: "ACCOUNT",
      hash: bucketHash(secret, "ACCOUNT", identifier),
      limit: limits.staffLoginAccountMaxFailures,
    },
    {
      scope: "IP",
      hash: bucketHash(secret, "IP", sourceIp),
      limit: limits.staffLoginIpMaxFailures,
    },
  ];
}

export function normalizeSourceIp(value: string | undefined): string {
  const normalized = (value ?? "").trim().toLocaleLowerCase("en-US");
  return normalized === "" ? "unknown" : normalized;
}

function bucketHash(secret: string, scope: StaffLoginRateLimitScope, value: string): string {
  return createHmac("sha256", secret)
    .update(`anc-staff:login-${scope.toLowerCase()}\0${value}`, "utf8")
    .digest("hex");
}
