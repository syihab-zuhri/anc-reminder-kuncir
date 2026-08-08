# ADR-004: Super Admin Break-glass Access

- Status: Proposed
- Date: 2026-08-08
- Owners: Security Architect
- Related Requirements: FR-023

## Context
Technical support may occasionally require investigation, but routine health-data access is unnecessary.

## Decision Drivers
Least privilege, supportability, auditability.

## Considered Options
Routine full access; no access ever; time-bound break-glass.

## Decision
If implemented, Super Admin has no health access by default. Break-glass requires reason, scope, expiry, and audit before read.

## Consequences
Additional workflow complexity; can remain P1.

## Risks
Privilege abuse; mitigate review and immutable audit.

## Revisit Triggers
Operational support model proves break-glass unnecessary or legal policy changes.

## References
DOC-PERMISSION, DOC-SECURITY.
