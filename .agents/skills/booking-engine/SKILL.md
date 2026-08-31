---
name: booking-engine
description: Implement or audit the HomeServices booking lifecycle, availability, pricing snapshots, ownership, transitions, cancellation, completion, and booking events. Use for customer or professional booking flows and booking API contracts.
---

# Booking Engine

Treat a booking as a stateful aggregate shared by customer, professional, operations, billing, notifications, and analytics.

## Workflow

1. Enumerate allowed states and actor-specific transitions before implementation.
2. Validate customer/professional ownership and professional approval on every protected transition.
3. Capture service, price, fee, commission, currency, policy version, address/timezone, and acceptance evidence required to reproduce the decision.
4. Analyze availability races, duplicate requests, retries, cancellation-versus-confirmation, and completion-versus-refund.
5. Put the booking mutation and required outbox/audit/idempotency writes in the intended transaction.
6. Preserve current mobile endpoints and payloads unless a versioned migration is approved.

## Boundaries

- Booking state does not replace payment or ledger state.
- Availability is not trusted merely because the UI displayed a slot.
- Cancellation eligibility and refund amount are versioned policy decisions.
- Notifications and analytics react to committed events; they do not own booking transitions.
- Admin overrides require permission, reason, audit evidence, and any configured approval threshold.

Verify positive paths, forbidden actors, invalid transitions, replay, concurrency, timezone boundaries, pricing snapshot stability, cancellation/refund coupling, and legacy mobile contracts.
