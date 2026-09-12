# HomeServices — Auditoría sistemática integral y roadmap de preparación para producción

- Fecha de corte: 2026-09-12
- Rama: `feature/production-control-plane-phase-11`
- Commit auditado: `dc338f296ca52097aac1e557f8bfa4522b7fda7c`
- Estado Git al iniciar: limpio; rama un commit por delante de `origin`
- Objetivo: `PRODUCTION-READY`, sin desplegar ni activar producción
- Decisión actual: **NO-GO**
- Alcance de esta entrega: auditoría, diagnóstico y roadmap; no modifica runtime, datos ni configuración externa

## 1. Clasificación y autoridad

```text
Phase: transversal F1-F11 + nueva capacidad F8.6 de elegibilidad territorial
Domain: Marketplace / Markets / Identity / Billing / Security / Release / Frontends
Risk: CRITICAL
Capability tier / model: DEEP / Codex Sol
Skills used: repo-auditor, architecture-guardian, legal-compliance, security,
             testing, release, payments, backend-fastapi, database-prisma, frontend
Escalation triggers: dinero, identidad, privacidad, cambios de Market, proveedor GeoIP,
                     migraciones, producción, tiendas, secrets, backups y acceso externo
Required verification: unit/contract/integration/E2E/security, migraciones limpias,
                       restore rehearsal, staging, builds móviles, scans y CI remota
Acceptance gate: ningún P0/P1 abierto y toda evidencia externa vigente
Rollback / feature flag: application-first, por capacidad/Market/audience; sin pérdida de evidencia
```

Orden de autoridad aplicado:

`Arquitectura -> ADR/especificaciones -> contratos -> skills -> agentes/modelos -> código`

La georrestricción propuesta se somete al `COUNTRY/MARKET VARIATION GATE` de
`docs/MARKETS_IDENTITY_GEOGRAPHY.md`. Requiere un ADR porque introduce una nueva frontera de
seguridad, un proveedor o fuente de confianza y una regla de compatibilidad pública.

## 2. Resumen ejecutivo

HomeServices ya es una plataforma considerable, no un prototipo: existen cinco productos,
Express/Prisma/PostgreSQL, RBAC administrativo, sesiones revocables en backend, outbox, auditoría,
observabilidad, mercados versionados, identidad protegida, ledger, refunds, payouts, disputes,
experimentos, contenido y operaciones de IA gobernadas. La verificación local completa está verde.

Sin embargo, **la aplicación no está lista para producción**. Los bloqueadores principales son:

1. El flujo de efectivo puede sobrescribir evidencia de pago y forzar cualquier reserva propia a
   `CONFIRMED` sin respetar la máquina de estados.
2. No existe el bloqueo automático por país solicitado. Ambas apps permiten elegir Market y el
   backend no aplica una decisión de país de red a las rutas de usuario.
3. No hay E2E de negocio, restore rehearsal, staging production-like, contenedores, CD ni runtime
   F11 implementado.
4. La cobertura backend medida es 57,64 % de líneas y los controladores de booking, payment, auth,
   uploads y notificaciones apenas se ejecutan en la suite unitaria.
5. Persisten superficies de upload privado inseguras, errores 5xx con detalles internos, paginación
   legacy sin límites, moneda `€` en clientes y configuración web que cae a localhost.
6. Falta cerrar onboarding profesional, legal acceptance, privacidad RGPD operativa, fiscalidad,
   payment-provider abstraction, inmutabilidad física de ledger/audit y publicación móvil.
7. Los requisitos externos —legal/fiscal, empresa, proveedores, dominios, stores, secrets, backups,
   SLO/on-call y aprobación de producción— no tienen evidencia de cierre.

El camino recomendado es conservar la arquitectura y ejecutar correcciones pequeñas, aditivas y
reversibles. La nueva georrestricción debe ser un módulo F8.6 independiente y no una condición
hardcodeada en las pantallas.

## 3. Alcance e inventario observado

| Superficie | Evidencia observada | Estado resumido |
|---|---|---|
| Repositorio | 460 archivos versionados fuera de dependencias/builds | Estructura clara; falta README canónico |
| Backend | 242 archivos; 21 módulos; Express 5/CommonJS | Avanzado, con deuda importante en controladores legacy |
| Datos | Prisma 7; 116 modelos; 30 migraciones | Baseline compatible; producción aún no tiene todos los gates operativos |
| Admin Web | React/Vite; 43 archivos | Funcional en varias áreas; módulos Revenue/Analytics aún informativos |
| Public Web | Next.js SSR; 15 archivos | Build verde; fallback productivo inseguro |
| Cliente móvil | Expo 57/RN 0.86; 73 archivos | Flujos principales parciales; cuatro tests; permisos excesivos |
| Profesional móvil | Expo 57/RN 0.86; 23 archivos | Operación básica; sin tests automatizados ni release setup completo |
| CI | GitHub Actions con quality/PostgreSQL/secrets | Buena base; no cubre E2E, restore, containers ni el SHA local actual |
| CD/infra | Sin Dockerfile, Compose, IaC o adapter de despliegue | Pendiente |
| Documentación | 57 archivos, ADR 0001-0007 y releases F1-F10 | Amplia, pero con drift y sin documentación operativa final |

Limitaciones honestas de esta auditoría:

- No se desplegó ni se activó producción o ningún Market.
- No se ejecutó la suite de integración contra una base no acreditada como efímera en esta sesión.
- No se verificaron Dashboard de Supabase, Security Advisor, Apple/Google, hosting, DNS, Stripe live,
  email, monitoring, backups ni secretos externos.
- No se realizaron pruebas en hardware físico ni build iOS.
- El commit actual está un commit por delante del remoto; no existe CI remota para este SHA.

## 4. Controles confirmados

| Control | Evidencia de esta auditoría | Resultado |
|---|---|---|
| Árbol Git | `git status --short` | Limpio |
| Verificación raíz | `npm run verify` | PASS |
| Backend | build/sintaxis + unit/contract | 246/246 PASS; 191 JS válidos |
| Admin Web | lint + test + build | 15/15 PASS; build PASS |
| Public Web | typecheck + test + build SSR | 4/4 PASS; build PASS |
| Cliente | typecheck + Jest | 4/4 PASS |
| Profesional | typecheck | PASS; no tests de comportamiento |
| Geografía oficial | manifests ES/BR/CL | 8.203 / 5.598 / 418 filas válidas |
| Prisma | generate y `format --check` | PASS |
| Baseline DB configurada | `npm run db:audit-baseline` read-only | PASS; sin blockers |
| Dependencias | seis `npm audit --audit-level=high` | 0 vulnerabilidades en las seis superficies |
| Cobertura backend | Node test coverage | 57,64 % líneas; 67,68 % branches; 47,44 % funciones |
| Whitespace/worktree | `git diff --check` | PASS |

También están confirmados: configuración de producción fail-closed para secrets principales,
CORS allowlist, Helmet, límites HTTP globales, sesiones administrativas fuertes, RBAC persistente,
RLS/default-deny modelado, idempotencia en áreas financieras, outbox durable, redacción central,
Country/Market separados y defaults de seed con Markets deshabilitados. El estado efectivo de cada
Market en un entorno externo debe verificarse antes de cualquier release.

## 5. Hallazgos P0 — bloqueadores

### P0-01 — El flujo de efectivo viola estados e integridad de pago

**Evidencia:** `backend/src/controllers/payment.controller.js:180-196`.

`confirmCashPayment` permite al cliente propietario ejecutar un `upsert` incondicional que cambia el
pago a `PENDING/CASH` y después actualiza la reserva directamente a `CONFIRMED`. No comprueba el
estado previo de booking o payment, no usa la transición CAS y puede:

- revivir una reserva cancelada o completada;
- saltarse la aceptación del profesional;
- degradar un pago Stripe `COMPLETED` a efectivo pendiente;
- competir con confirmación, cancelación o webhook;
- crear una proyección incompatible con ledger/provider.

**Acción mínima segura:** desactivar `CASH` por flag; mover la declaración y liquidación a un servicio
con estados separados, CAS, idempotency key/digest, autorización explícita, audit/outbox y pruebas de
concurrencia. Un pago capturado jamás debe sobrescribirse; las correcciones son compensatorias.

**Gate:** estados terminales inmutables, Stripe capturado no degradable, 1 efecto por idempotency key,
concurrencia payment/webhook/cancel/cash probada en PostgreSQL.

### P0-02 — No existe georrestricción automática por país

**Evidencia:**

- Cliente: `mobile-client/src/app/auth/register.tsx:37-58,112-114` lista Markets y deja elegir.
- Profesional: `mobile-professional/src/app/auth/register.tsx:23-29,60` hace lo mismo.
- Entrada de apps: `mobile-client/src/app/index.tsx` y `mobile-professional/src/app/index.tsx` sólo
  resuelven autenticación; no existe bootstrap de elegibilidad territorial.
- Backend: `backend/src/app.js:87-104` monta rutas sin middleware de país de red.
- Config móvil: `mobile-client/app.config.js:24-25` todavía declara permisos de ubicación precisa y
  aproximada, aunque el bloqueo solicitado no debe usar GPS.

**Acción:** implementar el módulo F8.6 descrito en la sección 8. Hasta entonces no se puede afirmar
que la app esté limitada al país objetivo.

### P0-03 — No existe una ruta reproducible de despliegue y recuperación

No hay Dockerfile, Compose, IaC, CD, adapter de despliegue, staging production-like, backup runbook
operativo ni prueba de restore. F11 es actualmente ADR/plan, no runtime. Sin restore demostrado no hay
rollback de datos verificable.

**Gate:** imágenes reproducibles non-root, staging aislado, manifest inmutable, deployment adapter
cerrado, backup/PITR evidenciado, restore a entorno efímero con checksums, canary/abort y rollback
rehearsal.

### P0-04 — La evidencia de pruebas no cubre los recorridos críticos

No existe directorio E2E ni Playwright/Maestro/Detox. La app profesional no tiene script de tests. La
cobertura backend total es 57,64 %, pero varios entry points críticos quedan casi sin ejecución:

| Archivo | Cobertura de líneas medida |
|---|---:|
| `booking.controller.js` | 7,41 % |
| `payment.controller.js` | 10,81 % |
| `notification.controller.js` | 13,04 % |
| `auth.controller.js` | 14,75 % |
| `upload.routes.js` | 17,71 % |
| `professional.controller.js` | 18,57 % |
| `review.controller.js` | 23,21 % |

Los tests actuales validan bien servicios puros y contratos estáticos, pero no prueban suficientemente
la ejecución real HTTP/controller/provider. Esto explica por qué P0-01 pasa la suite.

**Gate:** diez journeys E2E mínimos, tests HTTP de todos los endpoints monetarios/identidad/upload,
tests móviles de ambos productos y umbrales de cobertura por código crítico, no sólo globales.

### P0-05 — Gates externos de seguridad y producción incompletos

El hardening SQL de Supabase tiene evidencia previa y el baseline actual pasa, pero siguen pendientes
Data API deshabilitada, Security Advisor, inventario de consumidores externos, staging y smoke/monitoring.
El SHA actual tampoco está cubierto por CI remota porque la rama local está un commit por delante.

**Gate:** CI del SHA exacto, scan de historia, revisión independiente, Data API/Advisor evidenciados,
staging y ventana de monitorización sin violaciones.

### P0-06 — Falta autoridad legal/fiscal y activación de Market

No existe aprobación cualificada de textos, retención, identidad, cancelación/refund, privacidad,
fiscalidad/DAC7, KYC/Connect ni stores. El repositorio los siembra deshabilitados y esta auditoría no
autorizó ni verificó ninguna activación externa; deben permanecer deshabilitados.

**Gate:** matriz requisito-control-evidencia con fuente/versión/fecha, owner y aprobación; Market
`DISABLED -> READY -> ACTIVE` sólo mediante su workflow y autorización humana contemporánea.

## 6. Hallazgos P1 — críticos antes de producción

| ID | Hallazgo y evidencia | Impacto | Corrección no destructiva |
|---|---|---|---|
| P1-01 | Upload confía en MIME declarado (`middleware/upload.js:5-15`); documentos se suben como recursos públicos y se persiste `secure_url` (`routes/upload.routes.js:60-106`) | malware/polyglot, exposición de documentos, huérfanos | ObjectStorage port privado, magic bytes, AV/CDR según política, signed URLs, compensación y lifecycle |
| P1-02 | `notification.controller.js:56-62,102-108,131-137,176-182` devuelve `error.message` en 500 | filtración de detalles internos | delegar al error handler central y añadir tests negativos en producción |
| P1-03 | Booking, notifications y admin legacy aceptan `page/limit/status` sin límites estrictos (`booking.controller.js:286-345`; `notification.controller.js:10-52`; `admin.controller.js:108-145,235-257`) | DoS lógico, errores Prisma/500, consultas costosas | Zod strict + caps + códigos estables + contract tests |
| P1-04 | Cliente/profesional muestran `€` hardcodeado en múltiples vistas | pricing multipaís incorrecto | moneda y locale desde Booking/Market contract; formatter compartido; snapshots de ES/BR/CL |
| P1-05 | `public-web/lib/content-api.ts:6` cae a `127.0.0.1` incluso en producción | build verde pero runtime roto | validación fail-closed de `CORE_API_BASE_URL` HTTPS y test de configuración negativa |
| P1-06 | Backend tiene refresh/revocation, pero ambas apps sólo guardan access token; ante 401 lo eliminan. Logout móvil no llama `/auth/logout` | sesiones de 15 min abruptas y sesiones servidor no revocadas | rotación single-flight, refresh seguro, logout remoto, revocación/device UI y tests de replay |
| P1-07 | Stripe se importa directamente en controller y servicios financieros | provider lock-in y límites mezclados | `PaymentProvider` port + registry cerrado + Stripe adapter + fake contractual de test |
| P1-08 | No se encontraron triggers append-only para Ledger/Audit | un actor DB privilegiado puede mutar evidencia | triggers/constraints aditivos, cleanup autorizado y pruebas DB de UPDATE/DELETE rechazado |
| P1-09 | Legal version es string global y textos/resúmenes están embebidos en cliente; profesional envía aceptación booleana única | evidencia de consentimiento insuficiente | LegalDocument/Version/Acceptance, locale/context/digest, links reales y stale-version rejection |
| P1-10 | Onboarding profesional no cierra tax, payment account, verificación, services ni availability editor | profesional incompleto o elegible de forma errónea | aggregate profesional y eligibility guard versionado por Market |
| P1-11 | Admin category CRUD opera en controllers sin Zod estricto, servicio de aplicación o auditoría uniforme | configuración sensible poco gobernada | API v1, servicio transaccional, reason/audit, four-eyes cuando proceda |
| P1-12 | No hay workflows RGPD de access/export/deletion/anonymization ni matriz de retención | solicitudes de derechos no operables | requests versionadas, jobs idempotentes, export cifrado/expirable y legal holds |
| P1-13 | Apps/stores carecen de EAS profesional, privacy manifests, signing evidence, deep/universal links y checklist | no publicables | release configs sin secretos, permisos mínimos, builds internos y gates humanos |
| P1-14 | No hay OpenAPI/contrato generado; `backend/API_DOCUMENTATION.md` está desactualizado | drift cliente/backend y operación incorrecta | contrato versionado generado o validado, compatibility suite y deprecation policy |

## 7. Hallazgos P2/P3 — deuda priorizada

| ID | Hallazgo | Prioridad |
|---|---|---|
| P2-01 | `Favorite.toggle` usa read-then-create y puede devolver 500 en carrera de unicidad | Corregir con operación idempotente/transaccional |
| P2-02 | Admin build produce chunk de 501,65 kB | Dividir por rutas sin bloquear P0/P1 |
| P2-03 | Revenue y Analytics siguen como páginas informativas | Completar después de autoridades financieras/analíticas |
| P2-04 | NotificationService no es todavía un pipeline multicanal con worker/provider/template | Construir tras legal/consent y provider decisions |
| P2-05 | No hay SBOM ni evaluación de mantenimiento/duplicidad de dependencias | Añadir a CI de release |
| P2-06 | No hay baseline de carga/soak ni presupuesto de rendimiento | Medir en staging antes de optimizar |
| P2-07 | Controladores legacy conservan lógica, transacciones y errores heterogéneos | Extraer por flujo; no reescritura masiva |
| P3-01 | `frontend/SKILL.md` aún describe versiones antiguas del cliente | Sincronizar la guía con Expo 57/RN 0.86/React 19 |
| P3-02 | `SPAIN_GAP_ANALYSIS.md` conserva findings ya corregidos y cifras F10 anteriores | Marcarlo histórico o actualizarlo desde este informe |
| P3-03 | `BILLING_SYSTEM.md` repite secciones completas de payout/dispute/reconciliation | Deduplicar sin borrar evidencia histórica |

## 8. Módulo F8.6 — bloqueo automático por país sin GPS

### 8.1 Decisión recomendada

Interpretación inicial: el país objetivo es **España (`ES`)**, coherente con la iniciativa actual. No se
debe hardcodear `ES` en las apps. El allowlist se resuelve desde `Market`/`MarketPolicyVersion`; cambiar
o añadir país es una transición de configuración revisada, no un release móvil.

La señal primaria será **país derivado de la IP en el edge/CDN o load balancer confiable**. Cloudflare
puede añadir `CF-IPCountry` y CloudFront `CloudFront-Viewer-Country`. Ambos derivan el país desde la IP;
la IP geolocation es estimada y admite resultados desconocidos. Por ello el diseño necesita estado
`UNDETERMINED`, soporte/reintento y medición de falsos bloqueos. No promete precisión absoluta.

No se solicitará al usuario país de residencia para permitir acceso. No se pedirá permiso de ubicación,
no se llamará a APIs GPS y se eliminarán `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`. El mapa de
una reserva puede mostrar coordenadas ya existentes sin pedir ubicación actual.

### 8.2 Arquitectura

```text
App móvil
  -> Edge/CDN confiable deriva countryCode desde IP
      -> origen acepta sólo tráfico del edge y descarta headers enviados por el cliente
          -> NetworkCountryResolver (adapter cerrado)
              -> TerritorialEligibilityService
                  -> Market + MarketPolicyVersion + lifecycle
                      -> ALLOWED | BLOCKED | UNDETERMINED | TEMPORARILY_UNAVAILABLE
                          -> UI de acceso o pantalla bloqueada
                          -> middleware de autorización territorial en APIs de usuario
```

Componentes propuestos:

- `NetworkCountryResolver`: interface provider-neutral.
- Adapters cerrados: uno para el proveedor de ingress elegido; un adapter determinista sólo para test.
- `TerritorialEligibilityService`: une evidencia de red con Market activo/policy vigente.
- `TerritorialAccessPolicyVersion`: opcional si las reglas de acceso requieren versión propia; si no,
  referencia inmutable dentro de MarketPolicyVersion.
- `TerritorialAccessDecision`: evidencia mínima y acotada; no almacenar IP cruda por defecto.
- Middleware `requireTerritorialEligibility` y matriz explícita de rutas.
- Endpoint público `GET /api/v1/access/eligibility` con rate limit estricto.

Contrato sugerido:

```json
{
  "decision": "ALLOWED",
  "countryCode": "ES",
  "marketCode": "ES",
  "policyVersion": 3,
  "reasonCode": "ACTIVE_MARKET_MATCH",
  "evaluatedAt": "2026-09-12T10:00:00.000Z",
  "expiresAt": "2026-09-12T10:05:00.000Z"
}
```

El cliente puede cachear esta respuesta brevemente para UX, pero el backend vuelve a decidir en cada
operación protegida. Un token cacheado nunca sustituye la señal del edge para pagos, reservas,
identidad o cambios de cuenta.

### 8.3 Confianza y anti-spoofing

1. El origen no será accesible directamente desde Internet; sólo edge/load balancer autorizado.
2. El edge elimina cualquier header de geografía aportado por el cliente y añade el suyo.
3. `trust proxy` se configura con topología exacta; no se acepta `X-Forwarded-For` arbitrario.
4. La fuente/header se selecciona por registry de entorno, nunca por request.
5. En producción no existe header manual de test.
6. Valores no ISO, `XX`, Tor/anonymous o ausencia de señal producen `UNDETERMINED`, no allow.
7. El backend valida además que el Market esté `ACTIVE` y la policy sea efectiva/revisada.

### 8.4 Matriz de rutas

| Clase | Política recomendada |
|---|---|
| Bootstrap eligibility | Pública, limitada, sólo decisión segura |
| Registro/login/perfil cliente y profesional | Requiere país permitido |
| Booking/payment/review/favorite/notification | Requiere país permitido en cada request |
| Contenido público de Market | Definir con Product/SEO; no asumir bloqueo móvil global |
| Admin Web/API | Política separada; MFA/VPN/Zero Trust, no heredar automáticamente el país móvil |
| Webhooks Stripe/callbacks/provider | Exentos de georrestricción; firma/replay/allowlist propios |
| Health/metrics internos | Exentos y protegidos por red/permiso |
| Workers/jobs | No son tráfico de usuario y no usan GeoIP |

Esta separación es obligatoria: aplicar el middleware globalmente bloquearía webhooks y workers
legítimos que pueden originarse fuera de España.

### 8.5 UX móvil

- Resolver elegibilidad antes de restaurar sesión o mostrar login.
- `ALLOWED`: continuar sin mostrar selector de país; usar Market resuelto.
- `BLOCKED`: pantalla completa, clara, sin navegación al producto; enlace de soporte/estado.
- `UNDETERMINED`: “No podemos confirmar disponibilidad”, botón Reintentar y soporte; no acusar VPN.
- Sin red: estado técnico distinto de “país bloqueado”. Se puede mostrar reintento, no una decisión falsa.
- Si el usuario viaja después de autenticarse, el backend bloquea operaciones y la app invalida la
  elegibilidad cacheada, sin borrar automáticamente datos locales o cuenta.
- Accesibilidad, español/portugués/inglés y reason codes estables.

### 8.6 Privacidad y observabilidad

- Evaluar en el edge y enviar al backend sólo country code, fuente, timestamp y nivel de confianza si
  existe; evitar ciudad/coordenadas.
- No almacenar IP cruda en `TerritorialAccessDecision` salvo política aprobada. Revisar también la
  retención existente de IP en sesiones.
- Métricas de baja cardinalidad: decision/reason/market/source; nunca IP como label.
- Auditoría sólo para transiciones o denegaciones sensibles, con retención aprobada.
- DPA/data residency/DPIA y aviso de privacidad requieren revisión cualificada antes de activar.

### 8.7 Rollout no destructivo

1. ADR 0008: alcance exacto, país inicial, proveedor ingress, confianza, retención y excepciones.
2. Contrato + adapters fake y provider real, todo detrás de `TERRITORIAL_ACCESS_ENABLED=false`.
3. Shadow mode: calcular y medir sin bloquear; no persistir IP cruda.
4. Backend enforcement en rutas de usuario por flag de entorno/Market/audience.
5. Cliente nuevo consume bootstrap; selector legacy desaparece sólo en versión nueva.
6. Retirar permisos GPS de manifests y verificar binarios Android/iOS.
7. Canary, soporte, falsos positivos y abort thresholds.
8. Activar sólo tras revisión Product/Security/Privacy/Legal/Operations y Market ACTIVE.

Rollback: apagar el flag y volver al flujo compatible; conservar decisiones/auditoría. No eliminar
tablas ni reactivar selector/Market mediante una migración destructiva. Si versiones antiguas permiten
elegir país, bloquearlas mediante política de versión mínima al completar el rollout.

### 8.8 Pruebas de aceptación F8.6

- IP ES -> allow sólo con Market ES activo/policy vigente.
- IP FR/BR/CL -> block cuando el allowlist sea ES.
- país desconocido/Tor/header ausente -> fail closed con UX de indeterminación.
- header forjado por cliente -> ignorado.
- acceso directo a origin -> denegado.
- IPv4/IPv6, móvil/CGNAT y cambio de red durante sesión.
- Market disabled/suspended, policy stale/unreviewed -> deny.
- login previo desde fuera -> APIs sensibles devuelven código territorial estable.
- Stripe webhook, workers y health mantienen sus controles propios.
- no permisos GPS en manifests/binarios y ninguna llamada a APIs de localización.
- compatibilidad old/new client, cache expiry, provider outage y retry.
- test E2E de pantalla bloqueada y test PostgreSQL/audit de decisiones.

## 9. Roadmap modular de corrección

### Ola 0 — Congelación y seguridad inmediata

**Objetivo:** impedir que defectos actuales generen nueva deuda.

- Desactivar efectivo y cualquier flag de ejecución financiera no acreditado.
- Confirmar Markets `DISABLED`; no activar producción.
- Publicar el SHA actual y obtener CI remota o crear release candidate inmutable.
- Abrir incident-style review para P0-01 y verificar si existen pagos/reservas afectados mediante query
  read-only; no corregir datos automáticamente.

**Gate:** cash no ejecutable, flags críticos off, inventario de posibles afectados y owner asignado.

### Ola 1 — Integridad de dominio y contratos

- Corregir cash como workflow gobernado.
- Limitar/validar pagination/status/UUID/body en endpoints legacy.
- Eliminar filtración de `error.message`.
- Versionar OpenAPI o contrato equivalente y generar/verificar tipos.
- Añadir tests HTTP para payment, booking, auth, notification, upload y admin legacy.

**Gate:** P0-01 y P1-02/P1-03 cerrados; contract regression verde.

### Ola 2 — F8.6 elegibilidad territorial

- ADR, provider decision, adapter, backend service/middleware, API bootstrap, UI bloqueada, eliminación
  de selector y permisos GPS, shadow/canary.

**Gate:** sección 8.8 completa; false-positive thresholds y rollback ensayados.

### Ola 3 — Identidad, privacidad y legal

- Completar refresh/logout móviles y gestión de sesiones.
- LegalDocument/Version/Acceptance.
- Data access/export/deletion/anonymization y retention/legal hold.
- Revisión de IP/session/GeoIP privacy.

**Gate:** E2E de sesión/recuperación/verificación/derechos; textos reales siguen DRAFT hasta aprobación.

### Ola 4 — Profesional y storage

- Aggregate onboarding/eligibility profesional.
- Tax/payment account/verification/services/availability.
- Object storage privado y migración por copy/verify/switch, sin borrar URLs anteriores hasta reconciliar.

**Gate:** ningún profesional opera sin requisitos activos; documentos nunca públicos ni accesibles por IDOR.

### Ola 5 — Finanzas completas

- PaymentProvider abstraction.
- Triggers append-only ledger/audit.
- Refund/legal acceptance, sandbox E2E, payout/dispute/reconciliation.
- Mantener todo real-money off.

**Gate:** invariantes monetarios, concurrencia, replay, reconciliación y reversals verdes.

### Ola 6 — Frontends y Admin

- Moneda/locale desde contratos; journeys cliente/profesional completos.
- Revenue/Analytics/config/flags y módulos operativos reales.
- Public Web fail-closed, páginas legales/cookies y accesibilidad.
- Code splitting Admin.

**Gate:** ambos móviles, Admin y Public Web pasan component/contract/a11y y E2E.

### Ola 7 — Infraestructura, CI/CD y resiliencia

- Containers, environments, secret manager contract, staging, workers y observabilidad externa.
- Backup/PITR, restore rehearsal, load/soak y SLO/alert routing.
- Implementar F11 con provider adapter cerrado y step-up/four-eyes.

**Gate:** staging/canary/rollback/emergency-stop y restore demostrados; no producción todavía.

### Ola 8 — Stores, documentación y auditoría final

- Android/iOS build reproducible, permisos mínimos, privacy manifests, signing externo, store assets.
- README y documentos canónicos de arquitectura, seguridad, privacidad, testing, deployment, backup,
  incidentes y release.
- Reauditar desde cero el SHA inmutable.

**Gate:** matriz final sin P0/P1; externos `PENDING` explícitos; GO humano separado.

## 10. Dependencias y secuencia

```text
P0 cash + contratos
  -> F8.6 georrestricción
      -> identidad/privacidad/legal
          -> profesional/storage
              -> payment provider + ledger/refund
                  -> journeys/Admin
                      -> E2E
                          -> staging/performance/security
                              -> stores/docs
                                  -> auditoría final
                                      -> decisión humana GO/NO-GO
```

No se recomienda ejecutar F11 como prioridad aislada antes de cerrar los defectos de dominio: un control
plane seguro no convierte un artefacto funcionalmente inseguro en publicable.

## 11. Definition of Done global

Una capacidad sólo está terminada si incluye, cuando aplica:

- schema/migración aditiva y replay limpio;
- servicio de dominio y transacción/idempotencia/concurrencia;
- autenticación, autorización, ownership y validación estricta;
- contrato versionado y compatibilidad;
- audit/outbox/telemetría/redacción;
- unit/integration/contract/E2E/security;
- runbook, feature flag, canary, abort y rollback;
- evidencia local, staging y CI del SHA exacto;
- aprobación humana/legal/fiscal/security/production cuando corresponda.

Para dinero: Decimal/minor units, moneda explícita, ledger balanceado e inmutable, compensaciones,
idempotencia durable y reconciliación. Para Market/país: policy versionada server-authoritative,
fail-closed y prueba de todos los Markets/estados desconocidos.

## 12. Estado final de esta auditoría

```text
BUILD_LOCAL: PASS
UNIT_CONTRACT_LOCAL: PASS
DATABASE_BASELINE_READ_ONLY: PASS
DEPENDENCY_AUDIT_CURRENT: PASS (0 vulnerabilities)
CURRENT_SHA_REMOTE_CI: NOT VERIFIED
POSTGRES_INTEGRATION_THIS_SESSION: NOT RUN AGAINST UNVERIFIED NON-EPHEMERAL TARGET
E2E: MISSING
BACKUP_RESTORE: MISSING
STAGING: MISSING
COUNTRY_AUTO_BLOCK_NO_GPS: MISSING / DESIGNED IN THIS ROADMAP
TECHNICALLY_READY: NO
EXTERNAL_REQUIREMENTS_PENDING: YES
MARKETS_ACTIVE: NOT AUTHORIZED OR EXTERNALLY VERIFIED / MUST REMAIN DISABLED
PRODUCTION_APPROVED: NO
PRODUCTION_DEPLOYMENT: NOT AUTHORIZED
```

## 13. Fuentes técnicas externas para F8.6

- Cloudflare IP geolocation y limitaciones: https://developers.cloudflare.com/network/ip-geolocation/
- Cloudflare `CF-IPCountry` y códigos especiales: https://developers.cloudflare.com/fundamentals/reference/http-headers/
- AWS CloudFront viewer location headers: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html

Estas fuentes prueban que el edge puede aportar país derivado de IP, no que la señal sea infalible ni
que su uso esté legalmente aprobado para HomeServices. La decisión de proveedor y la revisión de
privacidad/legal permanecen abiertas.
