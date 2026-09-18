"use client";

import type { Facility, MotherSummary, Village } from "@anc/contracts";
import { useCallback, useEffect, useState } from "react";

export interface UseVillagesResult {
  readonly villages: readonly Village[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

export function useVillages(enabled: boolean = true): UseVillagesResult {
  const [villages, setVillages] = useState<readonly Village[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchVillages = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!enabled) return;
      setError(null);
      try {
        const res = await fetch("/api/staff-proxy/staff/organization/villages", { signal });
        if (res.ok) {
          const data = (await res.json()) as readonly Village[];
          setVillages(data ?? []);
        } else {
          setError("Gagal memuat data desa");
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Koneksi terputus saat memuat desa.");
        }
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    async function run(): Promise<void> {
      try {
        const res = await fetch("/api/staff-proxy/staff/organization/villages", {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as readonly Village[];
          setVillages(data ?? []);
        } else {
          setError("Gagal memuat data desa");
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Koneksi terputus saat memuat desa.");
        }
      } finally {
        setLoading(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [enabled]);

  return {
    villages,
    loading,
    error,
    reload: fetchVillages,
  };
}

export interface UseFacilitiesResult {
  readonly facilities: readonly Facility[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

export function useFacilities(enabled: boolean = true): UseFacilitiesResult {
  const [facilities, setFacilities] = useState<readonly Facility[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchFacilities = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!enabled) return;
      setError(null);
      try {
        const res = await fetch("/api/staff-proxy/staff/organization/facilities", { signal });
        if (res.ok) {
          const data = (await res.json()) as readonly Facility[];
          setFacilities(data ?? []);
        } else {
          setError("Gagal memuat data faskes");
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Koneksi terputus saat memuat faskes.");
        }
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    async function run(): Promise<void> {
      try {
        const res = await fetch("/api/staff-proxy/staff/organization/facilities", {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as readonly Facility[];
          setFacilities(data ?? []);
        } else {
          setError("Gagal memuat data faskes");
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Koneksi terputus saat memuat faskes.");
        }
      } finally {
        setLoading(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [enabled]);

  return {
    facilities,
    loading,
    error,
    reload: fetchFacilities,
  };
}

export interface UseMothersListOptions {
  readonly enabled?: boolean;
  readonly limit?: number;
  readonly villageId?: string;
  readonly status?: "ALL" | "ACTIVE" | "CLOSED";
}

export interface UseMothersListResult {
  readonly mothers: readonly MotherSummary[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly reload: () => Promise<void>;
  readonly loadMore: () => Promise<void>;
  readonly setMothers: React.Dispatch<React.SetStateAction<readonly MotherSummary[]>>;
}

export function useMothersList(options: UseMothersListOptions = {}): UseMothersListResult {
  const { enabled = true, limit = 50, villageId, status } = options;

  const [mothers, setMothers] = useState<readonly MotherSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchInitial = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!enabled) return;
      setError(null);
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (villageId) params.set("village_id", villageId);
        if (status && status !== "ALL") params.set("status", status);

        const res = await fetch(`/api/staff-proxy/mothers?${params.toString()}`, { signal });
        if (res.ok) {
          const data = (await res.json()) as {
            items: readonly MotherSummary[];
            pagination?: { next_cursor: string | null; has_more: boolean };
          };
          setMothers(data.items ?? []);
          setNextCursor(data.pagination?.next_cursor ?? null);
          setHasMore(data.pagination?.has_more ?? false);
        } else {
          setError("Gagal memuat data ibu hamil.");
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Koneksi terputus saat memuat data pasien.");
        }
      } finally {
        setLoading(false);
      }
    },
    [enabled, limit, villageId, status],
  );

  const loadMore = useCallback(async (): Promise<void> => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        cursor: nextCursor,
      });
      if (villageId) params.set("village_id", villageId);
      if (status && status !== "ALL") params.set("status", status);

      const res = await fetch(`/api/staff-proxy/mothers?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as {
          items: readonly MotherSummary[];
          pagination?: { next_cursor: string | null; has_more: boolean };
        };
        setMothers((prev) => [...prev, ...(data.items ?? [])]);
        setNextCursor(data.pagination?.next_cursor ?? null);
        setHasMore(data.pagination?.has_more ?? false);
      }
    } catch {
      // Keep existing list
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore, limit, villageId, status]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    async function run(): Promise<void> {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (villageId) params.set("village_id", villageId);
        if (status && status !== "ALL") params.set("status", status);

        const res = await fetch(`/api/staff-proxy/mothers?${params.toString()}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as {
            items: readonly MotherSummary[];
            pagination?: { next_cursor: string | null; has_more: boolean };
          };
          setMothers(data.items ?? []);
          setNextCursor(data.pagination?.next_cursor ?? null);
          setHasMore(data.pagination?.has_more ?? false);
        } else {
          setError("Gagal memuat data ibu hamil.");
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Koneksi terputus saat memuat data pasien.");
        }
      } finally {
        setLoading(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [enabled, limit, villageId, status]);

  return {
    mothers,
    loading,
    error,
    nextCursor,
    hasMore,
    loadingMore,
    reload: fetchInitial,
    loadMore,
    setMothers,
  };
}
