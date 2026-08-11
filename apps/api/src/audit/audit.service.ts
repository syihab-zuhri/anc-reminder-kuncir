import { Inject, Injectable } from "@nestjs/common";

import { AUDIT_REPOSITORY } from "../infrastructure/tokens.js";
import { redactSensitiveText } from "../observability/redaction.js";
import type { AuditRepository } from "./audit.repository.js";

const allowedMetadataKeys = new Set([
  "reason",
  "request_id",
  "role",
  "session_id",
  "scope_id",
  "scope_type",
  "target_staff_user_id",
  "version_no",
  "approval_reference",
]);
const forbiddenKeyPattern = /(nik|password|secret|token|phone|address|clinical|diagnosis)/i;

export interface RecordAuditEventInput {
  readonly actorType: "STAFF" | "BUMIL" | "SYSTEM" | "PUBLIC";
  readonly actorId?: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string | null;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
  readonly occurredAt?: Date;
}

@Injectable()
export class AuditService {
  public constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  public async record(input: RecordAuditEventInput): Promise<void> {
    await this.repository.append({
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: requireSafeLabel(input.action, "action"),
      resourceType: requireSafeLabel(input.resourceType, "resource type"),
      resourceId: input.resourceId ?? null,
      metadata: sanitizeMetadata(input.metadata ?? {}),
      createdAt: input.occurredAt ?? new Date(),
    });
  }
}

function requireSafeLabel(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 100 || forbiddenKeyPattern.test(normalized)) {
    throw new Error(`Unsafe audit ${label}`);
  }
  return normalized;
}

function sanitizeMetadata(
  metadata: Readonly<Record<string, string | number | boolean | null>>,
): Readonly<Record<string, string | number | boolean | null>> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, rawValue] of Object.entries(metadata)) {
    if (!allowedMetadataKeys.has(key) || forbiddenKeyPattern.test(key)) {
      throw new Error(`Audit metadata key is not allowlisted: ${key}`);
    }
    sanitized[key] =
      typeof rawValue === "string" ? redactSensitiveText(rawValue).slice(0, 200) : rawValue;
  }
  return sanitized;
}
