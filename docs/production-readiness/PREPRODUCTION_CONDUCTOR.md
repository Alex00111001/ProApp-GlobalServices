# HomeServices — Conductor de preproducción

**Objetivo.** Obtener un candidato desplegado y ensayado en staging aislado, con evidencia
reproducible para su SHA y digest exactos. Usar datos sintéticos y proveedores sandbox.
El GO de producción se decide por separado según PRR-805 y PRR-806.

**Autoridad.** Usar los IDs, dependencias y criterios de cierre del
[plan PRR](PRODUCTION_REMEDIATION_EXECUTION_PLAN.md). Este conductor ordena el trabajo
y conserva la definición de HECHO de la [gobernanza](../agent-governance/GOVERNANCE.md).

## Punto de partida al 23 de noviembre de 2026

La rama de trabajo local está en `207632bb`. La [CI #98](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/44388933922)
verificó T01 en `979d93bd`. Pasaron los checks del workspace y de contratos, PostgreSQL y
Secret Scan. La auditoría del backend detectó un aviso crítico y seis altos. El paso se
interrumpió antes de auditar los paquetes siguientes. T01 sigue abierto. PRR-105 registra
129 entradas pendientes de equivalencia semántica y 196 respuestas incompletas.
[Registro de entrega](../releases/2026-09-16-prr-105-api-v1-contract.md).

**Avance verificado.** La remediación `886f321a` obtuvo CI completa
en [#100](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45148055600),
y el registro de evidencia `255d0bb9` pasó
[#101](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45148655558).
La revisión técnica independiente se completó. El [PR #37](https://github.com/Alex00111001/ProApp-GlobalServices/pull/37)
integró T01 en la rama de entrega como `17afcf21`, con
[CI completa verde del SHA integrado](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45152661024).
El siguiente tramo de PRR-105 es un piloto de parámetros enteros de consulta con valor predeterminado.

**Preparación del piloto.** Una comprobación de solo lectura con el parser simple de
Express y los validadores actuales de errores operativos y campañas confirmó 19 casos
iguales en ambos. La ausencia de parámetros produce página 1 y límite 25. Un valor vacío,
duplicado, fraccionario o un límite por encima de 100 falla. Las formas `01`, `2.0`,
`2e1` y `0x10` se aceptan y se convierten a enteros. Con `limit[]=2`, el parser entrega
una clave distinta de `limit` y se aplica el valor predeterminado. Estas observaciones
preparan los casos de regresión. El piloto debe comprobar también el comportamiento
HTTP montado y el contrato de los consumidores antes de declarar equivalencia.

Admin Web envía `search=` en la consulta inicial de Growth y Operations porque ambas
pantallas inicializan la búsqueda con una cadena vacía. Los dos validadores rechazan
esa consulta en `search` (`too_small`), y aceptan tanto omitir la clave como enviar
texto no vacío. El piloto debe cubrir el caso real del consumidor. Una corrección
compatible sería omitir la clave vacía al construir la consulta de Admin Web, con una
prueba de la carga inicial y de la búsqueda. Mantener el criterio del servidor para
quienes envían explícitamente `search=`.

**Corrección verificada.** El [PR #38](https://github.com/Alex00111001/ProApp-GlobalServices/pull/38)
aplica la corrección también a la lista de incidentes. La
[CI del SHA `63a48e11`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45151371597)
pasó los tres trabajos. Admin Web verificó lint, build y 18 pruebas locales, incluidas las
tres listas. Se puede revertir el commit sin migración.

**Ensayo de integración.** [La CI del candidato combinado `a4c1845f`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45155747284)
confirmó los tres trabajos para los cambios de los PR #38 y #40. Ambos se integraron y
el SHA `66906204` pasó [CI de entrega](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45235484640).
El [PR #41](https://github.com/Alex00111001/ProApp-GlobalServices/pull/41) añadió los esquemas
de respuesta 200 de campañas, errores e incidentes. PostgreSQL cubrió una página posterior
vacía en campañas y el desempate entre páginas de incidentes. La integración quedó en
`e751a69a`. Consultar la [CI del SHA de entrega](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45236031789).
El candidato conserva 129 entradas y 193 respuestas incompletas, además de las pruebas
pendientes de paridad global de consumidores.

**Soporte administrativo.** Los PR [#45](https://github.com/Alex00111001/ProApp-GlobalServices/pull/45)
y [#46](https://github.com/Alex00111001/ProApp-GlobalServices/pull/46) incorporaron las respuestas
de lectura y la entrada de creación de casos. La verificación de los SHA integrados
[`4e60f7f6`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45240416202) y
[`244ba6df`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45241313859)
pasó. El inventario conserva 128 entradas semánticas pendientes y 184 respuestas incompletas.
Las entradas de cambio de estado, asignación y comentario ya tienen evidencia de equivalencia
de validador. El siguiente vacío de entrada de soporte es la consulta de la lista de casos,
que combina paginación, filtros opcionales y búsqueda. OpenAPI sigue como candidato.

**Evidencia de entrega posterior.** Los siguientes controles pasaron para cada SHA integrado,
incluida la integración con PostgreSQL aislado. Los PR enlazan la revisión y el alcance de la
verificación de cada cambio.

| PR | SHA integrado y CI | Evidencia incorporada |
| --- | --- | --- |
| [#47](https://github.com/Alex00111001/ProApp-GlobalServices/pull/47) | [`52a6bbf2`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45242427680) | Paginación, filtros y búsqueda de soporte por HTTP. La equivalencia completa de la consulta sigue abierta. |
| [#48](https://github.com/Alex00111001/ProApp-GlobalServices/pull/48) y [#49](https://github.com/Alex00111001/ProApp-GlobalServices/pull/49) | [`d31a6990`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45245008656) y [`9d34cc8a`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45245687463) | Contratos de escritura de soporte y prueba de desasignación repetida sin eventos adicionales. |
| [#50](https://github.com/Alex00111001/ProApp-GlobalServices/pull/50) y [#51](https://github.com/Alex00111001/ProApp-GlobalServices/pull/51) | [`7e1d04a2`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45265547335) y [`5f4a2869`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45265723477) | Resumen de Operaciones y detalles de errores e incidentes. |
| [#52](https://github.com/Alex00111001/ProApp-GlobalServices/pull/52) | [`e5376df5`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45267053749) | Lectura y transición auditada de grupos de errores históricos, con UUID aún admitidos. |
| [#53](https://github.com/Alex00111001/ProApp-GlobalServices/pull/53) | [`e10bc5b9`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45268680005) | Contratos de escritura de Operaciones y exclusión de datos internos de las respuestas afectadas. |
| [#54](https://github.com/Alex00111001/ProApp-GlobalServices/pull/54) | [`2899627e`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45268835640) | Monitoreo financiero de solo lectura y verificación HTTP de permiso y auditoría. |

En `2899627e`, OpenAPI continúa como candidato sin publicar, con 128 entradas pendientes
de equivalencia semántica y 173 respuestas incompletas. La verificación de estos cambios
en CI usa PostgreSQL aislado y queda pendiente la aceptación integral en staging.

## Camino crítico

El orden siguiente refleja dependencias de aceptación. El camino de calendario se actualiza
cuando los responsables confirman duración, capacidad y fechas de decisiones externas.

| Orden | Bloque del plan | Evidencia para pasar al siguiente bloque |
| --- | --- | --- |
| 1 | Remediar dependencias y verificar PRR-105.T01 | Auditar todos los lockfiles, revisar actualizaciones y regresiones de backend, ejecutar Platform verification sobre el candidato exacto y completar la revisión independiente prevista. |
| 2 | Cerrar PRR-105 y PRR-106 | Contratos por dominio con autoridad de runtime, paridad en los cuatro consumidores, OpenAPI v1 aprobado y publicado y cobertura HTTP crítica verde. Mantener compatibilidad con la retirada de efectivo aprobada en PRR-101. |
| 3 | Completar PRR-2 a PRR-5 y habilitar PRR-701/702 cuando los contratos estén estables | Provisionar staging aislado antes de los ensayos de ingreso real de F8.6. Completar verificación de sesiones y privacidad, incorporación profesional y documentos privados, ledger y reconciliación financiera en sandbox. Registrar revisiones y aprobaciones aplicables. |
| 4 | Integrar PRR-6 sobre el entorno verificado | Artefactos reproducibles y recorridos E2E de cliente, profesional, Admin y Web contra el candidato integrado. Guardar los resultados. |
| 5 | Ensayar PRR-703 a PRR-706 y preparar PRR-801/802 | Restauración real con RTO/RPO medidos, carga y alertas verificadas, F11 con aprobación aplicable, simulacros de canary, rollback y parada de emergencia, builds internos y runbooks operativos. |

### Trabajo paralelo que reduce esperas

**Preflight de staging, 24 de noviembre de 2026.** En el SHA `ae65df4f`, el repositorio
solo contiene el workflow `ci.yml`. GitHub devolvió un entorno llamado `Env` y ningún
despliegue registrado. El nombre del entorno por sí solo no acredita aislamiento.
Este chequeo cubre el repositorio y GitHub. La existencia de infraestructura externa
sigue sin verificar.

| Bloque | Evidencia requerida para avanzar |
| --- | --- |
| PRR-701/702 | Platform registra el destino aislado, sus responsables, las referencias al gestor de secretos y la separación de datos y proveedores. El manifiesto identifica el SHA y el digest de la imagen non-root, junto al SBOM y el resultado del escaneo. |
| PRR-703/704 | Platform y Release adjuntan el ensayo de restauración, checksums y RTO/RPO medidos, además del recorrido de alertas y la prueba de carga del candidato. |
| PRR-706 y PRR-801/802 | Release enlaza los recorridos E2E, el manifiesto y el ensayo de canary y rollback del mismo candidato. |

La preparación del entorno puede continuar en paralelo. La activación de PRR-701/702
conserva la dependencia de estabilidad de contratos y el plan PRR rige los ensayos
posteriores. La CI sobre PostgreSQL efímero aporta evidencia de integración.

**Datos que Platform debe registrar para preparar el destino.** Usar el expediente de
PRR-701/702 para registrar identificadores y referencias, sin valores de credenciales.

| Componente | Información que debe quedar registrada |
| --- | --- |
| API y PostgreSQL | URL de staging, responsable y referencia del proyecto aislado. Identificar por separado las referencias de `DATABASE_URL` para la aplicación y `DIRECT_URL` para migraciones y restauración. Registrar cómo se verifica que ambas apuntan al proyecto esperado. |
| Admin Web y aplicaciones móviles | URL de Admin Web, orígenes permitidos de staging y referencias de las builds internas de ambas apps. Confirmar que las tres superficies usan la misma API aislada. |
| Sesiones y proveedores | Referencias de secretos de JWT y sesiones separadas de producción. Identificar cuenta, webhook y destino de correo de pruebas, y confirmar que el proveedor de pagos opera en sandbox. |
| Artefacto y recuperación | Registro de imagen, SHA, digest, SBOM y escaneo. Identificar el destino desechable donde se verificará la restauración y el responsable de registrar sus resultados. |

**Bloqueo de arranque para el ensayo con pagos.** La [configuración de la API](../../backend/src/config/env.js)
exige una clave Stripe live cuando `NODE_ENV=production`. Usar otro valor hoy
desactiva controles dependientes de producción, incluido el atributo `Secure` de la
cookie administrativa. Antes de activar staging, verificar un modo de despliegue
que conserve los controles de API y cookies, exija credenciales Stripe de prueba
y rechace credenciales live en staging. Vincular al expediente PRR-701/702 la CI
del SHA que pruebe ambos casos y el rechazo de claves de prueba en producción.

**Ensayo de reserva.** Preparar un único caso con un cliente, un profesional habilitado,
un servicio y una cuenta administrativa sintéticos. Platform debe identificar el destino
aislado y el manifiesto del candidato (PRR-701/702). Release debe confirmar los prerrequisitos
de los recorridos PRR-602/603, la verificación administrativa de PRR-604 y el proveedor de
pago sandbox de PRR-504 antes de ejecutar.

1. Crear la reserva desde la app cliente y registrar su ID y el estado de pago que requiera el flujo.
2. Aceptarla, iniciarla y completarla en la app profesional. Comprobar el estado devuelto
   por la API y visible en la app cliente. Verificar el rechazo de una transición fuera de orden.
3. Localizar la misma reserva en Admin Web. Comprobar el estado de la reserva y contrastar
   el estado del pago sandbox con la API administrativa mediante una cuenta autorizada.
4. Adjuntar al ensayo el SHA y digest, los IDs sintéticos, la correlación por superficie y
   los resultados por paso. El [registro PRR-105](../releases/2026-09-16-prr-105-api-v1-contract.md#delivery-evidence-for-booking-and-administrative-audit)
   enlaza la evidencia de contrato y CI que precede a este ensayo.

- Solicitar decisiones de edge y confianza territorial (PRR-201), privacidad/legal (PRR-302/305)
  y almacenamiento privado (PRR-403). Confirmar responsables y fechas de revisión.
- Preparar criterios E2E, datos sintéticos y selección de plataforma de pruebas. Maestro para móvil
  y Playwright para web son candidatos. Incorporarlos cuando el bloque y sus dependencias estén autorizados.
- Preparar topología, inventario de secretos, estrategia de artefactos y procedimiento de restauración.
  Con contratos estables, PRR-701/702 puede avanzar junto a los recorridos. Sus resultados habilitan
  las pruebas que requieren staging real, incluidas las de PRR-207.
- Preparar las decisiones de F11 con Platform, Security, Legal y Release. La implementación PRR-705
  espera el cierre de PRR-1 a PRR-6 y la aprobación aplicable del [ADR 0007](../adr/0007-production-control-plane.md).

## Cómo dirigir la ejecución

En modo autónomo, el conductor toma la siguiente tarea habilitada dentro del alcance
autorizado, aplica o delega el cambio, ejecuta las pruebas, sigue la CI y recupera fallos
reversibles sin pedir confirmaciones rutinarias. Si un bloque exige una aprobación humana
o evidencia externa, registra la condición de desbloqueo y avanza cualquier tarea
independiente autorizada. La autonomía se aplica durante la ejecución activa de Codex.
La autorización del operador incluye integrar PR de la rama de entrega cuando el SHA
esperado tiene CI verde, se cumplen las revisiones exigidas y GitHub admite la
integración mediante sus protecciones ordinarias. Verificar después el SHA integrado.

1. Al iniciar cada bloque, comprobar rama, SHA, CI y evidencia previa. Elegir el primer trabajo
   autorizado cuyas dependencias estén satisfechas. Registrar responsable, revisor, entorno,
   alcance, pruebas, rollback y decisión pendiente en el ítem PRR correspondiente.
2. Dividir el bloque por dominio o contrato, con una prueba observable por entrega. Ejecutar primero
   checks focalizados. Cerrar con CI completa para el SHA exacto, enlace al PR o referencia de entrega
   y registro de release. Si hay evidencia ausente, caducada o fallida, mantener abierto el ítem.
3. Registrar cada bloqueo con evidencia, responsable y condición de desbloqueo. Mientras se resuelve,
   avanzar trabajo independiente autorizado. Tomar Git y CI como autoridad para reflejar el estado en Notion.
4. Aplicar el [routing](../agent-governance/MODEL_ROUTING.md) en velocidad Standard. Luna para inventario
   y evidencia mecánica, **GPT-6.1 Terra** para implementación acotada y verificación, Sol para diseño
   y revisión DEEP, Astra para escalación excepcional. Registrar el modelo realmente utilizado.

### Subagentes

Las definiciones del proyecto viven en [`.codex/agents`](../../.codex/agents).
En una sesión de Codex que cargue los agentes del proyecto, pide al agente principal que use
`preproduction_orchestrator` para coordinar el bloque autorizado. Ejemplo:

> Usa preproduction_orchestrator para dirigir el bloque autorizado de PRR-105. Delega el
> inventario de CI a prr_evidence y devuelve el SHA verificado y los bloqueos.

| Agente | Modelo | Esfuerzo inicial | Responsabilidad |
| --- | --- | --- | --- |
| `preproduction_orchestrator` | GPT-6.2 Sol | Medio | Priorizar, asignar alcance y consolidar evidencia |
| `prr_evidence` | GPT-6 Luna | Bajo | Inventario, CI y registros verificables en solo lectura |
| `prr_implementer` | GPT-6.1 Terra | Medio | Implementación acotada y pruebas focalizadas |
| `prr_reviewer` | GPT-6.2 Sol | Medio | Revisión técnica DEEP y hallazgos en solo lectura |

El [límite del proyecto](../../.codex/config.toml) admite hasta tres subagentes abiertos
por sesión, incluido el orquestador si se invoca como subagente. El orquestador empieza
con un trabajador y usa un segundo sólo para trabajo independiente. Usa velocidad
Standard cuando esté disponible y comunica cualquier sustitución por un modelo más caro
antes de ejecutarla. Astra requiere una escalación justificada y aprobación del operador.

Delegar sólo cuando esté autorizado y aporte valor. El coordinador conserva la decisión de
entrega y solicita la aprobación humana cuando corresponda.

## Condición de salida

El responsable de release debe poder identificar el SHA, el digest y el entorno del candidato,
ver CI y auditorías completas, reproducir las comprobaciones de migración y E2E, y consultar los
resultados de restauración, observabilidad y rollback. Registrar qué ensayos se hicieron, con qué
flags y quién aceptó la evidencia. PRR-803/804 utilizan ese expediente para la auditoría final y
el manifiesto de release. PRR-805 registra la decisión humana sobre el lanzamiento.
