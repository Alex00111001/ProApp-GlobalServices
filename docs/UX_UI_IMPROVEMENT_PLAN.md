# Plan independiente de mejora UI/UX móvil

## Propósito

Elevar la confianza, comodidad y facilidad de uso de las aplicaciones de cliente y profesional sin cambiar contratos de API, reglas de negocio, autorización, pagos ni políticas de mercado. Este plan es independiente del plan de implementación de plataforma: su alcance es exclusivamente la experiencia móvil y su evidencia de aceptación.

## Clasificación de la tarea

- Fase: transversal sobre las capacidades móviles existentes (F1-F10)
- Dominio: Core Marketplace / experiencia cliente y profesional
- Riesgo: MEDIUM
- Capability tier / modelo: STANDARD / modelo seleccionado por el operador
- Skills: `repo-auditor`, `frontend`, `professional-system`, `testing`, `browser:control-in-app-browser`
- Escalación: cambios de contrato, identidad, pagos, reglas de mercado, navegación autorizada o dos fallos no mecánicos de verificación
- Verificación requerida: typecheck de ambas apps, pruebas del cliente, inspección visual web, estados responsive y revisión de accesibilidad

## Diagnóstico de partida

### Controles conformes

- Navegación separada para cliente y profesional mediante Expo Router.
- Credenciales conservadas mediante el mecanismo seguro existente.
- Cliente localizado en español, inglés y portugués.
- Los flujos profesionales muestran aprobación y verificación como estados informativos; la autoridad permanece en el backend.
- Las vistas ya disponen de estados básicos de carga, error y vacío.

### Hallazgos prioritarios

1. La jerarquía visual es genérica: títulos, superficies y acciones tienen pesos muy similares y no conducen la mirada.
2. El cliente y el profesional parecen productos distintos por diferencias de tokens, radios, elevación y navegación.
3. Las tarjetas del cliente destinan demasiado espacio a metadatos y no comunican confianza de forma inmediata.
4. El panel profesional comprime tres métricas en una sola fila, reduciendo legibilidad en pantallas estrechas.
5. Algunos controles interactivos no garantizan un objetivo táctil mínimo de 44 puntos ni comunican claramente su estado.
6. Hay colores de estado y superficies repetidos de forma literal, lo que facilita divergencias y dificulta revisar contraste.
7. Varias vistas profesionales están excesivamente compactadas en código; esto eleva el riesgo de regresión visual y de accesibilidad.

## Principios de diseño

- **Confianza antes que decoración:** azul profundo, superficies cálidas, mensajes verificables y estados explícitos.
- **Una acción principal por contexto:** búsqueda/reserva para cliente; agenda/estado para profesional.
- **Ergonomía móvil:** objetivos táctiles de al menos 44 puntos, separación clara, contenido respirable y navegación estable.
- **Divulgación progresiva:** filtros y detalles secundarios aparecen cuando se solicitan.
- **Consistencia semántica:** éxito, advertencia, error e información utilizan los mismos significados en ambas apps.
- **Accesibilidad:** contraste AA en texto principal, etiquetas accesibles, estados anunciables, escalado de texto y layouts resistentes.
- **Política en servidor:** moneda, país, identidad, aprobación y reglas territoriales continúan siendo datos autoritativos del backend.

## Sistema visual objetivo

- Fondo de aplicación ligeramente cálido para reducir fatiga y separar superficies.
- Azul de marca con contraste AA para acciones y navegación.
- Azul tinta para encabezados de confianza y énfasis profesional.
- Verde azulado reservado para estados positivos y verificados.
- Radio consistente de 12-24 puntos según jerarquía.
- Sombras sutiles acompañadas por borde; nunca como único indicador de agrupación.
- Escala tipográfica clara: eyebrow 11-12, cuerpo 14-16, sección 18-20, título 28-32.

## Entregas

### Cliente

- Sistema de tokens ampliado y verificable.
- Inicio con encabezado de confianza, acceso inmediato a búsqueda, prueba social y categorías escaneables.
- Tarjetas profesionales con mejor jerarquía, verificación visible y objetivos táctiles adecuados.
- Login con encuadre de seguridad y formulario más cómodo.
- Navegación inferior elevada y estados activo/inactivo claros.
- Perfil, búsqueda y reservas alineados al mismo lenguaje visual.

### Profesional

- Tokens alineados con la marca común, manteniendo un tono operativo.
- Panel con cabecera de estado y métricas legibles en pantallas estrechas.
- Reservas con filtros operativos y tarjetas más escaneables.
- Perfil con progreso de verificación, agrupación y acciones claras.
- Login y navegación inferior coherentes con el producto cliente.

## Verificación y criterios de aceptación

1. `npm run verify:mobile-client` finaliza correctamente.
2. `npm run verify:mobile-professional` finaliza correctamente.
3. Las acciones principales y controles de icono alcanzan 44 puntos como mínimo.
4. Texto blanco sobre color primario y texto principal sobre fondo cumplen WCAG AA para texto normal.
5. Inicio, login, reservas y perfil no presentan recortes a 320, 390 y 768 puntos de ancho en render web.
6. Carga, error y vacío conservan una acción o instrucción clara.
7. La navegación mantiene rutas, autenticación y contratos existentes.
8. Español, inglés y portugués continúan resolviendo las nuevas cadenas del cliente.

## Rollback

Los cambios son exclusivamente de frontend y no requieren migración ni feature flag. El rollback consiste en revertir los commits de tokens/componentes/vistas; no hay datos ni contratos que restaurar.

## Fuera de alcance

- Cambios de API, autenticación, autorización o modelo de datos.
- Interpretación o incorporación de reglas nacionales/mercado.
- Lógica de pagos, comisiones o saldos.
- Activación de producción, publicación en tiendas o cambios de dependencias.

## Resultado de ejecución — 2026-09-11

### Implementado

- Tokens visuales armonizados para cliente y profesional: color, superficie, borde, radio, sombra, ancho de contenido y objetivo táctil.
- Navegación inferior coherente, con iconografía activa/inactiva, mayor altura y ocultación al abrir el teclado.
- Inicio del cliente reorganizado alrededor de búsqueda, confianza, categorías y selección profesional.
- Tarjeta profesional rediseñada para priorizar identidad, valoración, tarifa, experiencia y verificación.
- Login del cliente y del profesional reforzados con jerarquía, señal de acceso seguro y formularios ergonómicos.
- Perfil y reservas del cliente alineados al nuevo sistema visual.
- Panel profesional reorganizado con ingreso destacado, métricas legibles y agenda prioritaria.
- Reservas profesionales con filtros por estado, recuentos y tarjetas operativas más escaneables.
- Perfil profesional alineado a la jerarquía de confianza y progreso de verificación.
- Fallback web profesional sin persistencia insegura: la restauración web permanece sin sesión cuando SecureStore no está disponible.
- Nuevas cadenas del cliente disponibles en español, inglés y portugués.

### Evidencia ejecutada

- `npm run verify:mobile-client`: PASS; TypeScript sin errores y 2 suites/4 pruebas aprobadas.
- `npm run verify:mobile-professional`: PASS; TypeScript sin errores.
- `npx expo export --platform android` en cliente: PASS; bundle Android generado.
- `npx expo export --platform android` en profesional: PASS; bundle Android generado.
- `git diff --check`: PASS; sin errores de whitespace (solo avisos de normalización LF/CRLF del entorno).
- Contraste automatizado: blanco/primario y texto principal/fondo cumplen ratio mínimo 4.5:1.
- Ergonomía automatizada: token de objetivo táctil mínimo de 44 puntos.
- Revisión visual profesional en 320 × 700, 390 × 844 y 768 × 900: sin desbordamiento horizontal; scroll completo en compacto y contenido centrado/limitado en tablet.

### Evidencia pendiente de dispositivo

La previsualización web del cliente no forma parte de sus dependencias instaladas (`react-native-web` no está declarado). No se añadió una dependencia fuera de alcance. El bundle Android, typecheck y pruebas están verdes, pero la validación visual final del cliente en hardware/emulador y con datos reales debe formar parte del gate de publicación en tienda.
