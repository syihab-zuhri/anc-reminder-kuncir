export const MOTHER_SESSION_COOKIE = "anc_mother_session";

export interface MotherCookieOptions {
  readonly httpOnly: true;
  readonly sameSite: "strict";
  readonly secure: boolean;
  readonly path: "/";
  readonly expires: Date;
  readonly priority: "high";
}

export function motherCookieOptions(
  expiresAt: string,
  nodeEnvironment: string | undefined,
): MotherCookieOptions {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) throw new Error("Invalid mother session expiry");
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: nodeEnvironment === "production",
    path: "/",
    expires,
    priority: "high",
  };
}
