export function parseTrustedDeepLink(
  incomingUrl: string,
  allowedHost: string,
): { isTrusted: boolean; targetPath: string } {
  try {
    const parsed = new URL(incomingUrl);
    if (parsed.hostname !== allowedHost) {
      return { isTrusted: false, targetPath: "/" };
    }

    const safePaths = ["/", "/staff", "/staff/login", "/mother", "/mother/login"];
    const targetPath = parsed.pathname;

    const isTrusted = safePaths.some(
      (path) => targetPath === path || targetPath.startsWith(`${path}/`),
    );

    return {
      isTrusted,
      targetPath: isTrusted ? targetPath : "/",
    };
  } catch {
    return { isTrusted: false, targetPath: "/" };
  }
}
