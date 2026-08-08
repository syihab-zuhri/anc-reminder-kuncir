# PRD: Content Management

> **Feature ID:** FEAT-CONTENT  
> **Version:** 1.0.0  
> **Status:** Review  
> **Priority:** P1  
> **Owner:** Clinical/Program Owner  
> **Dependencies:** FEAT-STAFF  
> **Last Updated:** 2026-08-08

## 1. Overview
Versioned approved reminder/education templates.

## 2. Goals
Prevent unapproved or overly sensitive text in push/`wa.me`.

## 3. Non-Goals
No AI-generated medical advice automatically published.

## 4. Actors & Permissions
Puskesmas content manager drafts; Clinical/Program Owner approves.

## 5. Content Types
`PUSH_REMINDER`, `WAME_REMINDER`, `EDUCATION`, `CONTACT_GUIDANCE`.

## 6. Lifecycle
`DRAFT → REVIEW → APPROVED → PUBLISHED → ARCHIVED`.

## 7. Business Rules
Published versions immutable; `WAME_REMINDER` rejects sensitive placeholders (NIK, diagnosis, lab result, risk category).

## 8. Acceptance Criteria
Only approved template may be used by server; archived template not selected for new cycles; historical snapshot retained.

## 9. API References
`API-CONTENT-*`.

## 10. Data Model References
`content_templates`, `content_versions`.

## 11. Security & Privacy
Sanitize output; no arbitrary client-controlled template.

## 12. Testing
Permission, lifecycle, placeholder allowlist, rendering/encoding.
