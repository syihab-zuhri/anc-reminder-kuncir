import type {
  FacilityType,
  RequiredFacilityPolicy,
  VisitStatus,
  WaFallbackActionStatus,
} from "@anc/contracts";

const visitStatusLabels: Readonly<Record<VisitStatus, string>> = {
  UPCOMING: "Akan datang",
  DUE: "Waktunya periksa",
  OVERDUE: "Terlewat",
  CONFIRMED: "Sudah periksa",
  CANCELLED: "Dibatalkan",
  NOT_APPLICABLE: "Tidak berlaku",
};

/** Indonesian label for a visit status code; staff and mothers never see the raw code. */
export function visitStatusLabel(status: VisitStatus): string {
  return visitStatusLabels[status];
}

const waStatusLabels: Readonly<Record<WaFallbackActionStatus, string>> = {
  READY: "Belum dikirim",
  LINK_GENERATED: "Link dibuat",
  LINK_OPENED: "WhatsApp dibuka",
  RESOLVED_MANUALLY: "Selesai",
  UNREACHABLE: "Tidak dapat dihubungi",
  SKIPPED: "Dilewati",
  EXPIRED: "Kedaluwarsa",
};

/** Indonesian label for a WhatsApp follow-up task status. */
export function waStatusLabel(status: WaFallbackActionStatus): string {
  return waStatusLabels[status];
}

const facilityTypeLabels: Readonly<Record<FacilityType, string>> = {
  PUSKESMAS: "Puskesmas",
  POSYANDU: "Posyandu",
  PONED: "PONED",
  HOSPITAL: "Rumah Sakit / SpOG",
  MIDWIFE_PRACTICE: "TPMB / Praktik Mandiri Bidan",
  PUSTU: "Puskesmas Pembantu (Pustu)",
  POLINDES: "Pondok Bersalin Desa (Polindes)",
  OTHER: "Lainnya",
};

export function facilityTypeLabel(type: FacilityType): string {
  return facilityTypeLabels[type];
}

const facilityPolicyLabels: Readonly<Record<RequiredFacilityPolicy, string>> = {
  PUSKESMAS_REQUIRED: "Wajib di Puskesmas",
  FLEXIBLE: "Posyandu, Bidan, atau Puskesmas",
  PONED_OR_RS_REQUIRED: "Wajib di PONED atau rumah sakit",
};

const facilityPolicyShortLabels: Readonly<Record<RequiredFacilityPolicy, string>> = {
  PUSKESMAS_REQUIRED: "Puskesmas",
  FLEXIBLE: "Posyandu / Bidan",
  PONED_OR_RS_REQUIRED: "PONED / RS",
};

/** Where a visit must take place, from the ANC plan rule. */
export function facilityPolicyLabel(policy: RequiredFacilityPolicy, short = false): string {
  return (short ? facilityPolicyShortLabels : facilityPolicyLabels)[policy];
}

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const dayMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

function toDate(value: string): Date | null {
  // A bare calendar date is read as midday in Jakarta so no time zone can move it to another day.
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? new Date(`${value}T12:00:00+07:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "16 Apr 2026" for a calendar date or timestamp; `fallback` when there is none. */
export function formatDate(value: string | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = toDate(value);
  return date === null ? fallback : dateFormatter.format(date);
}

/** "16 Apr – 22 Jul 2026", dropping the first year when both dates share it. */
export function formatDateRange(start: string, end: string): string {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (startDate === null || endDate === null) return `${formatDate(start)} – ${formatDate(end)}`;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? dayMonthFormatter.format(startDate) : dateFormatter.format(startDate)} – ${dateFormatter.format(endDate)}`;
}

/** Village names are stored with or without the "Desa" prefix; never print it twice. */
export function villageLabel(name: string): string {
  return /^(desa|kelurahan)\s/iu.test(name.trim()) ? name.trim() : `Desa ${name.trim()}`;
}

/** Today's calendar date in Jakarta as YYYY-MM-DD (the UTC date lags until 07:00 WIB). */
export function todayInJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
