# Design System & UX Rules

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-DSD  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** UX Lead  
> **Last Updated:** 2026-08-08  
> **Depends On:** PRD documents

## 1. Design Principles

Simple, calm, high readability, minimal taps for Bidan, explicit location/status language, no diagnostic alarm styling for administrative states.

## 2. Accessibility Target

`PROPOSED`: WCAG 2.1 AA for critical Web/WebView journeys; touch targets ≥44 CSS px where feasible; keyboard support for staff Web.

## 3. Design Tokens (`PROPOSED`)

Use design-system variables for typography, spacing, radius, semantic success/warning/error/neutral. Do not encode medical severity through color without text label.

## 4. Responsive Layout

Mobile-first Bumil view; staff dashboard responsive to tablet/desktop. Suggested breakpoints: 640/768/1024/1280, implementation may adjust.

## 5. Core Components

`MilestoneTimeline`, `MilestoneCard`, `LocationBadge`, `VisitStatusBadge`, `RecordValidationBadge`, `ReminderFallbackCard`, `ConfirmVisitButton`, `ServerErrorState`, `EmptyState`, `AuditMetadata`, `ProgramProgress`.

## 6. Bumil Screens

### Access
Nama + Kode Unik, no search suggestion.

### Dashboard
Usia/trimester from server, next K, location requirement, timeline K1–K8, contact.

### Notification
Push deep-links to relevant milestone. No self-confirm button.

## 7. Bidan Screens

Dashboard “Bumil Saya”, due/overdue, `Konfirmasi Sudah Periksa` for K2/K3/K6/K7, assigned WA fallback queue.

Confirmation flow should be ≤2 actions after mother page: click confirm → confirm dialog/success.

## 8. Puskesmas Screens

Aggregate dashboard, registration, assignment, K1–K8 timeline, K1–K6 detail/validation, reminder fallback queue, program progress, reports/settings.

### Registration Form
Urutan field utama:
1. **Nama** — required.
2. **NIK** — required; gunakan numeric-friendly input, jangan tampilkan nilainya di toast/log.
3. **Alamat** — required; multiline diperbolehkan.
4. **Nomor Telepon** — required; tampilkan format lokal, normalisasi dilakukan server.
5. **Awal Kehamilan** — required date input.

Submit menampilkan inline validation per field. Setelah submit berhasil, UI tidak mengulang NIK lengkap pada success summary.

## 9. `wa.me` UX

Button text: **“Buka WhatsApp”** or **“Siapkan Pengingat WhatsApp”**. Never “Terkirim otomatis”. After return, optional staff choices: `Tandai Ditindaklanjuti` / `Tidak Dapat Dihubungi`. Provide copy: “Sistem tidak dapat mengetahui status kirim/baca WhatsApp dari wa.me.”

## 10. States

Loading skeleton; empty; validation error; 401/403; server unavailable; push permission denied; WA fallback ready; success; disabled. Offline/server-down must not present local health data as current authoritative state.

## 11. Form Behavior

Inline validation; destructive/correction actions need confirmation. Bidan confirm form contains no clinical fields. Puskesmas detail fields follow approved schema.

## 12. Content Style

Bahasa Indonesia; concise; “milestone/kunjungan Kx”; “Puskesmas wajib” only where rule says so; “Memenuhi Hak Janin” displayed as program/administrative label only.

## 13. WebView/Android Rules

Trusted HTTPS origin only, external links leave WebView appropriately, secure session storage, FCM permission UX, no unrestricted JS bridge, back button predictable, safe server-down page.
