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
- Public lookup uses a domain-separated HMAC, followed by the salted scrypt verifier; normalized names are compared through constant-time keyed digests.
- Wrong name/code, malformed/revoked credentials, inactive health center, and missing active pregnancy share one generic `401` response.
- Durable HMAC-only rate buckets default to 10 failures/IP and 5 failures/code per 15-minute window, then block for 15 minutes. Edge limiting remains defense-in-depth.
- Successful validation issues an opaque 256-bit restricted bearer with a configurable 30-day default TTL and no refresh route. PostgreSQL stores only its keyed HMAC.
- Every protected request revalidates session, credential, organization, and active pregnancy; logout or staff credential rotation/revocation makes sessions unusable immediately.
- The initial restricted DTO is own-only identity/session context. Mother bearers remain separate from staff authorization and cannot invoke pregnancy/visit mutations.

## References
PRD-MOTHER-ACCESS, DOC-SECURITY.
