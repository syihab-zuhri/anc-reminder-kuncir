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

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function trustedMutationOrigin(
  requestUrl: string,
  origin: string | null,
  configuredAppBaseUrl: string | undefined,
): boolean {
  if (origin === null) return false;
  try {
    const originParsed = new URL(origin);
    if (origin !== originParsed.origin) return false;

    const requestParsed = new URL(requestUrl);
    if (originParsed.origin === requestParsed.origin) return true;

    if (
      LOOPBACK_HOSTS.has(originParsed.hostname) &&
      LOOPBACK_HOSTS.has(requestParsed.hostname) &&
      originParsed.port === requestParsed.port
    ) {
      return true;
    }

    if (configuredAppBaseUrl !== undefined && configuredAppBaseUrl.trim().length > 0) {
      const configuredParsed = new URL(configuredAppBaseUrl);
      if (originParsed.origin === configuredParsed.origin) return true;
    }
    return false;
  } catch {
    return false;
  }
}
