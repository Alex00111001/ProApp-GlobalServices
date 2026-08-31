---
name: professional-system
description: Build or review HomeServices professional onboarding, verification, profile, services, categories, availability, booking work, earnings projections, and professional mobile flows.
---

# Professional System

Inspect the current `mobile-professional`, backend professional controllers/routes, Prisma models, and admin review flow. The implementation-plan baseline can lag the repository; use it for target architecture and verify current implementation evidence directly.

## Invariants

- A user cannot act as an approved professional until the authoritative approval state permits it.
- Profile ownership, admin review permission, and document access are enforced server-side.
- Document and certification metadata are personal/sensitive; restrict exposure and redact logs.
- Availability updates and booking acceptance must be concurrency-safe.
- Service/category eligibility and market configuration are validated at the backend.
- Professional earnings are projections of ledger-backed financial facts, not an editable balance.
- Commission policy is versioned and distinct from client platform fees.

## Workflow

1. Trace onboarding, verification, approval/rejection, profile, service, availability, booking, and earnings contracts across both apps and backend.
2. Define state transitions and responsible actors.
3. Keep provider/file operations behind adapters and audit administrative decisions.
4. Preserve customer-facing professional profiles while preventing private-field leakage.
5. Add feature flags and migration compatibility for high-impact changes.

Verify permission and ownership matrices, document lifecycle, invalid transitions, availability races, booking integration, earnings reconciliation, localization, and professional mobile typecheck/build behavior.
