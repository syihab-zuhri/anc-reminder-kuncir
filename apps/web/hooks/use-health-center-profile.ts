"use client";

import type { HealthCenterProfile } from "@anc/contracts";
import { useEffect, useState } from "react";

// One request per page load, shared by every component that names the Puskesmas.
let profileRequest: Promise<HealthCenterProfile | null> | null = null;

function loadProfile(): Promise<HealthCenterProfile | null> {
  profileRequest ??= fetch("/api/staff-proxy/staff/health-center")
    .then(async (res) => (res.ok ? ((await res.json()) as HealthCenterProfile) : null))
    .catch(() => null)
    .then((profile) => {
      // Let a later mount retry after a failure instead of caching it.
      if (profile === null) profileRequest = null;
      return profile;
    });
  return profileRequest;
}

/** The signed-in staff member's health center, or null while loading or when unavailable. */
export function useHealthCenterProfile(enabled = true): HealthCenterProfile | null {
  const [profile, setProfile] = useState<HealthCenterProfile | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadProfile().then((value) => {
      if (active) setProfile(value);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return profile;
}
