# PRD Index

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-PRD-INDEX  
> **Version:** 1.0.0  
> **Status:** Review  
> **Owner:** Product Owner  
> **Last Updated:** 2026-08-08  
> **Depends On:** DOC-SRS

## Feature Registry

| Feature | ID | Priority | Owner | Dependencies |
|---|---|---|---|---|
| Staff Access | FEAT-STAFF | P0 | Product + Security | DOC-SRS |
| Mother Registry | FEAT-REGISTRY | P0 | Product | FEAT-STAFF |
| Mother Private Access | FEAT-MOTHER-ACCESS | P0 | Product + Security | FEAT-REGISTRY |
| ANC K1–K8 Care Plan | FEAT-ANC | P0 | Clinical/Program | FEAT-REGISTRY |
| Check-up Tracking | FEAT-CHECKUP | P0 | Product + Clinical | FEAT-ANC |
| Notification Automation | FEAT-NOTIF | P0 | Product | FEAT-CHECKUP |
| Dashboard | FEAT-DASHBOARD | P0 | Product | FEAT-ANC, FEAT-CHECKUP, FEAT-NOTIF |
| Program Status | FEAT-PROGRAM | P0 | Clinical/Program | FEAT-CHECKUP |
| Content Management | FEAT-CONTENT | P1 | Clinical/Program | FEAT-STAFF |

## Dependency Order

`STAFF → REGISTRY → MOTHER ACCESS / ANC → CHECKUP → NOTIFICATION / PROGRAM → DASHBOARD`

## Global Invariants

- Domain logic lives on server.
- Puskesmas permission superset of Bidan.
- Bumil cannot self-confirm.
- `wa.me` never provides delivery truth.
- K1/K4/K5 Puskesmas; K8 PONED/RS; exact weeks configurable and clinically approved.
