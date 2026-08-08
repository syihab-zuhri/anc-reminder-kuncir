const REDACTED = "[REDACTED]";
const MAX_DEPTH = 12;

const sensitiveKeyPattern =
  /(?:^|_)(?:nik|full_?name|address|phone(?:_?number|_?normalized)?|access_?code|authorization|cookie|set_?cookie|password|passcode|token|secret|session|fcm_?service_?account(?:_?json)?|diagnosis|lab_?result|risk_?category|record_?payload|raw_?message|wa_?message)(?:$|_)/i;

const compactSensitiveKeyPattern =
  /^(?:accesstoken|refreshtoken|sessiontoken|sessionsecret|mothersessionsecret|fcmserviceaccountjson|recordpayload|rawmessage|wamessage|phonenumber|phonenormalized|fullname)$/i;

function normalizedKey(key: string): string {
  return key.replaceAll("-", "_");
}

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  const compact = normalized.replaceAll("_", "");
  return sensitiveKeyPattern.test(normalized) || compactSensitiveKeyPattern.test(compact);
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, "Bearer [REDACTED]")
    .replace(/\b(postgres(?:ql)?):\/\/([^\s:/@]+):([^\s@]+)@/giu, "$1://[REDACTED]:[REDACTED]@")
    .replace(/\b\d{16}\b/gu, REDACTED)
    .replace(
      /\b(nik|access_?code|password|token|secret|session)\s*[=:]\s*[^\s,;]+/giu,
      "$1=[REDACTED]",
    );
}

function redactValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return "[MAX_DEPTH]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return "[FUNCTION]";
  }

  if (typeof value === "symbol") {
    return value.description === undefined ? "[SYMBOL]" : `[SYMBOL:${value.description}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message),
    };
  }

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactValue(nestedValue, seen, depth + 1);
  }
  return output;
}

export function redactSensitiveData(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>(), 0);
}

export { REDACTED };
