# HOME SERVICES — SPAIN PRODUCTION READINESS IMPLEMENTATION PLAN

- Fecha: 2026-09-11
- Base: `docs/production-readiness/SPAIN_GAP_ANALYSIS.md`
- Rama inicial: `feature/production-control-plane-phase-11`
- Commit base: `a62fa4f1`
- Objetivo: `PRODUCTION-READY BUT NOT PRODUCTION-DEPLOYED`
- Capability tier: `DEEP`
- Riesgo: `CRITICAL`, transversal a todas las aplicaciones

## Reglas de ejecución

1. Respetar el orden A–P y cerrar el gate de cada fase antes de avanzar.
2. Usar PostgreSQL/Prisma como autoridad; frontends consumen API y nunca implementan reglas nacionales autoritativas.
3. Conservar Express 5/CommonJS, Prisma/PostgreSQL y los componentes funcionales existentes.
4. Aplicar migraciones `expand → migrate/read-new → contract`; no usar `prisma db push`, reset ni rollback destructivo.
5. Mantener ES, BR y CL deshabilitados y todos los efectos financieros/provider off durante la preparación.
6. Nunca ejecutar tests de integración sobre una base que no esté acreditada como aislada.
7. Nunca introducir secretos, certificados, keystores, documentos legales supuestamente aprobados o credenciales ficticias.
8. No modificar los cambios móviles preexistentes del usuario sin aislar el solapamiento. Los nuevos cambios se limitarán a archivos sin conflicto o se detendrán si el mismo bloque ya fue editado.
9. Cada bloque sigue: inspección → cambio mínimo correcto → tests → ejecución → corrección → documentación → evidencia.
10. Un PASS requiere comando, resultado y artefacto verificable; “no probado” nunca se transforma en PASS.

## Grafo de dependencias

```text
A Audit
  -> B Gap + Plan
      -> C Domain/DB invariants
          -> D Identity/Security
              -> E Professional/Compliance
                  -> F Payments/Ledger/Refunds
                      -> G Privacy/Legal/Audit
                          -> H Admin/Operations
                              -> I Infrastructure/Observability
                                  -> J CI/CD/Backup
                                      -> K Web/Mobile
                                          -> L Automated/E2E
                                              -> M Performance/Security
                                                  -> N Store readiness
                                                      -> O Canonical docs
                                                          -> P Final audit
```

Los adapters externos de hosting, secret manager, MFA, pagos production, comunicaciones, monitoring y stores quedan detrás de contratos cerrados. La ausencia de proveedor impide su activación, no la construcción de los puertos, validadores, mocks de test y runbooks.

## PHASE A — Repository audit

**Estado:** completada.

**Alcance:** inventario Git, apps, backend, schema, migraciones, auth/RBAC, payments, jobs, storage, CI, tests, observabilidad, docs, env y código parcial.

**Evidencia:** `SPAIN_GAP_ANALYSIS.md`, `npm run verify`, Prisma validate/status/baseline audit, seis npm audits y estado Git.

**Gate:** matriz de 50 requisitos y P0/P1 confirmados. **PASS**.

## PHASE B — Architecture + domain gap analysis

**Estado:** completada al versionar este documento.

**Archivos afectados:**

- `docs/production-readiness/SPAIN_GAP_ANALYSIS.md`
- `docs/production-readiness/SPAIN_IMPLEMENTATION_PLAN.md`

**Riesgos:** declarar capacidades históricas como readiness actual; perder cambios móviles ajenos.

**Rollback:** eliminar sólo estos dos documentos si la iniciativa se cancela; no toca runtime ni datos.

**Gate:** ambos documentos existen antes del primer cambio de código. **PASS**.

## PHASE C — Database/domain corrections

**Objetivo:** cerrar invariantes de Booking, dinero y referencias multipaís sin una migración destructiva.

**Estado 2026-09-12:** en progreso. Ya están implementados y verificados el idempotency key/digest con replay previo a validaciones mutables, el intervalo y exclusión de agenda, las transiciones CAS `PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED`, el rechazo profesional explícito/auditado, el requisito de pago liquidado antes de crear earnings, las proyecciones públicas allowlist y la resolución fail-closed de moneda/precios desde `MarketPolicyVersion` + `PricingPolicy` cuando Markets está activo. La migración `202609120001_remove_legacy_market_defaults` retiró los defaults `MX/MXN/EUR` sin reescribir historia y fue desplegada con autorización a Supabase el 2026-09-12; las 30 migraciones están actuales y la auditoría SQL posterior pasa sin violaciones. Persisten como bloqueadores de cierre la aceptación versionada de refund/legal policy y el workflow gobernado de liquidación en efectivo.

**Dependencias:** ADR 0004, F3 Billing, schema actual y base aislada PostgreSQL.

**Archivos previstos:**

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/<timestamp>_booking_domain_integrity/migration.sql`
- `backend/src/modules/bookings/*` (nuevo límite de dominio)
- `backend/src/controllers/booking.controller.js`
- `backend/src/validators/booking.validators.js`
- `backend/test/booking-domain.test.js`
- `backend/test/integration/booking-domain-postgres.test.js`

**Cambios:**

- clave de idempotencia/payload digest para creación de Booking;
- slot/intervalo normalizado, zona horaria/policy y exclusión transaccional por profesional;
- transitions CAS (`PENDING → ACCEPTED/REJECTED → IN_PROGRESS → COMPLETED`) manteniendo proyección `CONFIRMED` compatible durante transición;
- currency obligatoria derivada de Market, pricing/refund policy version/snapshot y no defaults `MXN/MX` en nuevas operaciones;
- constraints/índices para earnings/payment y timestamps relevantes;
- proyecciones públicas allowlist para no serializar entidades completas.

**Migración:** aditiva, columnas nullable primero; backfill determinista sólo con datos inequívocos; constraint `NOT VALID`/validate o equivalente seguro; no borrar legacy.

**Tests:** doble slot concurrente, retry mismo payload, idempotency conflict, cambio de estado concurrente, currency/policy market, replay completo de migraciones.

**Riesgos:** horarios existentes ambiguos y bookings históricos solapados.

**Rollback:** desactivar endpoints nuevos, dual-read a columnas legacy y conservar columnas/evidencia; corregir hacia delante.

**Evidencia 2026-09-12:** replay limpio de 30 migraciones en PostgreSQL 17 desechable; 246/246 unit/contract; 28/28 integration secuencial, incluida concurrencia real de transición; 191 archivos JavaScript con sintaxis válida; verificación de Admin, Public Web y ambas apps PASS. El gate estático bloqueó inicialmente la migración posterior al hardening; se ajustó para permitir sólo sucesoras que no creen superficie Data API y volvió a PASS. Los contenedores y sus datos de prueba se eliminaron tras verificar cada objetivo exacto.

**Gate:** **PARCIAL**. Prisma + unit + integration aislado pasan; no se cierra la fase hasta resolver los bloqueadores anteriores y repetir `npm run verify`.

## PHASE D — Identity/security

**Objetivo:** cerrar P0 de exposición/BAC y disponer de sesiones cliente revocables, recuperación/verificación y controles anti-abuso.

**Dependencias:** Phase C, RBAC F4, outbox.

**Archivos previstos:**

- `backend/src/shared/http/public-projections.js`
- `backend/src/controllers/{auth,booking,payment,professional,notification,review}.controller.js`
- `backend/src/routes/{auth,notification,review,professional,payment}.routes.js`
- `backend/src/middleware/auth*.js`, nuevo limiter de auth
- `backend/src/modules/identity/customer-session.service.js`
- `backend/prisma/schema.prisma`
- migración `*_identity_session_security`
- tests unitarios/HTTP/integration de autorización

**Cambios:**

- allowlists de User/Profile/Booking/Payment; prohibición testada de `passwordHash`, tokens y PII no necesaria;
- notification create sólo interno/admin con permiso y recipient autoritativo;
- reparar Review con ownership/role/schema real;
- Access token corto + refresh hash/rotation/revocation/session/device metadata segura;
- revocar sesiones al cambiar password, desactivar cuenta o elevar/reducir privilegios;
- recovery/verification con tokens one-time hasheados, expiración, replay protection y mensajes anti-enumeration;
- rate limits específicos y preparado para store distribuido en staging/production;
- eliminar legacy ADMIN wildcard de endpoints finales tras verificar assignments.

**Migración:** tablas/enum/índices de sesión y tokens; no migrar JWT existentes a DB; grace window configurable y revocación global.

**Tests:** matriz 401/403/IDOR/mass assignment, user enumeration, brute force, token rotation/replay/revocation, password change, sensitive-field negative assertions.

**Riesgos:** compatibilidad móvil durante transición de token.

**Rollback:** feature flag de refresh protocol y soporte temporal de access token legacy; nunca reabrir las proyecciones inseguras.

**Gate:** SEC-001/SEC-002/REVIEW-001 cerrados y security suite green.

## PHASE E — Professional + compliance architecture

**Objetivo:** aggregate profesional y tax-readiness multipaís sin decidir obligaciones legales.

**Dependencias:** C/D, MarketPolicy, identity protection, privacy.

**Archivos previstos:**

- `backend/prisma/schema.prisma`
- migraciones `*_professional_onboarding` y `*_tax_reporting_foundation`
- `backend/src/modules/professionals/*`
- `backend/src/modules/tax-reporting/{tax-reporting.service,adapter-registry,spain-dac7.adapter}.js`
- validators/routes/admin contracts/tests

**Cambios:** `ProfessionalIdentity`, `ProfessionalTaxProfile`, `ProfessionalVerification`, `ProfessionalPaymentAccount`, áreas, disponibilidad y estados DRAFT/PENDING_VERIFICATION/VERIFIED/ACTIVE/SUSPENDED/REJECTED/DEACTIVATED; requirements versionados por MarketPolicy; TaxReporting port, períodos, auditable export manifest y Spain adapter desactivado.

**Migración:** expandir y mapear status legacy sin perder valor; perfiles fiscales sensibles cifrados/HMAC cuando necesiten búsqueda; no activar reporting.

**Tests:** eligibility fail-closed, required checks ES/BR/CL, state machine/four-eyes, export minimization/reproducibility, no filing/provider call.

**Riesgos:** campos obligatorios dependen de revisión legal/fiscal.

**Rollback:** adapter/reporting off; conservar evidencia y proyección status legacy.

**Gate:** ningún profesional opera sin requisitos técnicos activos; tax export sólo `DRAFT/GENERATED`, nunca filed.

## PHASE F — Payments + ledger + refunds

**Objetivo:** desacoplar Stripe y cerrar integridad financiera end-to-end.

**Dependencias:** C/E, decisiones Connect/KYC externas sólo para activación.

**Archivos previstos:**

- `backend/src/modules/billing/providers/payment-provider.js`
- `backend/src/modules/billing/providers/stripe-payment.provider.js`
- `backend/src/modules/billing/providers/fake-payment.provider.js` sólo tests
- controllers/services de payment/refund/payout/webhook
- schema/migration `*_financial_append_only_integrity`
- `backend/test/payment-provider*.test.js`

**Cambios:** contrato provider completo; registry cerrado; cash sin `Number`; amount/currency siempre desde Booking/Market; webhook timestamp/replay policy; idempotency payload digest; ledger/Audit financial append-only; completar/refund/payout exige states financieros coherentes; métricas específicas.

**Migración:** triggers de protección para journal/evidencia y constraints aditivos; nunca reescribir postings.

**Tests:** fake contract y Stripe mocked; duplicate/delayed/invalid signature/failure/timeout/refund parcial/chargeback/payout failure/retries y reconciliación.

**Riesgos:** semántica Stripe Connect y migración de IDs/provider metadata.

**Rollback:** registry vuelve a Stripe adapter con misma interfaz; flags execution siguen off; datos nuevos se conservan.

**Gate:** ninguna operación usa float, tarjeta completa o provider directo fuera del adapter.

## PHASE G — Privacy + legal acceptance + audit

**Objetivo:** documentos/aceptaciones versionadas y workflows RGPD verificables.

**Dependencias:** D/E/F y revisión humana para activar contenido/retenciones.

**Archivos previstos:**

- schema/migraciones `*_legal_acceptance_privacy_requests`
- `backend/src/modules/legal/*`
- `backend/src/modules/privacy/requests/*`
- jobs de export/delete/anonymize
- API cliente/admin y tests

**Cambios:** LegalDocument/Version/Acceptance; evidence digest/context/locale; DataAccess/Export/DeletionRequest; resolution DELETE/ANONYMIZE/RETAIN_LEGAL_REQUIREMENT; retention registry versionada; export cifrado con expiración; AuditLog mutation guard y retention workflow autorizado.

**Migración:** preservar campos User legacy como proyección; backfill sólo como `LEGACY_UNVERIFIED_EVIDENCE`, nunca como aceptación plenamente probada.

**Tests:** exact version/digest, stale acceptance, purpose isolation, export authorization, deletion decision, legal hold, audit immutability/redaction.

**Riesgos:** no hay plazos/textos aprobados.

**Rollback:** documentos/policies quedan DRAFT; workers off; evidencia no se elimina.

**Gate:** software preparado, políticas reales aún `BLOQUEADO_EXTERNAMENTE`.

## PHASE H — Admin + operational tooling

**Objetivo:** completar el control web único con least privilege.

**Dependencias:** D–G.

**Archivos previstos:** `backend/src/routes/admin-v1.routes.js`, módulos admin, contracts TS, `admin-web/src/pages/*`, navigation/tests.

**Cambios:** services/categories, disputes/refunds/payouts, policy/config/feature flags, tax export, privacy requests, health/evidence; confirmaciones tipadas y reasons; sensitive reads auditadas; retirar placeholders Revenue/Analytics.

**Migraciones:** sólo si hacen falta approvals/idempotency adicionales; aditivas.

**Tests:** permission matrix, four-eyes, destructive confirmation, pagination/filters, a11y y no direct provider/database.

**Riesgos:** expansión excesiva de permisos wildcard.

**Rollback:** ocultar superficie y desactivar mutation flag; backend mantiene autoridad.

**Gate:** ningún endpoint sensible depende de `User.role=ADMIN` ni sólo de UI.

## PHASE I — Infrastructure + observability

**Objetivo:** runtime reproducible y señales completas sin seleccionar proveedores no aprobados.

**Dependencias:** H y topología externa pendiente.

**Archivos previstos:** Dockerfiles API/workers/web, `.dockerignore`, `compose.yaml` dev/test, env schemas, observability metrics/runbooks.

**Cambios:** multi-stage/non-root/read-only-capable, healthchecks, graceful shutdown, resource/timeouts; métricas payment/webhook/queue/DB; adapters OTLP/error tracking por env; ninguna URL/secret embebida.

**Tests:** container build/smoke, health/readiness, shutdown, config fail-closed, telemetry redaction/cardinality.

**Riesgos:** native Expo no se containeriza como runtime productivo.

**Rollback:** imágenes son aditivas; runtime Node local continúa compatible.

**Gate:** compose aislado levanta test stack y produce health green.

## PHASE J — CI/CD + backups

**Objetivo:** gates de release, deployment preparado sin destino production y restauración demostrable en aislamiento.

**Dependencias:** I, proveedor DB/storage y RPO/RTO externos para valores finales.

**Archivos previstos:** `.github/workflows/ci.yml`, workflows reusable/staging/production-manual, scripts release gates, `docs/operations/{DEPLOYMENT,BACKUP_RESTORE,INCIDENT_RESPONSE}.md`.

**Cambios:** formatting/type/unit/integration/security/build/migration/E2E; SBOM/artifact digest; TEST/STAGING deploy adapters sin secrets en repo; PRODUCTION job protegido/manual y sin environment configurado por defecto; backup/restore scripts provider-neutral/fail-closed.

**Tests:** clean migration replay, backup + restore + checksum a DB efímera, rollback rehearsal, invalid/stale evidence gate.

**Riesgos:** un workflow preparado podría ejecutarse accidentalmente.

**Rollback:** production workflow contiene doble guard `PRODUCTION_DEPLOYMENT_AUTHORIZED=false` + protected environment; eliminar sólo adapter, preservar evidence.

**Gate:** restore test PASS; production permanece imposible sin configuración y aprobación externas.

## PHASE K — Web/mobile corrections

**Objetivo:** recorridos y configuración release-ready en las cuatro superficies.

**Dependencias:** APIs D–H, legal engine G, infra I.

**Archivos previstos:** public/admin config; mobile service/stores/screens; Expo app configs; assets sin solapar cambios ajenos; tests.

**Cambios:** public web fail-closed sin API; legal/privacy/cookies/consent links; cliente verify/review/refund/support/dispute; profesional onboarding/services/availability/accept-reject/execution/payout; estados loading/error/empty; deep links; permisos mínimos; accessibility.

**Tests:** component/contract por superficie, deep-link routing, prod config negative test, Expo prebuild/config validation, Android/iOS non-store build where host permits.

**Riesgos:** Windows no puede generar archivo iOS firmado; cambios móviles actuales del usuario.

**Rollback:** contratos additive y feature flags; no deshacer trabajo UX ajeno.

**Gate:** rutas críticas coherentes y builds reproducibles; signing externo sigue pendiente.

## PHASE L — Automated tests + E2E

**Objetivo:** diez recorridos E2E y matriz de concurrencia/provider.

**Dependencias:** C–K, compose aislado.

**Archivos previstos:** `e2e/`, config Playwright/Maestro o elección ADR, fixtures/adapters sandbox, CI.

**Escenarios obligatorios:** registro cliente; registro profesional; onboarding; reserva; pago simulado; fee; cancelación; refund; payout; admin operation. Añadir mismo-slot, double-click, retries y duplicate webhook/refund/payout.

**Tests:** sin dinero real; fixtures únicas y cleanup limitado; artifact traces/screenshots sin PII.

**Riesgos:** flakes y dependencia de emuladores.

**Rollback:** E2E no cambia producción; fixtures sólo en DB marcada `TEST`.

**Gate:** 10/10 recorridos green local/CI y failure artifacts seguros.

## PHASE M — Performance + security validation

**Objetivo:** medir límites y cerrar OWASP threat model.

**Dependencias:** L y entorno staging-like aislado.

**Archivos previstos:** `performance/`, security checklist/tests, reports versionados sin datos sensibles.

**Cambios/tests:** carga API/DB/queue/webhook; p50/p95/p99/throughput/pool/resources; IDOR/BAC/SSRF/XSS/CSRF/injection/deserialization/upload/path traversal/CORS/brute force/spoofing; dependency/SBOM/secret history scan.

**Riesgos:** cargar servicios externos o gastar dinero.

**Rollback:** adapters fake y spend=0; nunca apuntar a producción.

**Gate:** límites documentados y P0/P1 sin findings abiertos.

## PHASE N — Store readiness

**Objetivo:** estructura técnica y checklist de stores, sin publicar.

**Dependencias:** K–M y cuentas/certificados externos para cierre manual.

**Archivos previstos:** `docs/release/{ANDROID_RELEASE,IOS_RELEASE,STORE_CHECKLIST}.md`, EAS configs, privacy/data declarations draft markers, asset directories.

**Tests:** Expo config, package/bundle/version uniqueness, permission inventory, Android AAB unsigned/internal cuando sea viable, iOS config/simulator build sólo en macOS CI futuro.

**Riesgos:** confundir estructura con aprobación/certificación.

**Rollback:** ningún submit; keystores/certs permanecen fuera de Git.

**Gate:** technical checklist completo; accounts/signing/legal assets siguen EXTERNAL_PENDING.

## PHASE O — Documentation

**Objetivo:** documentación canónica navegable, no duplicada ni ficticia.

**Archivos obligatorios:**

- `README.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `docs/architecture/PAYMENTS.md`
- `docs/security/SECURITY.md`
- `docs/privacy/PRIVACY_ARCHITECTURE.md`
- `docs/compliance/DAC7_READINESS.md`
- `docs/operations/DEPLOYMENT.md`
- `docs/operations/BACKUP_RESTORE.md`
- `docs/operations/INCIDENT_RESPONSE.md`
- `docs/release/ANDROID_RELEASE.md`
- `docs/release/IOS_RELEASE.md`
- `docs/release/STORE_CHECKLIST.md`
- `docs/testing/TEST_STRATEGY.md`
- `docs/production-readiness/PRODUCTION_READINESS.md`

**Tests:** link/path checks, env key coverage, command smoke, no secrets/legal approval claims.

**Rollback:** documentación sigue commits de implementación; no borrar registros históricos F1–F11.

**Gate:** todos los comandos y evidencias reproducibles por un operador nuevo.

## PHASE P — Final Production Readiness Audit

**Objetivo:** volver a auditar desde cero y emitir estado honesto.

**Archivo:** `docs/production-readiness/SPAIN_FINAL_READINESS_REPORT.md`.

**Checks:** BUILD, TESTS, SECURITY, DATABASE, MIGRATIONS, PAYMENTS, BACKUPS, RESTORE TEST, OBSERVABILITY, PRIVACY, LEGAL CONFIG, ANDROID BUILD, IOS BUILD, E2E.

**Estados permitidos:**

- `TECHNICALLY_READY`: sólo si todos los gates técnicos verificables pasan;
- `EXTERNAL_REQUIREMENTS_PENDING`: esperado mientras falten empresa/legal/fiscal/accounts/credentials/providers;
- `PRODUCTION_APPROVED`: siempre `NO` en esta ejecución.

**Rollback procedure:** application-first, disable flags/routes/workers, deploy prior immutable artifact, conservar schema/evidence; nunca schema rollback automático ni pérdida de ledger/audit/legal/tax evidence.

**Gate final:** matriz `Area | Status | Evidence | Remaining blocker` sin ningún PASS sin evidencia vigente.

### Security/database slice — Supabase production default deny

**Estado:** implementación, replay aislado, migraciones autorizadas y auditoría SQL live completados; staging, Data API, Security Advisor y monitorización pendientes.

**Dependencias:** fases C/D/J/M, backup/PITR, aprobación humana del lote exacto de migraciones y acceso seguro al proyecto `qwqvzlhxkolgzyaxacfe`.

**Archivos afectados:**

- `backend/prisma/migrations/202609110003_supabase_current_schema_default_deny/migration.sql`
- `backend/prisma/ci-supabase-roles.sql`
- `backend/scripts/audit-supabase-default-deny.js`
- `backend/test/security/supabase-rls.test.js`
- `backend/test/integration/supabase-rls-postgres.test.js`
- `docs/security/2026-09-01-supabase-rls-hardening.md`
- `docs/security/SUPABASE_PRODUCTION_HARDENING.md`
- `docs/DATABASE_MIGRATIONS.md`

**Migración:** transacción idempotente con `lock_timeout`/`statement_timeout`; revoca schema/tables-views/sequences/routines actuales y defaults del role creador; incluye `service_role`; fuerza RLS en todas las tablas actuales y elimina policies incompatibles con el contrato backend-only. No toca `auth`, `storage` ni schemas gestionados por Supabase.

**Tests requeridos:** Prisma format/validate/generate, sintaxis, unit security, replay completo en PostgreSQL aislado con roles Supabase emulados, integración de grants/RLS/default routine privilege, rehearsal staging y auditor live read-only con guardia de project ref.

**Riesgos:** locks en tablas, lote Prisma con migraciones pendientes no relacionadas, role backend sin `BYPASSRLS`, objetos/grants heredados creados fuera de Git y consumidores directos en repositorios no inventariados.

**Rollback:** fallo de la transacción revierte la migración; tras éxito se prefiere roll-forward. No restaurar grants amplios ni desactivar RLS. Un consumidor directo desconocido se migra al backend o requiere una excepción separada, mínima, expirable y aprobada por seguridad.

**Gate:** el 2026-09-11 se obtuvo `PASS_SQL_CONTROLS_MANUAL_PLATFORM_CHECKS_REMAIN` con 126 tablas y cero violaciones. Aún exige Data API desactivada, Security Advisor rerun sin warning objetivo, consumidores externos inventariados, staging y backend smoke green. Hasta reunir esa evidencia: `LIVE SECURITY FIX: INCOMPLETE`.

## Convención de commits lógicos

Si el entorno y el usuario permiten commits, usar commits separados por capacidad (`domain`, `security`, `professional-compliance`, `billing`, `privacy-legal`, `admin`, `infra`, `release`, `mobile-web`, `tests`, `docs`). En este worktree no se hará commit automático mientras existan cambios ajenos sin una separación inequívoca.

## No-go permanente de esta ejecución

```text
DEPLOY_PRODUCTION=false
PUBLISH_APP_STORE=false
PUBLISH_GOOGLE_PLAY=false
USE_REAL_MONEY=false
FILE_TAX_REPORT=false
CLAIM_LEGAL_APPROVAL=false
ACTIVATE_MARKET=false
PRODUCTION_APPROVED=false
```
