# Backlog de tareas por fase — Pipeline Operations Platform

Backlog ejecutable para construir con Claude Code. Cada tarea es una **unidad independiente**: tiene objetivo, archivos que toca, dependencias y criterio de "listo". Pensado para entregarse **una por una**.

> Cómo usarlo: copia el bloque de una tarea, pásalo a Claude Code, verifica el criterio de aceptación, y recién ahí pasas a la siguiente. El orden respeta dependencias: no empieces una tarea sin tener cerradas las que lista en "Depende de".

Documentos de referencia que Claude Code debe tener a mano: `domain-model.ts`, `domain-rules.md`, `data-generator-spec.md`, `ux-design.md`.

Convención de IDs: `F{fase}-{n}`.

---

## FASE 0 — Fundaciones y datos

Objetivo: proyecto en pie, modelo de datos tipado, datos sintéticos cargados y app navegable. Al cerrar la fase no hay módulos aún, pero todo lo que viene se apoya en esto.

### F0-1 · Inicializar el proyecto
- **Objetivo:** Next.js (App Router) + TypeScript + Tailwind funcionando.
- **Toca:** raíz del repo, `app/layout.tsx`, `app/page.tsx`, config de Tailwind.
- **Depende de:** —
- **Aceptación:** `npm run dev` levanta una página en blanco con Tailwind activo; TypeScript en modo estricto sin errores.

### F0-2 · Tipos del dominio
- **Objetivo:** trasladar `domain-model.ts` al proyecto como fuente de verdad de tipos.
- **Toca:** `lib/domain/types.ts` (o `types/domain.ts`).
- **Depende de:** F0-1.
- **Aceptación:** todos los tipos del documento compilan; se exportan desde un único punto.

### F0-3 · Constantes del dominio
- **Objetivo:** centralizar los parámetros 🔧 de `domain-rules.md` (sección 7).
- **Toca:** `lib/domain/constants.ts`.
- **Depende de:** F0-2.
- **Aceptación:** todas las constantes de la tabla existen, tipadas, con comentario de unidad y uso.

### F0-4 · Lógica de conversiones volumétricas
- **Objetivo:** implementar las fórmulas de `domain-rules.md` sección 1 (API↔SG, densidad, corrección por temperatura, 15°C↔60°F).
- **Toca:** `lib/volumetrics/conversions.ts`.
- **Depende de:** F0-3.
- **Aceptación:** funciones puras; tests de ida y vuelta pasan (convertir y revertir = original ± epsilon); 10°API da SG 1.0.

### F0-5 · Lógica de balance volumétrico
- **Objetivo:** ecuación de balance y niveles de alerta (reglas 2).
- **Toca:** `lib/volumetrics/balance.ts`.
- **Depende de:** F0-2, F0-3.
- **Aceptación:** dado stock inicial + movimientos, calcula stock final, diferencia, porcentaje y nivel (OK/WARNING/CRITICAL) según tolerancias.

### F0-6 · Lógica de programación de mantención
- **Objetivo:** próxima intervención por calendario y por horas, estado de tarea y priorización (reglas 4).
- **Toca:** `lib/maintenance/scheduling.ts`.
- **Depende de:** F0-2, F0-3.
- **Aceptación:** calcula `nextDueDate`/`nextDueAtHours`; clasifica VENCIDA/PRÓXIMA/OK; ordena por score de criticidad.

### F0-7 · Lógica de umbrales de integridad
- **Objetivo:** evaluación de lectura catódica y detección de tendencia (reglas 5).
- **Toca:** `lib/integrity/thresholds.ts`.
- **Depende de:** F0-2, F0-3.
- **Aceptación:** clasifica una lectura en OK/WARNING/CRITICAL; detecta serie degradante de 3+ lecturas.

### F0-8 · Generador de datos sintéticos
- **Objetivo:** implementar `generateWorld()` según `data-generator-spec.md`.
- **Toca:** `lib/data/config.ts`, `lib/data/generate.ts`.
- **Depende de:** F0-4, F0-5, F0-6, F0-7 (usa esas lógicas para coherencia).
- **Aceptación:** `generateWorld()` devuelve un `PipelineWorld` completo; con misma `seed` produce el mismo mundo.

### F0-9 · Validador del mundo
- **Objetivo:** `validateWorld()` de la spec (integridad referencial, niveles, orden de pk, balances).
- **Toca:** `lib/data/validate.ts`.
- **Depende de:** F0-8.
- **Aceptación:** pasa sobre un mundo recién generado; falla a propósito si se corrompe un id de prueba.

### F0-10 · Mundo congelado (seed)
- **Objetivo:** generar una vez con seed fija y guardar `seed.json` para que la demo sea estable.
- **Toca:** `lib/data/seed.json`, script de generación.
- **Depende de:** F0-9.
- **Aceptación:** la app puede cargar el mundo desde el JSON; `validateWorld()` pasa sobre él.

### F0-11 · Store global y carga del mundo
- **Objetivo:** estado compartido (Zustand) que expone el mundo y la selección activa.
- **Toca:** `store/world.ts`, `hooks/useWorld.ts`.
- **Depende de:** F0-10.
- **Aceptación:** cualquier componente puede leer el mundo y la entidad seleccionada.

### F0-12 · Sistema de diseño y layout base
- **Objetivo:** header con navegación entre los 3 módulos, toggle de tema, tokens de color/tipografía (ux-design sección 1).
- **Toca:** `components/layout/`, `app/layout.tsx`, config de Tailwind (tema).
- **Depende de:** F0-1.
- **Aceptación:** se navega entre 3 rutas placeholder; el tema claro/oscuro cambia; colores semánticos definidos como tokens.

### F0-13 · Componentes compartidos base
- **Objetivo:** `KpiCard`, `StatusBadge`, `Panel`, `Tabs`, `Slider`, `Toggle`, `DataTable`, `Sparkline`, `TimeSeriesChart` (ux-design 1.3).
- **Toca:** `components/controls/`, `components/charts/`.
- **Depende de:** F0-12.
- **Aceptación:** cada componente renderiza con props de ejemplo en una página de prueba.

**Hito Fase 0:** app navegable, datos sintéticos cargados, toda la lógica de dominio testeada, componentes base listos. Nada vistoso aún, pero todo lo demás se construye rápido encima.

---

## FASE 1 — Cockpit (vista ancla)

Objetivo: el módulo más vistoso, funcionando. Es el que primero mostrarías.

### F1-1 · Hook de simulación de flujo
- **Objetivo:** loop con `requestAnimationFrame` que avanza el tiempo simulado y actualiza niveles según caudal (reglas 3 + `lib/simulation/flow.ts`).
- **Toca:** `lib/simulation/flow.ts`, `hooks/useSimulation.ts`.
- **Depende de:** F0-11.
- **Aceptación:** al correr, los niveles de los estanques cambian en el tiempo respetando capacidad (no desbordan ni quedan negativos).

### F1-2 · Diagrama de flujo (SVG)
- **Objetivo:** `FlowDiagram` con nodos (estanques/estaciones/destinos) y aristas (ductos) según ux-design 2.1.
- **Toca:** `components/cockpit/FlowDiagram.tsx`.
- **Depende de:** F0-13.
- **Aceptación:** se dibuja el layout del mundo; los nodos son clickeables.

### F1-3 · Gauge de estanque animado
- **Objetivo:** `TankGauge` que se llena/vacía y parpadea al 95% (alarma alto nivel).
- **Toca:** `components/cockpit/TankGauge.tsx`.
- **Depende de:** F1-1, F1-2.
- **Aceptación:** el relleno refleja el nivel simulado en vivo; borde parpadea sobre el umbral.

### F1-4 · Flujo animado en ductos
- **Objetivo:** punto de luz que viaja por la arista cuando hay movimiento activo, velocidad proporcional al caudal.
- **Toca:** `components/cockpit/FlowDiagram.tsx` (animación de aristas).
- **Depende de:** F1-1, F1-2.
- **Aceptación:** las aristas con movimiento muestran flujo animado; las inactivas, no.

### F1-5 · Controles de simulación
- **Objetivo:** barra play/pausa, velocidad (1x/10x/60x/600x), reset; reloj de sim en el header.
- **Toca:** `components/cockpit/SimControls.tsx`, header.
- **Depende de:** F1-1.
- **Aceptación:** los controles afectan la simulación; el reloj avanza según la velocidad.

### F1-6 · Panel de balance hora a hora
- **Objetivo:** `BalancePanel` que muestra entradas/salidas/Δstock usando `lib/volumetrics/balance.ts`.
- **Toca:** `components/cockpit/BalancePanel.tsx`.
- **Depende de:** F0-5, F1-1.
- **Aceptación:** el balance se actualiza con la simulación y marca descuadres fuera de tolerancia.

### F1-7 · KPIs del cockpit
- **Objetivo:** fila de `KpiCard` (recibido, entregado, cumplimiento, balance) — reglas 6.
- **Toca:** `components/cockpit/CockpitKpis.tsx`.
- **Depende de:** F0-13, F1-1.
- **Aceptación:** los KPIs reflejan el estado actual; el de cumplimiento usa la banda 95–105%.

### F1-8 · Widget de conversión interactiva
- **Objetivo:** input de volumen + temperatura + °API → salida a 15°C y 60°F.
- **Toca:** `components/cockpit/ConversionWidget.tsx`.
- **Depende de:** F0-4.
- **Aceptación:** los resultados coinciden con `lib/volumetrics/conversions.ts`.

### F1-9 · Panel lateral contextual
- **Objetivo:** muestra balance por defecto; al seleccionar un nodo, su detalle + botones de navegación cruzada (placeholder por ahora).
- **Toca:** `components/cockpit/ContextPanel.tsx`.
- **Depende de:** F1-6, F0-11.
- **Aceptación:** clic en estanque/equipo cambia el contenido del panel a su detalle.

### F1-10 · Ensamblar página Cockpit
- **Objetivo:** componer todo en `app/cockpit/page.tsx` según el wireframe.
- **Toca:** `app/cockpit/page.tsx`.
- **Depende de:** F1-2 … F1-9.
- **Aceptación:** la pantalla del cockpit luce y se comporta como el wireframe de ux-design 2.1.

**Hito Fase 1:** primer módulo completo y demostrable. Ya tienes algo que mostrar.

---

## FASE 2 — CMMS

Objetivo: gestión de activos sobre los mismos equipos del ducto.

### F2-1 · Árbol jerárquico de equipos
- **Objetivo:** `EquipmentTree` en el rail, Estación → categoría → equipo, con badge de estado.
- **Toca:** `components/maintenance/EquipmentTree.tsx`.
- **Depende de:** F0-11, F0-13.
- **Aceptación:** el árbol refleja la jerarquía del mundo; seleccionar un nodo emite la selección al store.

### F2-2 · KPIs de mantención
- **Objetivo:** vencidas, próximas, OT abiertas, equipos críticos.
- **Toca:** `components/maintenance/MaintenanceKpis.tsx`.
- **Depende de:** F0-6.
- **Aceptación:** los conteos coinciden con la lógica de scheduling.

### F2-3 · Tablero (tabla de equipos/tareas)
- **Objetivo:** `DataTable` con estado de mantención, ordenable, filas vencidas/próximas resaltadas; filtra por selección del árbol.
- **Toca:** `components/maintenance/MaintenanceBoard.tsx`.
- **Depende de:** F2-1, F0-6.
- **Aceptación:** ordena por criticidad/horas; el filtro del árbol funciona.

### F2-4 · Calendario de mantención
- **Objetivo:** vista mensual con tareas en su `nextDueDate` (las BY_HOURS en fecha estimada).
- **Toca:** `components/maintenance/MaintenanceCalendar.tsx`.
- **Depende de:** F0-6.
- **Aceptación:** cada tarea aparece en su día; se distinguen preventivas de las por horas.

### F2-5 · Vista de órdenes de trabajo
- **Objetivo:** lista de `WorkOrder` con estado, prioridad y barra de progreso.
- **Toca:** `components/maintenance/WorkOrderList.tsx`.
- **Depende de:** F0-13.
- **Aceptación:** filtrable por estado; el progreso es coherente con el estado.

### F2-6 · Ensamblar página CMMS (con tabs)
- **Objetivo:** componer rail + KPIs + tabs (Tablero/Calendario/Órdenes) en `app/maintenance/page.tsx`.
- **Toca:** `app/maintenance/page.tsx`.
- **Depende de:** F2-1 … F2-5.
- **Aceptación:** la pantalla se comporta como el wireframe de ux-design 3.1.

**Hito Fase 2:** segundo módulo completo, conectado a los mismos equipos del cockpit.

---

## FASE 3 — Integrity Map

Objetivo: cerrar el trazado completo del ducto con la vista de integridad.

### F3-1 · Trazado lineal del ducto (SVG)
- **Objetivo:** `PipelineMap` horizontal por pk con marcadores de estaciones/rectificadores/puntos, coloreados por AlertLevel.
- **Toca:** `components/integrity/PipelineMap.tsx`.
- **Depende de:** F0-7, F0-11.
- **Aceptación:** la línea va de pk inicial a final; cada marcador toma el color de su nivel; clickeable.

### F3-2 · KPIs de integridad
- **Objetivo:** conteo OK / warning / crítico.
- **Toca:** `components/integrity/IntegrityKpis.tsx`.
- **Depende de:** F0-7.
- **Aceptación:** los conteos coinciden con la evaluación de umbrales.

### F3-3 · Tabla de lecturas con tendencia
- **Objetivo:** `DataTable` de lecturas con potencial, nivel y `Sparkline`; columna de tendencia (↘ si degrada).
- **Toca:** `components/integrity/ReadingsTable.tsx`.
- **Depende de:** F0-7, F0-13.
- **Aceptación:** la tendencia marca degradación según reglas 5.3.

### F3-4 · Detalle de punto (gráfica con umbrales)
- **Objetivo:** panel con `TimeSeriesChart` del histórico del punto + líneas de umbral dibujadas.
- **Toca:** `components/integrity/ReadingDetail.tsx`.
- **Depende de:** F3-1.
- **Aceptación:** al seleccionar un punto se ve su serie con las líneas −0.850/−0.750 V.

### F3-5 · Ensamblar página Integridad
- **Objetivo:** componer todo en `app/integrity/page.tsx`.
- **Toca:** `app/integrity/page.tsx`.
- **Depende de:** F3-1 … F3-4.
- **Aceptación:** la pantalla se comporta como el wireframe de ux-design 4.1.

**Hito Fase 3:** los tres módulos existen y funcionan de forma independiente.

---

## FASE 4 — Integración entre módulos

Objetivo: que se sienta como una sola plataforma, no tres demos.

### F4-1 · Selección compartida entre módulos
- **Objetivo:** la entidad enfocada vive en el store y persiste al cambiar de módulo.
- **Toca:** `store/world.ts`, los tres `page.tsx`.
- **Depende de:** F1-10, F2-6, F3-5.
- **Aceptación:** seleccionar un equipo en un módulo lo deja pre-seleccionado al cambiar a otro.

### F4-2 · Página de detalle de equipo (cruce de dominios)
- **Objetivo:** `equipment/[id]` que agrega los tres ángulos (flujo, mantención, integridad) de una entidad + enlaces "ver en …".
- **Toca:** `app/equipment/[id]/page.tsx`.
- **Depende de:** F4-1.
- **Aceptación:** para un equipo dado muestra datos de los tres módulos y enlaza a cada vista.

### F4-3 · Navegación cruzada en cada módulo
- **Objetivo:** activar los botones "ver en Mantención/Integridad/Cockpit" que estaban como placeholder.
- **Toca:** paneles de detalle de los tres módulos.
- **Depende de:** F4-2.
- **Aceptación:** desde cualquier vista se salta a las otras con la entidad enfocada.

**Hito Fase 4:** la plataforma está unificada. Aquí ya es un proyecto redondo.

---

## FASE 5 — Pulido y entrega

Objetivo: dejarlo listo para mostrar a empresas.

### F5-1 · Estados de carga y vacío
- **Toca:** componentes con datos.
- **Depende de:** F4-3.
- **Aceptación:** skeletons al cargar; mensajes claros en tablas vacías/filtradas.

### F5-2 · Responsividad
- **Toca:** los tres módulos (drawer del árbol, diagrama scrollable, tablas a tarjetas).
- **Depende de:** F4-3.
- **Aceptación:** uso aceptable en tablet/móvil sin romperse.

### F5-3 · Suite de tests de dominio
- **Objetivo:** consolidar tests de `lib/` (conversiones, balance, scheduling, thresholds) + validador.
- **Toca:** `__tests__/`.
- **Depende de:** F0-4 … F0-9.
- **Aceptación:** `npm test` verde; cobertura de los casos clave de cada regla.

### F5-4 · README y material de portafolio
- **Objetivo:** README con descripción técnica, GIFs de cada módulo, decisiones de arquitectura y nota de datos sintéticos.
- **Toca:** `README.md`, `/docs`.
- **Depende de:** F5-1, F5-2, F5-3.
- **Aceptación:** un revisor entiende el proyecto sin ejecutarlo.

### F5-5 · Deploy en Vercel
- **Objetivo:** publicar la app.
- **Depende de:** F5-4.
- **Aceptación:** URL pública funcionando con el mundo congelado.

**Hito Fase 5:** proyecto terminado, desplegado y presentable.

---

## Resumen de hitos

| Fase | Resultado demostrable |
|------|------------------------|
| 0 | App navegable + datos + lógica testeada (sin UI vistosa) |
| 1 | **Cockpit** funcionando — primer "wow" |
| 2 | **CMMS** conectado a los mismos equipos |
| 3 | **Integrity Map** — trazado completo |
| 4 | Plataforma **unificada** (navegación cruzada) |
| 5 | Pulida, testeada y **desplegada** |

> Cada fase entrega algo presentable. Si paras en la 1, ya tienes un módulo lúcido; cada fase siguiente suma. Recomendación: cerrar bien la Fase 0 antes de tocar UI — es la que sostiene todo lo demás.

---

## Cómo entregar a Claude Code

1. Empieza por **F0-1** y avanza en orden; respeta las dependencias.
2. Pásale a Claude Code **una tarea a la vez** junto con los documentos de referencia.
3. Verifica el **criterio de aceptación** antes de pasar a la siguiente.
4. Las tareas de lógica pura (F0-4 a F0-9) conviene cerrarlas **con sus tests** antes de la UI: es lo que mantiene el proyecto sólido y es barato hacerlo temprano.
