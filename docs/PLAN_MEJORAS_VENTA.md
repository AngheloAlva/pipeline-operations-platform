# Plan de construcción — Mejoras para vender

### Qué construir en `pipeline-operations-platform` para la demo que vende OTC 360 → web

> **Par de este documento:** el *por qué* y la estrategia comercial están en `PROPUESTA_ATERRIZADA.md` (misma carpeta). Este documento es el *qué* y el *cómo*: componentes, archivos, modelo de datos, criterios de aceptación. Pensado para ejecutarse tarea por tarea (misma mecánica que `BACKLOG.md`).
>
> **Convención de IDs:** `MV-{n}` (Mejoras para Venta). Cada tarea: objetivo · toca · depende de · aceptación.
>
> **v2 del plan:** se corrige el encuadre. La **captura de datos** era un pedido explícito del cliente ("quiero ver cómo se verían algunos de los tantos ingresos de datos") y **hoy no existe en absoluto** en el proyecto. Pasa de "costura de producción" a **frente de primera clase** (Frente B), con especificación propia.

---

## 1. Principio rector de la demo

La demo tiene **dos mitades**, y ambas hay que mostrarlas:

1. **La visualización ("el después").** Cómo se ven el Excel y el Power BI cuando ya viven en web: el diagrama de crudo vivo, el balance, el descuadre, las páginas de reporte. Esta mitad corre sobre los **datos sintéticos** que ya genera el proyecto (`lib/data/generate.ts` → `seed.json`), extendidos para imitar la escala de los reportes reales.
2. **La captura ("cómo se ingresa").** Cómo se vería el operador **ingresando** los datos que hoy tipea en Excel — pedido explícito del cliente. Esto **no existe hoy** y hay que construirlo (Frente B). No requiere backend: la captura escribe al **mundo en memoria**, de modo que lo ingresado **se refleja al instante** en el diagrama, el balance y el descuadre. Ese es el mayor "wow" de la demo: *ingresas una vez y aparece en todos lados.*

Lo que la demo **no** hace todavía: conectarse a OTC 360, SCADA o al Excel reales (eso es producción, §9). La captura de la demo es la **experiencia de ingreso** con validación, identidad y modelo de enmienda — sobre datos sintéticos, escribiendo a estado local.

Tres restricciones de diseño que **no se negocian** (del sistema de diseño ya existente en `globals.css` y de la propuesta):

1. **Dark-first, "sala a las 3 AM".** Tema oscuro por defecto (grafito neutro), tipografía grande, alertas distinguibles sin leer, cero ambigüedad. Vale especialmente para los formularios de captura: se llenan de noche, cansado, con apuro.
2. **Disciplina de color semántica ya definida:** `--status-ok` (verde), `--status-warning` (ámbar), `--status-critical` (rojo), `--status-flow` (cyan). Nunca colores fuera de tokens; nunca `var()`/hex en `className`.
3. **Lógica pura en `lib/` con test.** Cálculos y reglas de validación nuevas van como funciones puras testeables, no dentro de componentes.

---

## 2. Estado actual — lo que YA existe (no reconstruir)

| Ya construido | Dónde | Sirve para |
|---|---|---|
| Modelo de dominio completo | `lib/domain/types.ts` | Base de todo |
| Generador + mundo congelado | `lib/data/generate.ts`, `seed.json` | Datos de demo |
| Simulación de caudal + niveles vivos | `store/simulationStore.ts`, `hooks/useSimulationLoop.ts` | Estanques que respiran |
| Cockpit (command deck) | `app/cockpit/page.tsx` | Contenedor del hero y de la captura |
| Esquemático abstracto por km | `components/cockpit/FlowDiagram.tsx` | Base parcial del hero (§5) |
| Balance horario | `components/cockpit/BalancePanel.tsx`, `lib/volumetrics/balance.ts` | Frentes B y C |
| Cumplimiento por cargador (waterfall) | `components/cockpit/WaterfallChart.tsx` | Frentes C y D |
| Conversión 15°C↔60°F | `lib/volumetrics/conversions.ts` | Régimen de custodia y validación de captura |
| CMMS completo | `components/maintenance/*`, `lib/maintenance/*` | Frente E |
| Mapa de integridad por pk | `components/integrity/*`, `lib/integrity/*` | Esquemático por KP |
| Navegación cruzada `?focus=` | `lib/focus/*`, `hooks/useFocusSync.ts` | Drill entre vistas |
| Sistema de diseño "Sala de Control" | `app/globals.css` | Todo |
| **Captura de datos** | — | **No existe. Frente B.** |

**Conclusión:** la visualización reusa ~70% de lo existente. La **captura se construye de cero**, pero se apoya en el modelo de dominio y en los stores ya presentes.

---

## 3. Los cinco frentes de venta (priorizados)

| Frente | Qué vende | Estado base | Esfuerzo |
|---|---|---|---|
| **A — Hero: Diagrama de Movimiento de Crudo** | La pantalla que ya gustó, ahora viva | `FlowDiagram` abstracto existe; falta la versión ilustrativa | Medio-Alto |
| **B — Captura de datos operacional** ⭐ *(pedido del cliente)* | "Así se ingresa: una vez, validado, y aparece en todos lados" | **No existe** | **Alto (el corazón)** |
| **C — Balance & descuadre binacional OTA↔OTC** | El número que dos países concilian | `BalancePanel` + `balance.ts` existen; falta lo binacional | Medio |
| **D — Reporte vivo (absorber el BI)** | Dejar de depender del BI mensual | Waterfall existe; faltan las páginas | Medio |
| **E — Equipos (CMMS conectado)** | "La hora que ya anotas te avisa la mantención" | Todo existe; falta exhibirlo | Bajo |

A y B son **inseparables en la demo**: la captura (B) alimenta el hero (A) en vivo. Ese vínculo es el argumento central.

---

## 4. Cambios transversales al modelo de datos y al generador

Van en `lib/domain/types.ts`, `lib/data/generate.ts` y sus tests.

### 4.1 Punto de medición de custodia (habilita el descuadre binacional — Frente C)
Agregar entidad `CustodyDifference` (Puerto Hernández/OTA vs Terminal Concepción/OTC por cargador, diaria/mensual/YTD):
```ts
export interface CustodyDifference {
  id: string; period: string; shipperId: string;
  originVolM3: number;   // Puerto Hernández (OTA), GSV 60°F
  destVolM3: number;     // Terminal Concepción (OTC), GSV 60°F
  diffM3: number; diffPct: number;
}
```
Lógica pura: `lib/volumetrics/custody.ts` (+test).

### 4.2 Topología canónica del hero (Frente A)
Asegurar en el mundo nodos nombrados con `tag` estable: ingresos OTA (OldelVal, VMON, Activo YPF), T-101/T-102 (15°C), múltiple/válvula, T-6010/20/30 (60°F), Refinería Bío Bío, Terminal San Vicente, Buque.

### 4.3 Identidad y captura (Frente B) — **lo nuevo importante**
```ts
/** Persona de la dotación del turno (5 en sala, no los 20 usuarios). */
export interface Operator { id: string; name: string; initials: string; /* pin: solo mock/servidor */ }

/** Estación de trabajo física (sesión permanente, nunca un login). */
export interface Workstation { id: string; label: string; } // p.ej. "SALA-OPS-PC1"

/** Dotación declarada al inicio del turno (roster + handover). */
export interface ShiftRoster { id: string; workstationId: string; operatorIds: string[]; startedAt: string; }

/** Novedad de turno estructurada (reemplaza el texto libre de Informe_diario). */
export interface ShiftLogEntry {
  id: string; timestamp: string; type: string; description: string;
  stationId?: string; authorId: string; workstationId: string;
}

/** Envoltura de enmienda (modelo libro contable) aplicable a cualquier registro capturado. */
export interface CaptureMeta {
  authorId: string; enteredAt: string; workstationId: string;
  supersedesId?: string;   // apunta al registro que corrige
  previousValue?: unknown;  // valor anterior, para la traza
}
```
Los registros operacionales capturables (`Movement`, lectura de estanque, `PumpRun`) llevan `CaptureMeta`. **Nunca se sobrescribe**: corregir crea un registro nuevo con `supersedesId`.

### 4.4 Series de reporte (Frente D)
Series de 12 meses para: `VolumeTarget` (verificar cobertura), `CustodyDifference`, y tres entidades *report-only*: `PipelineStoppage` (responsable OTA/OTC/Ambos), `EmissionEntry` (GEI por alcance), `ClosingComment` (por área).

### 4.5 Estado por nodo (Frentes A y B)
`lib/domain/nodeStatus.ts` → `resolveNodeStatus(world, nodeId): OK | PERMIT | LOTO | ALERT`, combinando `Equipment.isOperational`, OT vencidas y `CathodicReading.level`. Sembrar 1–2 estados no-OK.

---

## 5. Especificación del Hero — Diagrama de Movimiento de Crudo (Frente A)

Hoy el cockpit tiene `FlowDiagram` = esquemático **abstracto** (círculos sobre eje-km + tarjetas de estanque). El BI página 3 y tu test SVG son un diagrama **ilustrativo** de topología fija. Son complementarios; la demo necesita el ilustrativo como hero.

**Arquitectura:** componente nuevo `components/cockpit/CrudeMovementDiagram.tsx` (no reemplaza `FlowDiagram`, que queda como "esquemático técnico por km"). Layout ilustrativo fijo en `lib/diagrams/heroLayout.ts` (puro, patrón de sizing ADR-7); datos vivos de los stores existentes; reutiliza `TankGauge` (niveles) y el patrón `PipeEdge` (flujo animado).

**Los 6 upgrades sobre tu test:** (1) respira, no ilustra — niveles y flujos reales; (2) salto de custodia explícito (15°C OTA izquierda / 60°F OTC derecha); (3) chip de descuadre OTA↔OTC en la frontera, clic → Diferencias; (4) nodos clickeables → historial (`selectEntity` + `?focus=`); (5) estado por nodo (`resolveNodeStatus`: gris/ámbar/rojo/cyan); (6) tokens de diseño, dark-first, legible de lejos.

**Vínculo con Frente B:** cuando el operador captura (B), el hero se actualiza en vivo. Ese es el momento estelar de la demo.

**Aceptación:** topología real sobre seed; estanques animan; tramos activos animan; chip de descuadre coherente y navegable; nodos clickeables; ≥1 nodo no-OK; legible en oscuro; solo tokens.

---

## 6. Especificación de la Captura de datos (Frente B) — pedido del cliente

**Contexto.** El cliente pidió explícitamente **ver cómo se verían los ingresos de datos** que hoy hace en Excel. Hay muchos (nivel de estanque, movimientos, flujómetros, horas de bomba, novedades, buque, presión/combustible, caudales, dotación). **No se construyen todos**: se construyen **flujos representativos** que demuestran el modelo completo de captura, y se deja el resto como "mismo patrón, más formularios".

### 6.1 Los flujos de captura a construir para la demo
| # | Flujo | Reemplaza (Excel) | Qué demuestra |
|---|---|---|---|
| 1 | **Lectura de estanque / movimiento** *(flagship)* | `Mov_tk`, `Cont_vol_diario` | "Un dato, muchos usos": alimenta hero + balance + descuadre en vivo, con validación al ingreso |
| 2 | **Novedad de turno estructurada** | `Informe_diario` (texto libre) | Identidad + handover: quién, cuándo, qué tipo — no más texto suelto |
| 3 | **Horas de bomba** *(si alcanza)* | `HRS_BBAS_Agitadores` | Reciprocidad: la hora ingresada dispara la mantención (Frente E) |

> Un cuarto candidato barato y vistoso: **declarar la dotación del turno** (roster), que además es el cimiento de la identidad. Va como paso previo (6.3), no como formulario aparte.

### 6.2 Principios de la experiencia de ingreso
- **Formularios grandes, pocos campos, defaults sensatos**, dark-first (se llenan de noche, con apuro). Teclado y touch.
- **Validación AL INGRESO** (no en un reporte posterior). Reglas puras en `lib/capture/validate.ts` usando las constantes de dominio ya existentes:
  - Rango/plausibilidad: un nivel no puede superar `capacityM3`; una diferencia fuera de `BALANCE_TOLERANCE_WARN` se marca; un movimiento que sobrellenaría un estanque se bloquea.
  - **Bloqueo duro** (dato imposible) vs **advertencia suave** (dato inusual pero posible) — con mensaje claro del *por qué*. El costo de un error atajado aquí son 3 segundos; después de la rotación, una semana (ver propuesta).
- **Identidad por acción (estación + PIN):**
  - La sesión de la **estación** es permanente (`SALA-OPS-PC1`); nunca se ve un login.
  - Cada acción que compromete un dato pide **PIN** (~2–5 s).
  - El selector de persona cuelga de la **dotación declarada** del turno (5 nombres, no 20).
  - Cada registro estampa **estación + actor + timestamp**.
  - La resolución va detrás de **una sola función** `resolveActor(workstation, credential) → Operator` en `lib/capture/identity.ts` (mock en la demo; servidor en producción). *Diseño a prueba de futuro: si mañana hay control de acceso real, se cambia la entrada sin tocar nada más.*
- **Modelo libro contable (enmienda, jamás sobrescritura):** corregir crea un **registro nuevo** que apunta al anterior (`supersedesId`, `previousValue`, autor, timestamp). La traza es visible. `lib/capture/ledger.ts`.
- **Propagación inmediata:** al confirmar, se aplica al **mundo en memoria** (`store/captureStore.ts`) y el hero + balance + descuadre + reporte lo reflejan al instante, en la misma sesión.

### 6.3 Componentes y archivos (nuevos)
- Ruta/superficie: `app/captura/…` **o** un panel/drawer de captura invocable desde el cockpit (recomendado: drawer, para que el efecto en el hero se vea sin cambiar de pantalla).
- `components/capture/ShiftRosterBar.tsx` — declarar dotación del turno.
- `components/capture/CaptureDrawer.tsx` — contenedor con selector de tipo de ingreso.
- `components/capture/TankReadingForm.tsx`, `MovementForm.tsx`, `ShiftNoteForm.tsx`, `PumpRunForm.tsx`.
- `components/capture/PinPrompt.tsx` — identidad por acción.
- `components/capture/AmendmentTrail.tsx` — traza de enmiendas de un registro.
- `lib/capture/validate.ts`, `lib/capture/identity.ts`, `lib/capture/ledger.ts` (todos puros, con test).
- `store/captureStore.ts` — aplica commits al mundo y mantiene el libro/auditoría.

### 6.4 Aceptación (Frente B)
- Se puede **declarar la dotación** del turno (5 personas) sobre una estación (`SALA-OPS-PC1`).
- Se captura una **lectura/movimiento**; un valor inválido se **bloquea o advierte al ingreso** con mensaje claro; el commit válido pide **PIN**; el registro estampa estación + actor + timestamp.
- El valor confirmado **actualiza el hero + balance + descuadre en vivo**, en la misma sesión.
- Una **corrección** crea un registro nuevo que referencia al anterior (traza visible); nunca sobrescribe.
- Existe al menos la **novedad de turno estructurada** además de la lectura/movimiento.
- Dark-first, tipografía grande, sin colores fuera de tokens.

---

## 7. Backlog ejecutable

**Base de datos/dominio**
- **MV-1 · CustodyDifference (modelo + lógica).** Toca: `lib/domain/types.ts`, `lib/volumetrics/custody.ts` (+test). Dep: —.
- **MV-2 · Topología canónica en el generador.** Toca: `lib/data/generate.ts`, `lib/data/validate.ts`. Dep: —.
- **MV-3 · Modelo de identidad + captura (tipos).** Toca: `lib/domain/types.ts` (Operator, Workstation, ShiftRoster, ShiftLogEntry, CaptureMeta). Dep: —.
- **MV-4 · Series de reporte + custody en seed.** Toca: `lib/data/generate.ts`, `seed.json`. Dep: MV-1, MV-2. Acep: 12 meses de series; validador pasa.
- **MV-5 · Estado por nodo.** Toca: `lib/domain/nodeStatus.ts` (+test), seed con estados no-OK. Dep: MV-2.

**Frente B — Captura (el corazón)**
- **MV-6 · Validación de captura (pura).** Toca: `lib/capture/validate.ts` (+test). Dep: MV-3. Acep: rango/plausibilidad con constantes de dominio; distingue bloqueo duro vs advertencia; tests por regla.
- **MV-7 · Identidad por acción (mock).** Toca: `lib/capture/identity.ts` (+test). Dep: MV-3. Acep: `resolveActor(workstation, credential)` resuelve contra la dotación; PIN incorrecto rechaza; una sola función de entrada.
- **MV-8 · Libro contable / enmienda.** Toca: `lib/capture/ledger.ts` (+test). Dep: MV-3. Acep: corregir genera registro nuevo con `supersedesId`/`previousValue`; nunca muta el anterior.
- **MV-9 · captureStore.** Toca: `store/captureStore.ts` (+test). Dep: MV-6, MV-7, MV-8. Acep: aplica un commit al mundo en memoria y expone la traza; el `simulationStore`/selectores lo ven.
- **MV-10 · UI de dotación + drawer de captura.** Toca: `components/capture/ShiftRosterBar.tsx`, `CaptureDrawer.tsx`, `PinPrompt.tsx`. Dep: MV-9. Acep: declarar turno; abrir drawer; PIN al confirmar.
- **MV-11 · Formularios de captura (lectura/movimiento + novedad).** Toca: `components/capture/TankReadingForm.tsx`, `MovementForm.tsx`, `ShiftNoteForm.tsx`, `AmendmentTrail.tsx`. Dep: MV-10. Acep: los tres criterios de §6.4 (validación al ingreso, propagación en vivo, enmienda visible).

**Frente A — Hero**
- **MV-12 · Layout ilustrativo puro.** Toca: `lib/diagrams/heroLayout.ts` (+test). Dep: MV-2.
- **MV-13 · Componente `CrudeMovementDiagram`.** Toca: `components/cockpit/CrudeMovementDiagram.tsx`. Dep: MV-12, MV-5. Acep: criterios de §5.
- **MV-14 · Montar hero + captura en el cockpit.** Toca: `app/cockpit/page.tsx` (hero arriba; `FlowDiagram` a secundario; botón/atajo de captura que abre el drawer). Dep: MV-13, MV-11. Acep: capturar desde el cockpit y ver el hero actualizarse.

**Frente C — Balance & descuadre binacional**
- **MV-15 · Panel de descuadre binacional.** Toca: `components/cockpit/CustodyDiffPanel.tsx`. Dep: MV-1, MV-4. Acep: tabla por cargador (origen vs destino, dif, %, día/mes/YTD) + waterfall de diferencias.

**Frente D — Reporte vivo**
- **MV-16 · Sección Reportes.** Toca: `app/reportes/…`, `components/layout/NavLinks.tsx`. Dep: MV-4.
- **MV-17 · Allocation + Ppto vs Real.** Toca: `app/reportes/*`, reutiliza `WaterfallChart` + donut + comparativo. Dep: MV-16.
- **MV-18 · Diferencias, Detenciones, Medio Ambiente, Cierres.** Toca: `app/reportes/*`. Dep: MV-4, MV-15.

**Frente E — Equipos**
- **MV-19 · Exhibir horas→mantención + cross-nav desde el hero.** Toca: verificar `app/equipment/[id]`, cross-nav desde el hero y desde la captura de horas. Dep: MV-13, MV-11.

**Cierre**
- **MV-20 · Pulido demo + guion.** Toca: estados vacíos, textos, docs. Dep: todo. Acep: recorrido del guion (§9) sin baches; tests verdes; build limpio.

---

## 8. Roadmap por slices demoables

1. **Slice "Hero vivo"** (MV-1,2,5,12,13,14): el diagrama de crudo respira, con descuadre y estados.
2. **Slice "Así se ingresa" ⭐** (MV-3,6–11 + integración con el hero): el operador declara turno, captura una lectura con validación, firma con PIN, y el hero/balance/descuadre se mueven en vivo; corrige y se ve la enmienda. **Es el pedido explícito del cliente y el corazón de la venta.**
3. **Slice "El número binacional"** (MV-15): descuadre OTA↔OTC con drill.
4. **Slice "Adiós al BI mensual"** (MV-16–18): las páginas del BI, vivas y self-service.
5. **Slice "Sin doble ingreso"** (MV-19): la hora de bomba que dispara la mantención.

Los Slices 1 y 2 juntos ya sostienen la reunión: *muestran el después y el cómo se ingresa.*

---

## 9. Guion de demo (pantalla → dolor que mata)

1. **Abrir el Hero.** "Su diagrama de la página 3 del BI, pero vivo." → mata *"esperar al cierre de mes"*.
2. **Declarar el turno y capturar una lectura de T-6010.** "Miren cómo se ingresa: pocos campos, y si tipeo un valor imposible, el sistema me lo dice **acá**, no tres días después. Firmo con mi PIN — la estación nunca pide login, pero cada dato sabe quién fue." → mata *"datos mal ingresados que se descubren días después"* y *la cuenta compartida sin identidad*.
3. **Ver el efecto en vivo.** "Ese dato que ingresé una vez: el estanque sube en el diagrama, el balance recalcula, el descuadre se actualiza. Un ingreso, muchos usos." → mata *el doble tipeo en varias planillas* — el **regalo al operador**.
4. **Corregir un valor.** "Y si me equivoqué, no borro: queda la enmienda, con quién y cuándo. Como un libro contable." → mata *"averiguar quién fue y corregir"*.
5. **Chip de descuadre OTA↔OTC.** "El número que concilian con OTA, al día, por cargador." → mata *la conciliación binacional tardía*.
6. **Ir a Reportes.** "Todo el BI, sin que nadie lo reconstruya cada mes." → mata *la dependencia del BI*.

Cierre: *"Nada de esto pide capturar dos veces. Empieza por lo que ya miran y por el número que ya hacen a mano — y por fin el dato sabe quién lo escribió y cuándo."*

---

## 10. Costuras de integración real (después de la demo)

La demo es sintética y de estado local a propósito. Para producción:
- **Fuente de datos:** reemplazar `seed.json` por backend (el esquema Prisma de referencia ya existe). Hero, reportes y captura consumen los mismos tipos de `lib/domain`.
- **Captura → escritura real:** el commit que en la demo va al mundo en memoria, en producción escribe a OTC 360 (y el Excel se exporta desde ahí, no se tipea).
- **Identidad real:** `resolveActor` deja de ser mock y resuelve en servidor (PIN, o control de acceso si algún día existe). *La firma de un solo factor (PIN) es un salto enorme sobre "identidad cero", pero nombrar su límite: no es firma electrónica robusta para una investigación de incidente (ver propuesta).*
- **SCADA (confirmado que existe):** feed de solo lectura para presión/caudal/nivel → alimenta `TelemetryPoint` en vez de simulación, y **pre-llena** campos de captura (menos tipeo aún).

---

## 11. Por confirmar (afecta la construcción)

- [ ] **¿Cuáles ingresos priorizar para la demo?** Propongo lectura/movimiento + novedad de turno (+horas de bomba si alcanza). Confirmar si hay un ingreso específico que el cliente quiera ver sí o sí.
- [ ] **Política de PIN / dotación:** ¿5 en sala por turno? ¿el roster se declara al inicio? (para el selector de identidad).
- [ ] **¿Los equipos tienen KP hoy?** Define estado-por-nodo y esquemático por KP.
- [ ] **Presupuesto/Programa mensual:** de dónde sale para Ppto vs Real.
- [ ] **Paleta corporativa OTC** (azul/verde del logo): ¿acercar el modo claro a ella para la reunión, o mantener "Sala de Control"?

> Ninguno bloquea los Slices 1 y 2.
