"use client";

import type { Facility, Village } from "@anc/contracts";
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
