export const STAFF_ACCESS_COOKIE = "anc_staff_access";
export const STAFF_REFRESH_COOKIE = "anc_staff_refresh";

export interface StaffCookieOptions {
  readonly httpOnly: true;
  readonly sameSite: "strict";
  readonly secure: boolean;
  readonly path: "/";
  readonly expires: Date;
  readonly priority: "high";
}

export function staffCookieOptions(
  expiresAt: string,
  nodeEnvironment: string | undefined,
): StaffCookieOptions {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) throw new Error("Invalid staff session expiry");
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: nodeEnvironment === "production",
    path: "/",
    expires,
    priority: "high",
  };
}

export function trustedMutationOrigin(
  requestUrl: string,
  origin: string | null,
  configuredAppBaseUrl: string | undefined,
): boolean {
  if (origin === null) return false;
  try {
    const expectedOrigin = new URL(configuredAppBaseUrl ?? requestUrl).origin;
    return new URL(origin).origin === expectedOrigin && origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
