import type { MotherSummary } from "@anc/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  MOTHER_LIST_MAX,
  MOTHER_PAGE_LIMIT,
  MothersFetchError,
  fetchAllMothers,
} from "../lib/mothers-api";

let sequence = 0;
function mother(): MotherSummary {
  sequence += 1;
  const suffix = sequence.toString().padStart(12, "0");
  return {
    id: `10000000-0000-4000-8000-${suffix}`,
    health_center_id: "20000000-0000-4000-8000-000000000001",
    full_name: `Ibu ${sequence.toString()}`,
    phone_masked: "0812****5678",
    phone_number: "081234565678",
    address: "Jl. Kuncir No. 1",
    village_id: null,
    village_name: null,
    created_at: "2026-08-12T10:00:00.000Z",
    active_pregnancy: null,
  };
}

function page(count: number, nextCursor: string | null): Response {
  return Response.json({
    items: Array.from({ length: count }, mother),
    next_cursor: nextCursor,
    has_more: nextCursor !== null,
  });
}

function urlOf(call: readonly unknown[]): URL {
  return new URL(String(call[0]), "http://localhost");
}

describe("fetchAllMothers", () => {
  it("follows the cursor through every page at the API's maximum page size", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page(100, "cursor-1"))
      .mockResolvedValueOnce(page(100, "cursor-2"))
      .mockResolvedValueOnce(page(37, null));

    const result = await fetchAllMothers({ fetchImpl });

    expect(result.items).toHaveLength(237);
    expect(result.truncated).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const urls = fetchImpl.mock.calls.map(urlOf);
    expect(urls.map((url) => url.pathname)).toEqual(Array(3).fill("/api/staff-proxy/mothers"));
    expect(urls.map((url) => url.searchParams.get("limit"))).toEqual(
      Array(3).fill(String(MOTHER_PAGE_LIMIT)),
    );
    expect(urls.map((url) => url.searchParams.get("cursor"))).toEqual([
      null,
      "cursor-1",
      "cursor-2",
    ]);
  });

  it("makes a single request when everything fits in one page", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(page(3, null));

    const result = await fetchAllMothers({ fetchImpl });

    expect(result.items).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list for a center with no mothers", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(page(0, null));

    expect(await fetchAllMothers({ fetchImpl })).toEqual({ items: [], truncated: false });
  });

  it("stops at the safety cap and says the list was cut", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(page(100, "more")));

    const result = await fetchAllMothers({ fetchImpl });

    expect(result.items).toHaveLength(MOTHER_LIST_MAX);
    expect(result.truncated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(MOTHER_LIST_MAX / MOTHER_PAGE_LIMIT);
  });

  it("never loops when the API claims more pages but gives no cursor", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ items: [mother()], next_cursor: null, has_more: true }),
      );

    const result = await fetchAllMothers({ fetchImpl });

    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails as a whole instead of returning a partial list when a later page errors", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page(100, "cursor-1"))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));

    await expect(fetchAllMothers({ fetchImpl })).rejects.toMatchObject({
      name: "MothersFetchError",
      status: 503,
    });
    await expect(
      fetchAllMothers({
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 401 })),
      }),
    ).rejects.toBeInstanceOf(MothersFetchError);
  });

  it("rejects a response that breaks the contract", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: "x" }], next_cursor: null, has_more: false }),
      );

    await expect(fetchAllMothers({ fetchImpl })).rejects.toThrow();
  });

  it("passes the abort signal to every request", async () => {
    const controller = new AbortController();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page(100, "cursor-1"))
      .mockResolvedValueOnce(page(1, null));

    await fetchAllMothers({ fetchImpl, signal: controller.signal });

    expect(fetchImpl.mock.calls.map(([, init]) => init?.signal)).toEqual([
      controller.signal,
      controller.signal,
    ]);
  });
});
