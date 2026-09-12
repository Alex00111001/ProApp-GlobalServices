# HOME SERVICES — SPAIN PRODUCTION READINESS GAP ANALYSIS

- Fecha de corte: 2026-09-12
- Repositorio: `ProApp-GlobalServices`
- Rama auditada: `feature/production-control-plane-phase-11`
- Commit base: `a62fa4f1`
- Objetivo: `PRODUCTION-READY BUT NOT PRODUCTION-DEPLOYED`
- Producción, Apple App Store y Google Play: **NO AUTORIZADOS**

## Resumen ejecutivo

El repositorio no es un MVP: contiene cinco productos, un backend modular sobre Express/Prisma/PostgreSQL, RBAC administrativo persistente, outbox durable, observabilidad estructurada, un ledger de doble entrada, flujos de refunds/payouts/disputas, y una base multipaís versionada para España, Brasil y Chile. Las 26 migraciones están aplicadas en la base de desarrollo configurada y el baseline auditado es compatible.

El sistema **no está técnicamente listo para producción** en este corte. Las proyecciones sensibles, idempotencia de reservas, exclusión de agenda, transiciones CAS y hardening SQL de Supabase ya tienen corrección y evidencia automatizada. Permanecen como bloqueadores P0:

1. confirmar manualmente en Supabase Dashboard que Data API está deshabilitada y conservar una ejecución limpia de Security Advisor;
2. no existe la suite E2E exigida para los diez recorridos críticos;
3. no existe estrategia operativa implementada ni prueba de restauración de backups;
4. la fase de dominio financiero aún no cierra aceptación refund/legal, efectivo gobernado ni retirada expand/contract de defaults legacy.

También faltan el onboarding profesional completo, DAC7/tax reporting, el motor de documentos y aceptaciones legales versionadas, workflows RGPD de acceso/exportación/supresión, una abstracción de proveedores de pago, object storage privado, contenedores, CD y release engineering móvil verificable. Los mercados se mantienen deshabilitados y los flags financieros de ejecución permanecen apagados por defecto, lo cual es la postura correcta durante esta preparación.

## Alcance e inventario observado

| Superficie | Tecnología/estado observado | Evidencia principal |
|---|---|---|
| Backend | Node.js 24+, Express 5/CommonJS, Zod, Prisma 7, PostgreSQL/Supabase | `backend/src/app.js`, `backend/prisma/schema.prisma` |
| Admin Web | React 19, Vite, TypeScript, sesión administrativa separada, RBAC por permisos | `admin-web/src`, `docs/ADMIN_WEB.md` |
| Public Web | Next.js 16 SSR, contenido gobernado por mercado | `public-web/app`, `public-web/lib/content-api.ts` |
| App cliente | Expo/React Native, registro dinámico por mercado, reserva y pago Stripe | `mobile-client/src`, `mobile-client/app.config.js` |
| App profesional | Expo/React Native, registro por mercado, áreas y gestión básica de reservas | `mobile-professional/src`, `mobile-professional/app.json` |
| Base de datos | 30 migraciones aplicadas; RLS/default deny live verificado sobre 126 tablas; 116 modelos aproximados | `backend/prisma/migrations`, `docs/DATABASE_MIGRATIONS.md` |
| CI | Build, unit/contract, auditoría de dependencias, migraciones, PostgreSQL integration y gitleaks | `.github/workflows/ci.yml` |
| Infra/CD | Sin Dockerfile, compose, IaC ni pipeline de deployment | inventario completo del repositorio |
| Documentación | Documentación histórica F1–F11 extensa; faltan los artefactos estándar requeridos para España | `docs/` |

Se preservan sin modificar 21 archivos móviles ya editados por el usuario y dos archivos no versionados preexistentes. Ninguna conclusión de esta auditoría atribuye esos cambios a esta iniciativa.

## Matriz obligatoria

| Component | Current State | Target State | Status | Severity | Dependencies | Required Action |
|---|---|---|---|---|---|---|
| 1. Principio arquitectónico final/global | Base F1–F10 avanzada y extensible; subsisten controladores legacy y configuración global de precios/legal/pagos | Arquitectura final multipaís, horizontal y sin reglas nacionales dispersas | PARCIAL | P1 CRITICAL | ADR 0004, contratos F3/F7/F8.5 | Migrar flujos legacy a servicios/políticas autoritativas sin reemplazar componentes funcionales |
| 2. Preservación y auditoría previa | Inventario, arquitectura, apps, DB, auth, pagos, infra, CI, tests, observabilidad, docs, env y código parcial inspeccionados; worktree sucio preservado | Evidencia repetible de `AUDIT → GAP → PLAN` antes de código | HECHO | P3 IMPROVEMENT | Git y documentos de gobierno | Mantener trazabilidad y no sobrescribir cambios ajenos |
| 3. Separación marketplace | `ClientProfile`, plataforma, `ProfessionalProfile`, Booking y economics están separados; Booking ya encapsula creación/idempotencia, política comercial y transiciones CAS, pero otros controladores mezclan transporte, dominio y proveedor | Agregados y servicios con límites explícitos entre cliente, plataforma y profesional independiente | PARCIAL | P1 CRITICAL | Booking, Professional, Billing | Completar extracción de servicios de aplicación y profesionalización |
| 4. Dominio multipaís | `Country`, `Market`, `AdministrativeDivision`, políticas versionadas, ES/BR/CL, identidad cifrada y service areas existen; nuevas reservas con Markets activo resuelven moneda y pricing de políticas versionadas y fallan cerradas, pero modelos legacy conservan defaults `MX/MXN` | Country/Market/policy como autoridad única; currency/locale/identity/tax/payment configurables | PARCIAL | P1 CRITICAL | F8.5, Billing, migraciones expand/contract | Retirar defaults incompatibles de forma no destructiva y cubrir tax/payment policy completo |
| 5. Identidad y autorización | Passwords bcrypt; JWT regular de 7 días sin sesión/refresh/revocación; admin session robusta; sin recuperación/verificación/bloqueo; anti-enumeration incompleto; P0 de `passwordHash` en respuestas | CLIENT/PROFESSIONAL + roles SUPPORT/OPERATIONS/FINANCE/SUPERADMIN con least privilege, sesiones revocables y endpoints seguros | PARCIAL | P0 BLOCKER | User/session models, RBAC, mobile token storage | Eliminar campos sensibles de todos los contratos, añadir rate limits auth, anti-enumeration, recuperación/verificación y sesiones revocables |
| 6. Professional onboarding | Registro dinámico, identidad protegida, domicilio y service areas; perfil genérico y estados legacy; aprobación no exige tax/payment/verification configurados | Subdominios Profile/Identity/Tax/Verification/PaymentAccount/Area/Availability y elegibilidad jurisdiccional | PARCIAL | P1 CRITICAL | MarketPolicy, identity, payment provider, legal/tax review | Crear aggregate/workflow profesional extensible y guard central de elegibilidad |
| 7. DAC7 / tax readiness | No existen `TaxReportingService`, perfiles fiscales ni exportación DAC7 | Captura mínima configurable, períodos/reporting auditable y adapters como `SpainDAC7Adapter`, sin presentación automática | PENDIENTE | P1 CRITICAL | Professional onboarding, ledger, privacy, revisión fiscal | Diseñar esquema, puertos/adapters, export seguro y pruebas; mantener reglas reportables configurables |
| 8. Ledger financiero | Ledger balanceado en minor units/Decimal, idempotency y reconciliación; flags off; no trigger append-only para ledger y hay proyecciones legacy | Toda operación monetaria trazable, inmutable, reconciliable y activa sólo tras gates | PARCIAL | P1 CRITICAL | F3 flags, provider sandbox, DB constraints | Añadir integridad append-only, validar idempotency payload y eliminar conversiones `Number` de dinero |
| 9. Abstracción de payment provider | Dominio/controlador importa Stripe directamente; webhooks firmados e inbox durable sí existen | Puerto `PaymentProvider` y adapters cerrados para create/authorize/capture/refund/account/verify/payout/status/webhook | PENDIENTE | P1 CRITICAL | Billing, secrets, Connect decision | Introducir contrato neutral conservando `StripePaymentProvider` como adapter |
| 10. Cancelaciones y reembolsos | `RefundPolicy` versionada, decisión/four-eyes y journals existen; Booking fija `PricingPolicy` activa y snapshot verificable cuando Markets está activo, pero aún no captura aceptación de refund/legal policy ni presenta la decisión previa | Cancellation/Refund/Fee policies versionadas, calculables, aceptadas y auditadas por booking | PARCIAL | P1 CRITICAL | Market policy, legal acceptance | Persistir aceptación real y exponer preview/decision segura sin inventar texto legal |
| 11. Legal Acceptance Engine | `User` guarda timestamps/version strings y Booking tiene aceptación parcial; texto móvil estático/provisional | `LegalDocument`, `LegalDocumentVersion`, `LegalAcceptance` por tipo/locale/context/evidencia | PENDIENTE | P1 CRITICAL | Empresa/textos legales, MarketPolicy, privacy | Implementar motor y servir contenido versionado; bloquear activación de documentos no revisados |
| 12. RGPD/privacy by design | Consentimiento de marketing append-only y pseudonimización presentes; no SAR/export/delete workflows ni matriz DELETE/ANONYMIZE/RETAIN | Requests de acceso/export/supresión, retención configurable por propósito y ejecución auditable | PARCIAL | P1 CRITICAL | Legal/tax retention, object storage, jobs | Implementar workflows y adapters de export/anonymization sin inventar plazos |
| 13. AuditLog | AuditLog central con actor/recurso/correlación y redacción; no es inmutable en DB y un worker lo borra por retención | Append-oriented, tamper-resistant, sin secretos, con retención legal gobernada | PARCIAL | P1 CRITICAL | DB migration, privacy retention | Añadir protección de mutación y una vía de retención explícitamente autorizada/auditada |
| 14. Superadmin | Admin Web real con users/professionals/bookings/operations/support/growth/privacy/markets/audit; revenue/analytics son placeholders y faltan categorías/servicios/flags/config completa | Único panel web RBAC con todos los módulos operativos sensibles y confirmaciones | PARCIAL | P1 CRITICAL | Admin API, audit, feature flags | Completar módulos faltantes y retirar endpoints admin legacy cuando exista compatibilidad |
| 15. Observabilidad | Logs JSON/redacción, IDs, OTEL, Prometheus protegido, `/health`, `/health/live`, `/health/ready`, incidentes y alert outbox | Métricas/alertas productivas desacopladas y operadas con SLOs | PARCIAL | P2 IMPORTANT | Proveedor OTLP/alertas, runbooks | Añadir señales explícitas de webhook/payment failure y validar routing en staging |
| 16. Error management | 5xx redactado y correlacionado; controladores legacy devuelven contratos heterogéneos y no hay taxonomía completa | Errores validation/authentication/authorization/business/provider/infrastructure/unexpected estables | PARCIAL | P2 IMPORTANT | API compatibility, observability | Centralizar errores legacy sin romper contratos móviles |
| 17. Security hardening | Helmet/CORS/body limits/RLS/RBAC/redacción; catch-all Supabase desplegado y auditor live PASS sin violaciones; Data API/Advisor, uploads y revisión OWASP completa pendientes | OWASP review cerrada con pruebas de BAC/IDOR/mass assignment/upload/webhook/brute force y evidencia live default-deny | PARCIAL | P0 BLOCKER | Identity, storage, API contracts, controles Dashboard | Desactivar Data API, ejecutar Advisor y cerrar el resto del threat model |
| 18. Secrets | `.env` reales ignorados; búsqueda de patrones en tracked tree sin hallazgos; gitleaks CI existe; binario local ausente y GitHub CLI no pudo verificar último run | Cero secretos versionados, scan de historia verificable y secret manager por entorno | PARCIAL | P1 CRITICAL | CI remota, proveedor secret manager | Renovar acceso de verificación CI, ejecutar scan histórico y documentar rotación/ownership |
| 19. Base de datos | Prisma válido; 30 migraciones live actuales; replay limpio y 28/28 integración secuencial; auditoría live PASS sobre 126 tablas | Constraints/índices/FK/concurrencia/timezone/migraciones safe-deploy verificadas | PARCIAL | P0 BLOCKER | Staging, backup/restore y operación productiva | Completar staging, evidencia PITR/restore, Data API/Advisor y smoke/monitorización |
| 20. Async jobs/queues | Outbox PostgreSQL con leases/retry/backoff/dead-letter y workers de observabilidad/content/automation/AI; no workers de export/reconciliation/notifications genéricas | Jobs críticos separados, idempotentes y observables | PARCIAL | P2 IMPORTANT | Notification, privacy export, reconciliation | Registrar handlers cerrados y workers requeridos con DLQ y panel operacional |
| 21. Notifications | Tabla Notification y acción automation `ENQUEUE_NOTIFICATION`; negocio escribe DB directamente; sin puerto/canales/providers | `NotificationService` multicanal con outbox y adapters email/push/SMS | PENDIENTE | P2 IMPORTANT | Outbox, provider decisions, consent | Crear puerto, templates/versiones y adapter in-app; proveedores externos quedan bloqueados |
| 22. File/object storage | Cloudinary directo, URLs permanentes, MIME declarado sin magic-byte/AV; documentos privados no tienen signed access ni provider abstraction | Object storage privado con authorization, validation, size, lifecycle y URLs efímeras | PENDIENTE | P1 CRITICAL | Storage provider, malware scanner decision, privacy | Crear puerto privado, separar assets públicos/evidencia privada y migración no destructiva |
| 23. Environments | `NODE_ENV` y env validation; desarrollo configurado; no perfiles DEV/TEST/STAGING/PRODUCTION versionados ni topología aislada | Configuración, DB, secrets y providers independientes; staging production-like sin PII real | PARCIAL | P1 CRITICAL | Hosting/secret manager/domain decisions | Añadir matrices/config schemas por entorno y staging runbook |
| 24. Containerization | No existe Dockerfile ni compose | Builds multi-stage, non-root, healthcheck y runtime pequeño; compose sólo dev/test | PENDIENTE | P1 CRITICAL | Runtime topology, PostgreSQL test | Añadir imágenes reproducibles para API/workers/webs y compose local de test |
| 25. CI | Workflow pinneado ejecuta builds, unit/contract, audits, migration replay/integration y gitleaks; sin formatting gate explícito, E2E ni build profesional nativo | Todos los gates requeridos por commit/PR y bloqueo de release | PARCIAL | P1 CRITICAL | E2E, mobile release, Docker | Ampliar CI con format, release builds, E2E, migration safety y artefactos/evidence |
| 26. CD | Sólo CI; F11 control plane es ADR/plan propuesto sin implementación; no adapter de deployment | DEV→TEST→STAGING→PRODUCTION, approval manual y rollback | PENDIENTE | P1 CRITICAL | Hosting/GitOps y MFA/secret manager externos | Preparar workflow/adapters tras decisiones; mantener producción sin destino ejecutable |
| 27. Backups/disaster recovery | Sin configuración, runbook requerido ni restore test | Backups automáticos, retención configurable, object recovery y restore demostrado | PENDIENTE | P0 BLOCKER | Proveedor DB/storage, RPO/RTO y owner | Crear `BACKUP_RESTORE.md`, scripts seguros y ejecutar restore sólo en entorno aislado autorizado |
| 28. Web | Public SSR y admin responsive con builds green; public API cae silenciosamente a localhost en producción; faltan páginas legales/cookies públicas y accesibilidad automatizada | Web production-configured, accesible, SEO/legal/consent completa | PARCIAL | P1 CRITICAL | Legal engine, domains, analytics consent | Fail closed sin API prod, añadir enlaces/páginas y pruebas a11y/headers |
| 29. Client App | Register/search/professional/service/book/payment/status/cancel presentes; sin verify, review funcional, refund/support/dispute end-to-end | Recorrido cliente completo y coherente con backend | PARCIAL | P1 CRITICAL | Auth verification, review repair, support/refund APIs | Completar estados y E2E; no declarar textos jurídicos definitivos |
| 30. Professional App | Register/identity/geography/areas/list/confirm/cancel/complete; sin tax/payment onboarding, services/availability editor, accept/reject explícito ni payout status | Onboarding y operación profesional completos | PARCIAL | P1 CRITICAL | Professional aggregate, payment accounts, app release | Completar módulos y añadir tests automatizados |
| 31. Geo/service areas | País/divisiones oficiales/Market/service area configurables ES-BR-CL; markets seeded disabled; sin hardcode de Murcia encontrado | Territorios activables por configuración/policy | HECHO | P3 IMPROVEMENT | Market activation externa | Mantener manifests/versiones y no activar mercado durante esta ejecución |
| 32. Feature flags | Flags DB server-side con targeting fail-closed y flags env de ejecución financiera/AI/content | Operación simple configurable sin deploy y autoridades independientes | HECHO | P3 IMPROVEMENT | Admin configuration UI | Completar UI/ownership/expiry y conservar fail-closed |
| 33. iOS readiness | Bundle IDs y EAS cliente básicos; sin privacy manifest, permission minimization, universal links, release signing evidence; profesional sin assets/EAS | Build archiveable, version/build, declarations, links y signing structure sin certificados falsos | PARCIAL | P1 CRITICAL | Apple account/certs, legal privacy answers | Corregir configuración técnica, generar build unsigned/simulator y documentar intervención humana |
| 34. Android readiness | Package IDs básicos; permisos cliente excesivos/legacy; profesional sin assets/EAS; sin signing config/evidence | AAB reproducible, versioning, permisos mínimos, app links y signing externo | PARCIAL | P1 CRITICAL | Play account/keystore, privacy answers | Minimizar permisos, preparar EAS/Gradle signing refs y verificar build sin publicar |
| 35. Store assets | Cliente tiene icon/adaptive icon; profesional no tiene assets; no checklist/store copy/screenshots/reviewer strategy | Estructura/checklist completa sin inventar datos empresariales | PENDIENTE | P2 IMPORTANT | Branding, legal URLs, accounts | Crear `STORE_CHECKLIST.md` y placeholders humanos explícitos |
| 36. Test strategy | 218 backend unit/contract, 15 admin, 4 public, 4 client; 0 profesional; integración PostgreSQL en CI; 0 E2E de negocio | Pirámide con unit/integration/contract y diez E2E obligatorios | PARCIAL | P0 BLOCKER | Stable APIs, isolated stack, test users | Reparar legacy y añadir E2E reales para los diez flujos |
| 37. Payment testing | Tests amplios de ledger, duplicate webhook, signature boundary, refunds, payouts, disputes y retries; no E2E sandbox actual ni provider contract neutral | Matriz completa sólo mock/sandbox, sin dinero real | PARCIAL | P1 CRITICAL | PaymentProvider, isolated DB, Stripe sandbox | Añadir contract adapter suite y E2E sandbox controlado |
| 38. Concurrency/idempotency | Webhook/refund/payout/ledger/outbox y Booking tienen idempotencia/locks/CAS probados; cash payment continúa provisional y sin liquidación gobernada | Slot, doble pago, retry, payout/refund/webhook duplicado con invariantes explícitas | PARCIAL | P0 BLOCKER | Cash settlement, E2E | Implementar idempotencia y evidencia de liquidación para efectivo; conservar bloqueo de completion mientras esté `PENDING` |
| 39. Performance | Métricas runtime y políticas AI registran p95; no carga/soak de API/DB/apps ni baseline | Resultados de latencia, throughput, queries/pool/resources con límites documentados | PENDIENTE | P1 CRITICAL | Staging-like stack, expected traffic | Añadir k6/artillery y query instrumentation; medir antes de optimizar |
| 40. Dependency audit | Seis `npm audit --audit-level=high` pasan con 0 vulnerabilidades; lockfiles presentes; no evaluación completa de abandono/duplicidad | Auditoría de seguridad, mantenimiento, duplicidad y compatibilidad justificada | PARCIAL | P2 IMPORTANT | CI/SBOM | Generar inventario/SBOM y revisar paquetes directos sin major upgrades indiscriminados |
| 41. Documentation | Documentos F1–F11 y runbooks parciales; faltan README y los 13 documentos estándar solicitados | Estructura architecture/security/privacy/operations/release/compliance/testing completa | PARCIAL | P1 CRITICAL | Implementaciones anteriores | Crear documentación canónica y evitar duplicar autoridad histórica |
| 42. External blockers | Sociedad/NIF/banco/legal-fiscal/accounts/certs/domains/providers no están acreditados | Bloqueos visibles y nunca simulados | BLOQUEADO_EXTERNAMENTE | P0 BLOCKER | Intervención humana/terceros | Mantener lista, owner y evidencia requerida; no activar producción |
| 43. Production configuration | Env validation fuerte para runtime actual; faltan placeholders empresariales, provider-neutral y URLs/API canónicas | Config schema documentado, sin credenciales futuras hardcoded | PARCIAL | P1 CRITICAL | Legal entity, providers, environments | Ampliar `.env.example` y validación por entorno/feature |
| 44. Release gates | CI parcial y readiness F10; no checklist agregado BUILD…E2E ni estados TECHNICALLY_READY/EXTERNAL_PENDING/APPROVED | Gate auditable que impida declaración falsa y nunca auto-apruebe producción | PENDIENTE | P0 BLOCKER | Todos los workstreams | Crear manifest/check script documental con evidencia vigente |
| 45. Definition of Done | Arquitectura base y checks parciales; múltiples P0/P1 abiertos | Todas las áreas PASS sólo con evidencia y externos PENDING | PENDIENTE | P0 BLOCKER | Fases C–P | No emitir `TECHNICALLY_READY` hasta cerrar gates |
| 46. Orden de ejecución | Auditoría completada antes de código; fases A–P adoptadas | Cada fase valida la anterior | HECHO | P3 IMPROVEMENT | Plan de implementación | Mantener checkpoints y rollback por fase |
| 47. Artefactos iniciales obligatorios | Gap analysis y plan de implementación existen y precedieron los cambios de código | Gap + plan completos antes de implementar | HECHO | P3 IMPROVEMENT | Diagnóstico actual | Mantener ambos actualizados con evidencia y riesgos |
| 48. Reglas de implementación | Fases C/D en progreso con cambios mínimos, pruebas unitarias/integración aislada, documentación y registro transparente de fallos/reintentos | Cambio mínimo correcto + tests + docs + evidencia por bloque | PARCIAL | P3 IMPROVEMENT | Plan aprobado por orden requerido | Mantener evidencia y gates antes de avanzar de fase |
| 49. Informe final | No existe | `SPAIN_FINAL_READINESS_REPORT.md` con matriz/evidencia/risks/blockers/procedures | PENDIENTE | P0 BLOCKER | Cierre de todas las fases | Generar sólo al final y no marcar PASS sin evidencia |
| 50. Restricciones finales | No se desplegó, publicó, movió dinero ni presentó fiscalidad; sólo lectura/checks locales y DB read-only | Mantener `Production deployment: NOT AUTHORIZED` | HECHO | P0 BLOCKER | Autorización humana futura | Conservar bloqueo técnico/documental durante toda la ejecución |

## Hallazgos P0/P1 confirmados en código

| ID | Riesgo | Evidencia | Impacto |
|---|---|---|---|
| SEC-001 | Objetos `User` completos en respuestas de booking/payment history | `backend/src/controllers/booking.controller.js`, `backend/src/controllers/payment.controller.js` usan `include: { user: true }` y serializan el resultado | Exposición de `passwordHash`, estado interno y PII a clientes/profesionales autenticados |
| SEC-002 | Creación arbitraria de notificaciones | `POST /api/notifications` sólo usa `authenticate`; el controlador confía en `req.body.userId` | Broken access control/mass assignment y abuso entre usuarios |
| BOOK-001 | Doble reserva y retries | Corregido con idempotency key/digest, advisory lock, detección de intervalo, constraint/índice y pruebas de replay/concurrencia | Riesgo residual: validar zonas horarias/política de disponibilidad por mercado antes de activación |
| BOOK-002 | Transiciones de reserva | Corregido con transacción y CAS `PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED`, rechazo profesional explícito a proyección `CANCELLED`, ownership, notificación/outbox/audit e idempotencia de estado objetivo | Riesgo residual: E2E móvil completo |
| REVIEW-001 | Review controller no coincide con Prisma | Usa campos/modelos inexistentes (`booking.userId`, `Review.userId`, `prisma.professional`, etc.) | Review flow falla en runtime; suite actual no lo detecta |
| PROF-001 | Aprobación insuficiente | Approval cambia un status legacy sin comprobar identidad/tax/payment requirements de MarketPolicy | Profesional puede quedar elegible sin verificaciones obligatorias |
| PAY-001 | Acoplamiento y precisión | Controller importa Stripe; cash usa `Number(Decimal)` y currency global | Riesgo de drift monetario/proveedor y arquitectura no extensible |
| PAY-002 | Booking completa sin pago garantizado | Corregido: completion exige `IN_PROGRESS` y `Payment.status=COMPLETED` antes de cualquier earning/payout/stat/notification/audit/outbox | Efectivo `PENDING` queda bloqueado hasta implementar liquidación gobernada |
| FILE-001 | Evidencia privada en storage público | Cloudinary directo, `secure_url` persistente, MIME sólo declarado, sin signed access | Exposición de documentos, contenido malicioso y falta de lifecycle privado |
| AUTH-001 | Sesión cliente no revocable | JWT de 7 días sin session/jti/refresh/revocation; password change no revoca | Token robado sigue vigente; logout sólo local |
| LEGAL-001 | Aceptación no demuestra documento | Booleanos/timestamps + version string estática en móviles; textos provisionales embebidos | No se puede probar qué documento/locale/context se aceptó |
| WEB-001 | Fallback productivo a localhost | `public-web/proxy.ts` y `public-web/lib/content-api.ts` | Build productivo puede apuntar a un API inexistente sin fallar |
| SUPA-001 | Endurecimiento no aplicado/verificado en producción | `202609110003_supabase_current_schema_default_deny`, auditor live y runbook están en Git; no existe evidencia del proyecto `qwqvzlhxkolgzyaxacfe` | El repositorio está preparado, pero el warning no puede darse por cerrado en la plataforma |

## Evidencia de verificación del corte

| Check | Resultado | Limitación |
|---|---|---|
| `npm run verify` | PASS: backend 218/218; admin 15/15; public web 4/4; cliente 4/4; profesional typecheck PASS | No incluye E2E ni tests de app profesional |
| Prisma `format --check`, `validate`, `generate` | PASS | No demuestra replay desde cero por sí solo |
| `prisma migrate status` | PASS: 26 migraciones, base configurada up to date | Lectura sobre entorno de desarrollo configurado, no producción |
| `npm run db:audit-baseline` | PASS sin blockers | No se ejecutó integration suite contra esa DB para evitar mutaciones durante diagnóstico |
| Seis `npm audit --audit-level=high` | PASS: 0 high/critical/moderate/low reportadas | Snapshot del registro npm a 2026-09-11 |
| Tracked-tree secret pattern scan | Sin coincidencias de secretos reales | Gitleaks local no está instalado |
| Full-history gitleaks | No verificado localmente; workflow CI existe | `gh` devolvió 401 y no permitió acreditar el último run remoto |
| Docker/PostgreSQL local | PostgreSQL 17 aislado disponible durante la verificación | Replay limpio de 30 migraciones y pruebas transaccionales completados |
| Supabase default-deny | Build/sintaxis 189 archivos; backend 246/246; seguridad focalizada 14/14; integración 28/28; live audit PASS | Dashboard Data API, Security Advisor, staging y monitorización pendientes |
| Estado Git | Dirty preexistente preservado | Los builds no añadieron cambios trackeados |

## Bloqueos externos explícitos

Todos permanecen `BLOQUEADO_EXTERNAMENTE` hasta recibir evidencia humana válida:

- constitución y razón social definitiva;
- NIF empresarial, domicilio y cuenta bancaria;
- asesoramiento/revisión legal y fiscal para España y futuros mercados;
- textos definitivos de Terms, Professional Terms, Privacy, Cookies, Cancellation y Refund;
- determinación DAC7 y reglas/reporting aplicables;
- Apple Developer Account, certificados y perfiles;
- Google Play Console y keystore de release;
- credenciales production del proveedor de pagos y decisión Connect/KYC;
- proveedor/arquitectura de hosting, GitOps, secret manager y step-up MFA;
- dominios, DNS/CDN/TLS y URLs públicas definitivas;
- proveedores de email, push/SMS, object storage/antimalware y monitoring;
- owners de on-call, RPO/RTO, retención, canary y SLOs.
- operador autorizado para desactivar la Data API del proyecto Supabase `qwqvzlhxkolgzyaxacfe` y retener evidencia del Security Advisor; la migración SQL ya fue autorizada y aplicada.

## Decisión del diagnóstico

```text
TECHNICALLY_READY: NO
EXTERNAL_REQUIREMENTS_PENDING: YES
PRODUCTION_APPROVED: NO
PRODUCTION_DEPLOYMENT: NOT AUTHORIZED
MARKETS ACTIVATED BY THIS AUDIT: NO
REAL MONEY USED: NO
```

La siguiente modificación permitida es exclusivamente `SPAIN_IMPLEMENTATION_PLAN.md`. La implementación comienza después de que ese plan exista y preserve las dependencias y rollback considerations aquí identificadas.
