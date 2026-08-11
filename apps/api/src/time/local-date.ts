import { dateOnlyInTimezone } from "../registry/registry-validation.js";

export function startOfLocalDate(dateOnly: string, timezone: string): Date {
  const targetUtc = Date.parse(`${dateOnly}T00:00:00.000Z`);
  let candidate = targetUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = localDateTimeAsUtc(new Date(candidate), timezone);
    const correction = targetUtc - local;
    candidate += correction;
    if (correction === 0) break;
  }

  const result = new Date(candidate);
  if (dateOnlyInTimezone(result, timezone) !== dateOnly) {
    throw new Error(`Unable to resolve local date ${dateOnly} in ${timezone}`);
  }
  return result;
}

function localDateTimeAsUtc(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    requirePart(values, "year"),
    requirePart(values, "month") - 1,
    requirePart(values, "day"),
    requirePart(values, "hour"),
    requirePart(values, "minute"),
    requirePart(values, "second"),
  );
}

function requirePart(values: ReadonlyMap<string, string>, name: string): number {
  const value = values.get(name);
  if (value === undefined) throw new Error(`Timezone formatter omitted ${name}`);
  return Number(value);
}
