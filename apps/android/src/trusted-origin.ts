import type { CapacitorConfig } from "@capacitor/cli";

type ServerConfig = NonNullable<CapacitorConfig["server"]>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function createTrustedServerConfig(
  rawUrl: string | undefined,
  environment = "development",
): ServerConfig | undefined {
  if (rawUrl === undefined || rawUrl.trim() === "") return undefined;

  const url = new URL(rawUrl);
  const isLocalDevelopment = environment !== "production" && LOCAL_HOSTS.has(url.hostname);

  if (url.protocol !== "https:" && !isLocalDevelopment) {
    throw new Error("CAPACITOR_SERVER_URL must use HTTPS outside local development.");
  }

  return {
    allowNavigation: [url.hostname],
    cleartext: isLocalDevelopment,
    // Bundled page shown instead of the raw WebView or proxy error when the server is unreachable.
    errorPath: "error.html",
    url: url.origin,
  };
}
