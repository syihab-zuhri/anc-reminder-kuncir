import { isIP } from "node:net";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);
const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/u;
const IPV4_MAPPED_IPV6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu;

/**
 * Best-effort address of the browser that made `headers`' request, for abuse throttling in the
 * API. The web process only listens on loopback behind Nginx and the Cloudflare Tunnel, so
 * these headers are written by our own proxies:
 *
 * 1. `CF-Connecting-IP` is set by Cloudflare and overwrites anything the client sent.
 * 2. Otherwise the right-most `X-Forwarded-For` entry that is not our own loopback hop. The
 *    left-most entries are client-controlled and must never be trusted.
 *
 * Returns undefined when no valid address is present (e.g. local development); the API then
 * falls back to the socket peer.
 */
export function clientIpFromHeaders(headers: Headers): string | undefined {
  const cloudflare = normalizeIp(headers.get("cf-connecting-ip"));
  if (cloudflare !== undefined) return cloudflare;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded === null) return undefined;
  const hops = forwarded.split(",");
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = normalizeIp(hops[index] ?? null);
    if (hop !== undefined && !LOOPBACK_ADDRESSES.has(hop)) return hop;
  }
  return undefined;
}

function normalizeIp(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  let value = raw.trim();
  if (value === "" || value.length > 64) return undefined;

  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    if (close === -1) return undefined;
    value = value.slice(1, close);
  }
  const withPort = IPV4_WITH_PORT.exec(value);
  if (withPort?.[1] !== undefined) value = withPort[1];
  const mapped = IPV4_MAPPED_IPV6.exec(value);
  if (mapped?.[1] !== undefined) value = mapped[1];

  return isIP(value) === 0 ? undefined : value.toLowerCase();
}
