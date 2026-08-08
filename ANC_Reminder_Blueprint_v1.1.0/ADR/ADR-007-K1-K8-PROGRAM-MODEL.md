# ADR-007: K1–K8 Milestone and Program Assessment Model

- Status: Accepted
- Date: 2026-08-08
- Owners: Architect + Clinical/Program Owner
- Related Requirements: FR-029, FR-030, FR-031, FR-032, FR-040, FR-043

## Context
User clarified K means visit/check milestone and red-outline milestones have required facility. Puskesmas owns detail K1–K6; Bidan confirmation must remain simple.

## Decision Drivers
Clear lifecycle, configurable clinical/program policy, low Bidan data-entry burden.

## Considered Options
Trimester-only model; K1–K6 only; K1–K8 milestones with separate record validation and program assessment.

## Decision
Model K1–K8 separately. Use `visit_status` independent of `record_validation_status`. K1/K4/K5 require Puskesmas; K2/K3/K6/K7 follow configured allowed facilities; K8 is delivery milestone PONED/RS. Bidan confirms K2/K3/K6/K7 only; Puskesmas inherits confirmations and owns detail K1–K6. Program predicate is evaluated from a versioned rule, not from K6 alone.

## Consequences
Exact target weeks and program components stay configuration requiring clinical approval.

## Risks
Wrong rule configuration can misdirect care. Mitigate approval/versioning/audit.

## Revisit Triggers
Official/local program definition changes, K7 detail becomes required, or K8 requires full integration.

## References
PRD-ANC, PRD-CHECKUP, PRD-PROGRAM.
