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

## Security Implementation Record — 2026-08-10

- Code format: `ANC-XXXX-XXXX-XXXX-XXXX`, 16 random symbols from an unambiguous Base32 alphabet (80 bits entropy).
- Persistence: salted scrypt `N=2^17, r=8, p=1`; plaintext exists only in the first successful staff response.
- Idempotency replay returns the immutable credential snapshot without the plaintext code. If the first response is lost, staff performs an explicit reissue with a new idempotency key.
- Issue/reissue requires an active pregnancy. Reissue and revoke invalidate the prior active credential and all active mother sessions in the same transaction.
- Public name/code validation, generic failure, throttling, and restricted sessions remain the follow-on implementation in `TASK-P2-004`.

## References
PRD-MOTHER-ACCESS, DOC-SECURITY.
