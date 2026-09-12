# HomeServices — Plan de ejecución de remediación y preparación para producción

- Fecha: 2026-09-12
- Estado: **AUTORIZADO — PRR-0 en ejecución; producción no autorizada**
- Fuente de evidencia: `docs/production-readiness/SYSTEMATIC_PROJECT_AUDIT_AND_ROADMAP.md`
- Baseline de código auditado: `dc338f296ca52097aac1e557f8bfa4522b7fda7c`
- Rama: `feature/production-control-plane-phase-11`
- Notion plan: `https://app.notion.com/p/3d92a44b846d817d9459d5fb07af710a`
- Notion backlog: `https://app.notion.com/p/fe1259a2c90047788e2430b8644b9768`
- Notion registro maestro: `https://app.notion.com/p/3d92a44b846d8143a051f75ad428da3a`
- Decisión actual: **NO-GO**

## 1. Clasificación

```text
Phase: programa transversal PRR-0 a PRR-8, incluyendo F8.6 y F11
Domain: Marketplace / Markets / Identity / Billing / Security / Release / Frontends
Risk: CRITICAL
Capability tier: DEEP para diseño y revisión final; STANDARD sólo para slices ya aprobados
Provider/model: operador seleccionado dentro del tier requerido
Skills: architecture-guardian, repo-auditor, security, payments, booking-engine,
        database-prisma, backend-fastapi, frontend, legal-compliance, testing, release
Escalation: cambios financieros, migraciones, privacidad, contratos públicos, proveedores,
            secretos, entornos externos, Market activation y producción
Verification: CI del SHA exacto + PostgreSQL efímero + E2E + staging real + evidencia externa
Rollback: application-first, flags cerrados, migraciones aditivas y evidencia preservada
```

## 2. Objetivo y condiciones no negociables

El programa termina cuando existe un release candidate inmutable que satisface todos los gates
técnicos, operativos, legales y externos aplicables. No equivale a activar producción: el primer GO
productivo seguirá necesitando autorización humana explícita, fechada y referida al digest exacto.

Reglas del programa:

1. No se marca una tarea `HECHO` por código generado, simulaciones, mocks aislados o relato manual.
2. Toda tarea incluye implementación real, pruebas proporcionales al riesgo, documentación y rollback.
3. CI debe ejecutar el commit exacto entregado; un CI histórico no acredita un commit nuevo.
4. Las integraciones se prueban con PostgreSQL efímero y, cuando aplique, proveedor sandbox/staging
   real. Los fakes sólo complementan, nunca sustituyen, la integración.
5. Ninguna suite se debilita para acomodar una implementación defectuosa.
6. No se borra historia financiera, legal, audit, identidad o decisiones de acceso; se compensa o
   anonimiza únicamente mediante workflows aprobados.
7. Markets, dinero real, publicación externa y producción permanecen apagados hasta sus gates.
8. Notion es una proyección de seguimiento. Git, CI, migraciones, release records y aprobaciones
   firmadas son la evidencia autoritativa.

## 3. Impacto de gobernanza y autorización requerida

### 3.1 Artefactos que deben cambiar

| ID | Cambio propuesto | Razón | Autoridad requerida |
|---|---|---|---|
| GOV-01 | Crear ADR 0008 de elegibilidad territorial sin GPS | nueva frontera de seguridad, proveedor GeoIP, contrato público y fail-closed | aprobación de arquitectura, security, privacy, legal y Product |
| GOV-02 | Actualizar `IMPLEMENTATION_PLAN.md` con F8.6 y este programa PRR | la secuencia F1-F11 no contiene la remediación descubierta | aprobación del owner de arquitectura |
| GOV-03 | Ampliar `MARKETS_IDENTITY_GEOGRAPHY.md` con `TerritorialAccessPolicy/Decision` y matriz de rutas | mantener Market como autoridad y evitar lógica nacional en clientes | arquitectura + security/privacy |
| GOV-04 | Añadir a `GOVERNANCE.md` la regla de cierre basada en SHA/CI y la condición de que Notion no es autoridad | impedir estados “HECHO” sin evidencia reproducible | owner de gobernanza |
| GOV-05 | Formalizar decisión sobre efectivo: deshabilitarlo o aprobar un workflow compensatorio | el flujo actual viola estados y evidencia financiera | Product + Finance + Security; ADR financiero si se conserva |
| GOV-06 | Actualizar AGENTS/Definition of Done para exigir enlace PR, SHA, CI, migrations y release record al cerrar | alinear ejecución humana/AI con el tracker | owner de gobernanza |

### 3.2 Artefactos que no necesitan cambio por ahora

- `MODEL_ROUTING.md`: ya exige DEEP para país, dinero, privacidad y producción.
- `SKILL_CATALOG.md`: las skills actuales cubren el programa; no se justifica crear una skill nueva
  antes de comprobar repetición o fallo de instrucciones.
- Arquitectura PostgreSQL/API-only: sigue siendo válida.
- ADR 0007/F11: se conserva; F11 se ejecuta después de cerrar integridad de dominio y E2E.

Los cambios GOV-01 a GOV-06 fueron autorizados explícitamente por el usuario el 2026-09-12. La
autorización cubre repositorio y verificación test/staging; no cubre producción, activación de Market,
rotación de secretos, mutaciones destructivas ni acciones financieras reales.

## 4. Contrato de seguimiento GitHub ↔ Notion

El backlog inicial contiene 52 tareas con `Task ID` único, organizadas en PRR-0 a PRR-8. Notion
incluye una vista por estado y otra de ruta crítica P0.

Cada tarea de Notion debe registrar:

- `Task ID`, ola, dominio, prioridad y riesgo;
- estado y dependencias;
- commit SHA y URL de PR;
- URL de ejecución GitHub Actions del SHA exacto;
- checks requeridos y resultado;
- ruta del release record/evidence manifest;
- aceptación humana requerida y estado;
- rollback/flag;
- fecha de última verificación.

Estados permitidos:

```text
AUTORIZACION -> PENDIENTE -> EN CURSO -> EN REVISION -> HECHO
                                  \-> BLOQUEADO
```

`HECHO` requiere de forma acumulativa:

1. criterios de aceptación comprobados;
2. revisión independiente cuando el riesgo sea HIGH/CRITICAL;
3. PR unido o commit aprobado en la rama de entrega;
4. CI requerida verde para el SHA exacto;
5. PostgreSQL/migration gate verde si afecta datos;
6. E2E/staging/proveedor real cuando aplique;
7. documentación, observabilidad y rollback;
8. aprobaciones externas aplicables vigentes.

Si GitHub no es consultable, la tarea queda `BLOQUEADO` o `EN REVISION`; nunca `HECHO`. La conexión
GitHub local estaba autenticada con una credencial inválida durante la creación de este plan (`401`),
por lo que el SHA actual no tiene evidencia remota confirmada en esta sesión.

## 5. Estrategia de CI como evidencia

La CI actual conserva sus tres jobs —quality, PostgreSQL y secrets— y se amplía de manera aditiva:

| Gate | Ejecución real requerida | Salida durable |
|---|---|---|
| `quality` | instalaciones lockfile, lint/type/build, unit/contract, auditorías | logs + JUnit/summary |
| `postgres` | PostgreSQL efímero, migración desde cero, RBAC, integración y concurrencia | migration manifest + resultados |
| `secrets` | historia completa, negative controls | scan report |
| `critical-coverage` | umbrales por payment/booking/auth/upload/territorial, no sólo global | LCOV + summary |
| `api-contract` | OpenAPI/contrato versionado, generación y compatibilidad old/new | diff de contrato |
| `e2e-web-admin` | recorridos reales contra stack efímero | report, screenshots/traces sólo de fallos |
| `e2e-mobile` | cliente y profesional, permisos/binarios y journeys críticos | report de build/test |
| `container-sbom` | build reproducible non-root, scan y SBOM | digest + SBOM + scan |
| `staging-smoke` | entorno aislado con proveedores sandbox y datos sintéticos | URL de run + release manifest |
| `restore-rehearsal` | restauración real a entorno efímero y checksums | restore record |
| `performance-security` | carga/soak, SAST/DAST, upload adversarial y límites | budgets + findings |
| `release-evidence` | agrega todos los checks del mismo SHA | `production-readiness-evidence.json` firmado/atestiguado |

La sincronización automática a Notion sólo puede copiar resultados de GitHub; no puede transformar un
fallo, skip o ausencia en éxito. El workflow debe usar un secreto de integración de alcance mínimo,
protección de entorno y sin exponer payloads o PII.

## 6. Backlog ejecutable

Las tareas están dimensionadas para producir un incremento verificable. Una tarea de más de dos días
debe dividirse antes de entrar en `EN CURSO`.

### PRR-0 — Gobernanza y contención

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-001 | Aprobar cambios GOV-01 a GOV-06 y owners | autorización usuario | decisiones registradas |
| PRR-002 | Desactivar el flujo CASH por flag/config segura | PRR-001/GOV-05 | request cash rechazado; regresión verde |
| PRR-003 | Inventario read-only de bookings/payments potencialmente afectados | PRR-001 | query revisada, sin mutación, evidencia acotada |
| PRR-004 | Publicar baseline y obtener CI del SHA exacto | credencial GitHub válida | tres jobs actuales verdes |
| PRR-005 | Crear ADR 0008 y actualizar autoridad F8.6 | PRR-001 | revisión Architecture/Security/Privacy/Product |
| PRR-006 | Incorporar regla SHA/CI/Notion a gobernanza | PRR-001 | docs coherentes y review aprobado |

### PRR-1 — Integridad de dominio y contratos

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-101 | Diseñar workflow cash y elegibilidad profesional con tarjeta tokenizada para fees, o retirada permanente compatible | GOV-05 | decisión de cobro/consentimiento/SCA/deuda e invariantes aprobados |
| PRR-102 | Implementar servicio cash CAS/idempotente/transaccional y cobro de fee gobernado | PRR-101 | carreras, provider replay, fallos de tarjeta y terminal states verdes en PostgreSQL |
| PRR-103 | Reparar filtración de errores 5xx | PRR-001 | respuestas estables sin detalles internos |
| PRR-104 | Validar/capar paginación, filtros, UUID y cuerpos legacy | PRR-001 | tests malformed/abuse verdes |
| PRR-105 | Publicar OpenAPI/contrato v1 compatible | PRR-103/104 | diff y consumer tests verdes |
| PRR-106 | Cubrir HTTP payment/booking/auth/upload/notification/admin | PRR-102/105 | umbrales críticos acordados |

### PRR-2 — Elegibilidad territorial F8.6 sin GPS

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-201 | Seleccionar edge/provider y modelo de confianza | ADR 0008 | origin/header/unknown policy aprobadas |
| PRR-202 | Modelo/policy/decision y migración aditiva | PRR-201 | replay limpio + RLS/default-deny |
| PRR-203 | Adapter GeoIP y servicio server-authoritative | PRR-202 | forged/missing/XX/Tor fail closed |
| PRR-204 | Endpoint bootstrap y middleware con matriz de rutas | PRR-203 | webhooks/workers exentos correctamente |
| PRR-205 | Cliente: bootstrap/bloqueo y retirar selector/permisos GPS | PRR-204 | Android/iOS binary permission evidence |
| PRR-206 | Profesional: bootstrap/bloqueo y retirar selector | PRR-204 | E2E de allow/block/unknown/offline |
| PRR-207 | Shadow/canary, métricas, soporte y rollback | PRR-205/206 | thresholds y abort rehearsal |

### PRR-3 — Identidad, privacidad y legal

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-301 | Refresh rotation y logout remoto en ambos móviles | PRR-105 | replay/revocation/device E2E |
| PRR-302 | LegalDocument/Version/Acceptance versionados | revisión legal | stale/missing acceptance fail closed |
| PRR-303 | Solicitud de acceso/exportación RGPD | PRR-302 | export cifrado, auditable y expirable |
| PRR-304 | Supresión/anonymization/legal hold | PRR-303 | ensayo con evidencia preservada |
| PRR-305 | Retención y DPIA para IP/GeoIP/sesiones | PRR-201 + legal/privacy | matriz aprobada y controles medidos |

### PRR-4 — Profesional y documentos privados

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-401 | Aggregate de onboarding/eligibility profesional | policy legal/tax | estados/versiones/concurrencia probados |
| PRR-402 | Tax/payment/verification/services/availability | PRR-401 | profesional inelegible no opera |
| PRR-403 | Object storage privado con signed URLs | security/provider decision | IDOR/magic bytes/AV/límites verdes |
| PRR-404 | Migrar documentos copy/verify/switch | PRR-403 | reconciliación 100%; origen preservado |
| PRR-405 | Lifecycle/cleanup y compensación de uploads | PRR-403 | fallos provider/DB no dejan exposición |

### PRR-5 — Finanzas y evidencia inmutable

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-501 | PaymentProvider port y Stripe adapter contractual | PRR-102 | sandbox + fake contractual equivalentes |
| PRR-502 | Triggers append-only Ledger/Audit | revisión DB/Finance | UPDATE/DELETE indebidos rechazados |
| PRR-503 | Reconciliación cash/card/refund/payout/dispute | PRR-501/502 | balances e idempotencia 100% |
| PRR-504 | E2E financiero sandbox y replay de webhooks | PRR-503 | duplicados/concurrencia/timeout probados |
| PRR-505 | Runbooks de compensación y cierre financiero | PRR-504 | rehearsal sin dinero real |

### PRR-6 — Productos y administración completos

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-601 | Moneda/locale desde contratos en cuatro frontends | PRR-105 | ES/BR/CL snapshots/contract tests |
| PRR-602 | Journeys completos del cliente | PRR-2/3/5 | E2E accesible sin skips |
| PRR-603 | Journeys completos del profesional | PRR-4/5 | E2E accesible sin skips |
| PRR-604 | Revenue/Analytics/Admin operativos | PRR-503 | no placeholders; RBAC/audit verdes |
| PRR-605 | Public Web fail-closed y legal/cookies | PRR-302 | producción sin localhost fallback |
| PRR-606 | Favoritos concurrentes y pipeline de notificaciones | PRR-105 | idempotencia/worker/provider sandbox |

### PRR-7 — Infraestructura, resiliencia y F11

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-701 | Contenedores reproducibles non-root + SBOM | contratos estables | digest/scan reproducible |
| PRR-702 | Entornos dev/test/staging aislados y secrets contract | PRR-701 | no secrets en repo/logs |
| PRR-703 | Backup/PITR y restore rehearsal real | PRR-702 | restore checksum y RTO/RPO medidos |
| PRR-704 | SLO, alertas, on-call, load/soak | PRR-702 | budgets y rutas de escalación probados |
| PRR-705 | Implementar F11 provider adapter y preflight | PRR-1..6 | staging-only, four-eyes/step-up |
| PRR-706 | Canary/rollback/emergency-stop rehearsal | PRR-705 | observed state reconciliado |

### PRR-8 — Stores, cierre y decisión GO

| ID | Entregable | Depende de | Gate |
|---|---|---|---|
| PRR-801 | Builds Android/iOS firmables, privacy manifests y deep links | PRR-6/7 | builds internos en dispositivos reales |
| PRR-802 | Documentación canónica y runbooks completos | todas las olas | revisión sin drift |
| PRR-803 | Auditoría independiente desde cero del SHA candidato | PRR-801/802 | cero P0/P1, evidencia no expirada |
| PRR-804 | Release evidence manifest del SHA exacto | PRR-803 | todos los checks required verdes |
| PRR-805 | Comité humano GO/NO-GO | PRR-804 + externos | decisión firmada; no implícita |
| PRR-806 | Activación productiva | autorización contemporánea separada | fuera del alcance hasta orden explícita |

## 7. Dependencia crítica

```text
Autorización de gobernanza
  -> contención CASH y baseline CI
    -> integridad de dominio/contratos
      -> F8.6 territorial
        -> identidad/legal/profesional/storage
          -> finanzas completas
            -> journeys/E2E
              -> infraestructura/restore/F11
                -> stores y auditoría final
                  -> GO humano del release exacto
```

## 8. Evidencia de cierre del programa

El programa sólo puede declarar `PRODUCTION_READY_CANDIDATE` si:

- backlog PRR-001 a PRR-805 está `HECHO` con enlaces verificables;
- cero P0/P1 y cero findings security críticos/altos sin aceptación formal;
- CI del SHA exacto concluye success sin jobs required omitidos;
- migraciones se reproducen desde cero y sobre baseline compatible;
- restauración, canary, rollback y emergency stop se ensayaron realmente;
- E2E cubre cliente, profesional, admin, público y proveedores sandbox;
- Markets siguen apagados salvo transición explícita aprobada;
- evidencia legal, fiscal, privacy, stores, infraestructura y ownership está vigente;
- auditoría independiente confirma que documentación y Notion coinciden con Git/CI.

`PRODUCTION_READY_CANDIDATE` no activa producción. La activación PRR-806 requiere una nueva orden
explícita del usuario para el release/digest exacto.
