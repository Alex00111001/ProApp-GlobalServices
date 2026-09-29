# Booking mutation contracts — PRR-105

Task classification: approved PRR-105 tranche; Marketplace/Booking with authorized Billing coupling; CRITICAL; DEEP design/final review. Operator-selected Codex model; focused review and fixture work previously routed to Sol/Terra. Skills: systematic-engineering, api-contract-engineering, booking-engine, payments, database-prisma, testing, security, observability, release and repo-auditor. Escalate migrations, changed financial guarantees, actor/privacy drift or failed exact-SHA gates. Migration: NONE. Production/Markets/CASH remain OFF; F11 PAUSED.

## Mounted mutation inventory

Derived from `booking.routes.js`, controller runtime, lifecycle/creation services and executable source inventory. All six are POST, use that router and `booking.controller.js`, and remain LEGACY_SUPPORTED. Existing responses came from controller/service Prisma reads; all six now use `bookingMutationResponses` with explicit actor serializers composed from the Booking read DTO authority.

| Path | Controller | Domain authority | Actor / ownership | Input | HTTP success / view | Consumers |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/bookings` | createBooking | claimBookingCreation / completeBookingCreation / schedulingWindow / resolveBookingCommercialPolicy | CLIENT; profile derived from authenticated actor; approved professional and owned active services/category | createBookingSchema after normalizeBookingPayload; required Idempotency-Key | 201 new / 200 replay; customer | Customer mobile |
| `/api/bookings/{id}/confirm` | confirmBooking | claimBookingTransition(CONFIRM) | approved PROFESSIONAL assigned to booking | bookingIdParams | 200; professional | Professional mobile; unused incompatible Customer helper |
| `/api/bookings/{id}/reject` | rejectBooking | claimBookingTransition(REJECT); reconcileCancelledBookingPaymentInTx | approved PROFESSIONAL assigned to booking | bookingIdParams / bookingRejectionBody | 200; professional | Professional mobile |
| `/api/bookings/{id}/start` | startBooking | claimBookingTransition(START) | approved PROFESSIONAL assigned to booking | bookingIdParams | 200; professional | Professional mobile |
| `/api/bookings/{id}/complete` | completeBooking | claimBookingTransition(COMPLETE); assertBookingCompletionFinanciallyReady; payout request authority | approved PROFESSIONAL assigned to booking | bookingIdParams | 200; professional + safe payout | Professional mobile; unused incompatible Customer helper |
| `/api/bookings/{id}/cancel` | cancelBooking | claimBookingTransition(CANCEL); reconcileCancelledBookingPaymentInTx | CLIENT owning booking or assigned PROFESSIONAL; no extra professional approval guard on this supported cancellation route | bookingIdParams / bookingCancellationBody | 200; actor-specific + safe refund decision | Customer mobile; supported Professional API helper currently unused by UI |

Every operation is HIGH or CRITICAL risk due to ownership/privacy and/or financial coupling. No mounted reschedule, assignment, unassignment, reopen, update, no-show command, admin or system lifecycle mutation was found. Stripe webhook and customer payment confirmation are payment commands; capture now preserves Booking status under the approved professional-only confirmation rule. Refund execution updates the fee projection, not lifecycle status. Service assignment happens during creation; no separate assignment state exists.

## Extracted state machine

| From → To | Actor | Preconditions | Transactional side effects | Failure |
| --- | --- | --- | --- | --- |
| none → PENDING | CLIENT | future date, valid durations, services owned by approved professional/category, commercial policy, owned address/market/service-area when Markets enabled, valid idempotency key, no active slot overlap | booking/services, client counter, professional notification, durable creation idempotency | 400/422 validation; 409 payload/slot conflict; 503 policy unavailable |
| PENDING → CONFIRMED | assigned approved PROFESSIONAL | state claim | confirmation notification and outbox | 409 BOOKING_TRANSITION_CONFLICT |
| PENDING → CANCELLED (reject) | assigned approved PROFESSIONAL | conditional state claim | rejection notification/outbox/audit; captured-payment reconciliation | 409 BOOKING_TRANSITION_CONFLICT |
| CONFIRMED → IN_PROGRESS | assigned approved PROFESSIONAL | conditional state claim | start notification/outbox/audit | 409 BOOKING_TRANSITION_CONFLICT |
| IN_PROGRESS → COMPLETED | assigned approved PROFESSIONAL | settled non-CASH payment; no REQUESTED/APPROVED/PROCESSING refund | single earning/professional statistics/payout request when enabled; notification/outbox/audit | 409 payment not settled, active refund, retired CASH or transition conflict |
| PENDING/CONFIRMED/IN_PROGRESS/NO_SHOW → CANCELLED | owning CLIENT / assigned PROFESSIONAL | conditional state claim | cancellation notification/outbox/audit; captured-payment reconciliation | 409 completed or incompatible replay/transition |

CONFIRMED, IN_PROGRESS and COMPLETED replays are idempotent without repeating side effects. Rejection replay additionally requires professional cancellation plus `booking.rejected` evidence; cancellation replay requires the same actor class/reason plus `booking.cancelled` evidence. A cancelled state alone does not authorize replay of a different command. COMPLETED and CANCELLED have no forward lifecycle mutation. NO_SHOW exists in the database/read enum but has no runtime command; the existing NO_SHOW-to-CANCELLED behavior is preserved and documented, not silently redesigned. Customer's unsupported REJECTED status was replaced with the actual NO_SHOW read status. Initial architecture drift—capture also confirming Booking—was corrected using the user's explicit semantic decision.

## Input and consumer boundaries

UUID inputs are STRUCTURAL. Cancel/reject reason bodies are NORMALIZATION: body is optional, reason is optional/string/null, unknown properties are accepted then stripped, string values are trimmed and truncated to 500. The raw accepted-value schema is projected from metadata attached to the actual runtime validator. Normalization remains explicitly non-structural and counted unresolved by the unchanged global gate. No wire maxLength is imposed on a string that runtime accepts then truncates.

Create remains TRANSFORM/LEGACY_COMPATIBILITY with runtime-derived scheduling/market guards: zipCode/postalCode aliases, scheduledTime merging in local time, text normalization before bounds and required Idempotency-Key are not fully represented by the global inventory. Tests prove the supported consumer form and aliases, but do not close this residual projection. Headers/domain guard projection remains an explicit gap.

`booking-mutation-consumer-parity.test.js` proves source-level request/required/nullable/enum, consumed response fields/types, actor requirements and status alignment for the active Customer create/cancel and Professional confirm/reject/start/complete surfaces. Admin/Public have no Booking lifecycle mutation consumer. The Professional cancellation wrapper remains supported. Customer confirm/complete wrappers occur in an unconsumed hook and remain forbidden by the mounted professional guard; no unsupported permission is introduced to make a path match compatible. These focused checks do not promote the 144 global observations from path/method evidence to full OLD/NEW semantic parity.

## Transactions, privacy and security

Conditional domain claims serialize lifecycle winners. Creation retains transaction-scoped idempotency and professional schedule advisory locks. Capture, rejection, cancellation, completion and intent preparation use Payment-before-Booking locks and fresh financial reads. Intent persistence uses the expected provider intent identity to reject overwrites; ambiguous persistence retries transactionally and never cancels an uncertain shared intent. Provider I/O stays outside database transactions. Failed webhooks conditionally update only the matching nonterminal intent.

Captured cancellation/rejection shares one policy refund request and one deduplicated HIGH incident/alert/audit regardless of ordering, without provider money movement. Existing four-eyes refund and payout execution authorities remain in place. Completion rechecks settled status and active refund state before its single earning/statistics writes. A historical CASH payment cannot authorize a new completion or earning.

Mutation responses reuse customer/professional allowlists. Negative contract tests exclude contacts, coordinates, credential/provider identifiers, internal pricing/ledger/risk/audit/notes and DB-only fields. Required/nullable/date/Decimal money/enums/nested arrays and SafeError status handling are tested. Knowing a booking ID does not bypass ownership or professional approval. Candidate OpenAPI remains CANDIDATE_NOT_PUBLISHED.

## Evidence and rollback

Unit/contract/source tests: booking-domain, booking-mutation-response-contract, booking-mutation-authorization, booking-mutation-consumer-parity, booking-input-wire-contract, booking-payment-coupling, payment-intent-preparation, payment-intent-orphan and payment-intent-persistence-failure. Real PostgreSQL tests: booking-payment-postgres and booking-transition-postgres, including simultaneous confirms, confirm/reject, complete/cancel, duplicate completion, creation replay/slot exclusion, retired CASH and capture/rejection in both forced orders plus concurrently. Row-lock waiting is observed through PostgreSQL rather than inferred from an arbitrary delay.

Exact implementation/evidence SHA and CI results are recorded in `docs/releases/2026-09-16-prr-105-api-v1-contract.md`. Database suites refuse remote targets and use isolated loopback homeservices_ci. No local PostgreSQL PASS is claimed when Docker is unavailable; required PostgreSQL evidence comes from exact-SHA CI.

Rollback is forward application correction with legacy routes preserved and financial execution flags OFF. Do not restore the known capture-confirmation bug, cancel ambiguous shared intents, drop schema/history, or mutate immutable ledger evidence. No migration or production rollout is included. Global PRR-105 remains PARCIAL and PRR-106 BLOCKED until every global acceptance gate is independently satisfied.
