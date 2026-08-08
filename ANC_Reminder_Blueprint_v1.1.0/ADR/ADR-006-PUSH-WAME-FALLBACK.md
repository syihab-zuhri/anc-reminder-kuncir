# ADR-006: Push Retry with Manual `wa.me` Fallback

- Status: Accepted
- Date: 2026-08-08
- Owners: Architect + Product
- Related Requirements: FR-034, FR-035, FR-036, FR-037, FR-038

## Context
User wants automatic Android push first. If push remains unsuccessful, system should fall back to WhatsApp while keeping MVP free/without WhatsApp API.

## Decision Drivers
Automatic primary notification, low WhatsApp integration cost, operational transparency.

## Considered Options
FCM only; official WhatsApp Business API; `wa.me` fallback; unofficial gateway.

## Decision
Every eligible unconfirmed milestone receives a logical cycle every 3 days. FCM push is attempted first; retryable failure retries under configurable policy. Terminal/no-device outcome creates a **manual** `wa.me` fallback action. Staff must open WhatsApp and press Send. System tracks link/action state only and never infers delivery/read/failure from `wa.me`.

## Consequences
Puskesmas must operate fallback queue. “Both failed” can only be represented as push terminal failure plus manual action unresolved/marked unreachable; there is no provider failure callback for `wa.me`.

## Risks
Staff may not action queue; message query string can leak. Mitigate SLA/escalation and minimal template.

## Revisit Triggers
Need for WhatsApp to send automatically, delivery receipts, or high manual fallback workload.

## References
PRD-NOTIF, DOC-ARCH, DOC-SECURITY.
