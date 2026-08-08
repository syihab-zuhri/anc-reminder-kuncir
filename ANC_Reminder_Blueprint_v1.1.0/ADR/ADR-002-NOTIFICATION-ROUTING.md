# ADR-002: Single-Channel Notification Routing

- Status: Superseded
- Date: 2026-08-08
- Owners: Architect
- Related Requirements: DEPRECATED FR-014, FR-016

## Context
Old draft selected automatic push-vs-WhatsApp provider routing.

## Decision
**Superseded by ADR-006** after user confirmed push-first with retry followed by **manual `wa.me` fallback**.

## Consequences
Do not implement old automatic WhatsApp adapter/webhook contract.

## References
ADR-006, PRD-NOTIF.
