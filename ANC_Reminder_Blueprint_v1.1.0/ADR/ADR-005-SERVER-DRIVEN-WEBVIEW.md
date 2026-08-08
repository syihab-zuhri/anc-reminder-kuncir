# ADR-005: Server-Driven Web and Android WebView

- Status: Accepted
- Date: 2026-08-08
- Owners: Architect
- Related Requirements: FR-039, NFR-017, NFR-018

## Context
User requires two delivery surfaces, Web and WebView, with all important processing loaded on server.

## Decision Drivers
One source of truth, rule consistency, easier policy update, small team maintenance.

## Considered Options
Full native business logic; duplicated Web/Android rule logic; server-driven thin clients.

## Decision
Next.js Web and Android WebView render server DTOs. NestJS server owns ANC calculation, authorization, reminder eligibility, program assessment, and WhatsApp link construction.

## Consequences
Server availability becomes critical; offline-first is out of scope. Clients remain simpler.

## Risks
Server outage blocks normal operation. Mitigate observability, graceful error, backup, capacity monitoring.

## Revisit Triggers
Confirmed field requirement for offline workflow or measured server bottleneck that cannot be solved by current topology.

## References
DOC-ARCH, DOC-DSD.
