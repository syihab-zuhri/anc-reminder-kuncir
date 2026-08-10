import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface IssuedMotherSession {
  readonly token: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export type MotherAccessRateLimitScope = "IP" | "CODE";

export class MotherAccessCryptoService {
  public constructor(
    private readonly secret: string,
    private readonly sessionTtlDays: number,
  ) {}

  public issueSession(now: Date): IssuedMotherSession {
    const token = `anc_mt_${randomBytes(32).toString("base64url")}`;
    return {
      token,
      tokenHash: this.sessionTokenHash(token),
      expiresAt: new Date(now.getTime() + this.sessionTtlDays * 86_400_000),
    };
  }

  public sessionTokenHash(token: string): string {
    return this.hmac("session-token", token);
  }

  public credentialLookupHash(canonicalCode: string): string {
    return this.hmac("credential-lookup", canonicalCode);
  }

  public rateLimitBucketHash(scope: MotherAccessRateLimitScope, value: string): string {
    return this.hmac(`rate-limit-${scope.toLowerCase()}`, value);
  }

  public namesEqual(left: string, right: string): boolean {
    const leftDigest = Buffer.from(this.hmac("normalized-name", normalizeMotherName(left)), "hex");
    const rightDigest = Buffer.from(
      this.hmac("normalized-name", normalizeMotherName(right)),
      "hex",
    );
    return timingSafeEqual(leftDigest, rightDigest);
  }

  private hmac(context: string, value: string): string {
    return createHmac("sha256", this.secret)
      .update(`anc-mother:${context}\0${value}`, "utf8")
      .digest("hex");
  }
}

export function normalizeMotherName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("id-ID");
}

export function normalizeMotherAccessCode(value: string): string | null {
  const compact = value
    .normalize("NFKC")
    .toLocaleUpperCase("en-US")
    .replace(/[\s-]+/gu, "");
  if (!/^ANC[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/u.test(compact)) return null;
  const symbols = compact.slice(3);
  const groups = symbols.match(/.{4}/gu);
  return groups === null ? null : `ANC-${groups.join("-")}`;
}
