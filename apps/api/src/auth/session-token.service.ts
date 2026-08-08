import { createHmac, randomBytes } from "node:crypto";

export interface IssuedSessionTokens {
  readonly accessToken: string;
  readonly accessTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly refreshToken: string;
  readonly refreshTokenHash: string;
  readonly refreshExpiresAt: Date;
}

export interface SessionTokenOptions {
  readonly secret: string;
  readonly accessTtlMinutes: number;
  readonly refreshTtlDays: number;
}

export class SessionTokenService {
  public constructor(private readonly options: SessionTokenOptions) {}

  public issue(now: Date): IssuedSessionTokens {
    const accessToken = `anc_at_${randomBytes(32).toString("base64url")}`;
    const refreshToken = `anc_rt_${randomBytes(32).toString("base64url")}`;
    return {
      accessToken,
      accessTokenHash: this.hash(accessToken),
      accessExpiresAt: new Date(now.getTime() + this.options.accessTtlMinutes * 60_000),
      refreshToken,
      refreshTokenHash: this.hash(refreshToken),
      refreshExpiresAt: new Date(now.getTime() + this.options.refreshTtlDays * 86_400_000),
    };
  }

  public hash(token: string): string {
    return createHmac("sha256", this.options.secret).update(token, "utf8").digest("hex");
  }
}
