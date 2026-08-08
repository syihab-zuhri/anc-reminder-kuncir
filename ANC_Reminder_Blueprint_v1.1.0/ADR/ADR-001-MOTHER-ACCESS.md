# ADR-001: Mother Access Without Traditional Account

- Status: Accepted
- Date: 2026-08-08
- Owners: Product + Security
- Related Requirements: FR-006, FR-007, FR-019

## Context
User memilih Bumil login dengan **nama + kode unik**.

## Decision Drivers
Sederhana, tidak tergantung OTP/WhatsApp API, privacy.

## Considered Options
Nama+kode unik; phone+OTP; username/password.

## Decision
Use name as identifier plus random unique code as authenticator. Hash code at rest; no public name search; generic failure; restricted session.

## Consequences
Staff must support reissue/revoke. Code loss requires contact.

## Risks
Guessing/disclosure mitigated by entropy, hash, throttling, audit.

## Revisit Triggers
Organization requires verified mobile identity/SSO.

## References
PRD-MOTHER-ACCESS, DOC-SECURITY.
