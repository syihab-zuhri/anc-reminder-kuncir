import { HttpStatus } from "@nestjs/common";

import { ApiException } from "../errors/api.exception.js";

export function assertPregnancyStartDateNotFuture(
  pregnancyStartDate: string,
  now: Date,
  timezone: string,
): void {
  if (pregnancyStartDate <= dateOnlyInTimezone(now, timezone)) return;
  throw new ApiException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: "INVALID_PREGNANCY_START_DATE",
    message: "Tanggal awal kehamilan tidak boleh berada di masa depan.",
    fields: { pregnancy_start_date: "must not be in the future" },
  });
}

function dateOnlyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
