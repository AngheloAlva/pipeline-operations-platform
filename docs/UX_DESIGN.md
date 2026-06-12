# Diseño visual / UX — Pipeline Operations Platform

Wireframes en texto y guía de UX para los tres módulos. Es la referencia que se le entrega a Claude Code para construir la capa de presentación. Acompaña a `domain-model.ts`, `domain-rules.md` y `data-generator-spec.md`.

> Los wireframes son **esquemáticos** (zonas y jerarquía, no pixel-perfect). El objetivo es fijar qué va dónde, qué componente lo renderiza y cómo se comporta. El detalle fino se decide al codear.

---

## 1. Sistema de diseño compartido (base de los tres módulos)

Antes de los módulos, lo común. Esto vive en `components/layout/` y `components/controls/` y da coherencia visual.

### 1.1 Layout global

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER:  ▣ Pipeline Ops      [Cockpit][Mantención][Integridad]│  ← nav principal
│                                          🔆 tema   ⏱ reloj sim │
├────────┬─────────────────────────────────────────────────────┤
│        │                                                      │
│  RAIL  │                  ÁREA DE CONTENIDO                   │
│ lateral│                  (el módulo activo)                  │
│ (opc.) │                                                      │
│        │                                                      │
└────────┴─────────────────────────────────────────────────────┘
```

- **Header fijo**: logo/título a la izquierda, navegación entre los 3 módulos al centro, toggle de tema claro/oscuro y reloj de simulación a la derecha.
- **Rail lateral opcional**: solo aparece en módulos que lo necesitan (CMMS lo usa para el árbol; Cockpit e Integridad no).
- **Área de contenido**: ocupa el resto; cada módulo la llena a su manera.

### 1.2 Paleta y tono

- 🔧 **Tema oscuro por defecto** (un cockpit industrial luce mejor oscuro, tipo SCADA), con toggle a claro.
- Colores semánticos consistentes en los 3 módulos:
  - Verde = OK / en banda / operativo.
  - Ámbar = warning / próximo a vencer / fuera de banda leve.
  - Rojo = crítico / vencido / fuera de rango.
  - Azul = crudo / flujo / información neutra.
- Tipografía: una sans legible (Inter o similar). Números con fuente tabular (que las cifras alineen en columnas).

### 1.3 Componentes compartidos

| Componente | Uso |
|------------|-----|
| `KpiCard` | tarjeta de número grande + label + delta (▲▼) |
| `StatusBadge` | píldora de color por `AlertLevel`/estado |
| `Panel` | contenedor con título y borde sutil |
| `Tabs` | cambio de sub-vista dentro de un módulo |
| `Slider` / `Toggle` | controles (velocidad sim, filtros) |
| `Sparkline` | mini-gráfica inline en tablas |
| `TimeSeriesChart` | gráfica de serie temporal (Recharts) |
| `DataTable` | tabla ordenable con badges y sparklines |

---

## 2. Módulo 1 — Cockpit (flujo de crudo)

La vista estrella. Densa, viva, tipo sala de control. Dos zonas: el **diagrama de flujo** (protagonista) y los **paneles numéricos** alrededor.

### 2.1 Wireframe

```
┌──────────────────────────────────────────────────────────────┐
│ KPIs (fila superior)                                          │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                  │
│ │Recibido│ │Entregado│ │Cumplim.│ │ Balance│   KpiCard x4     │
│ │ m³ ▲   │ │ m³      │ │ 98% ✓  │ │ +0.2% ⚠│                  │
│ └────────┘ └────────┘ └────────┘ └────────┘                  │
├───────────────────────────────────────────┬──────────────────┤
│                                            │  PANEL LATERAL   │
│        DIAGRAMA DE FLUJO (SVG)             │  (contextual)    │
│                                            │                  │
│   [T-101]──┐                               │  Balance hora    │
│   ███▒▒ 62%│                               │  a hora:         │
│            ├──▶〔Bombeo〕══oleoducto═══▶    │  ┌────────────┐  │
│   [T-6010]─┘                  │            │  │ entradas   │  │
│   ████▒ 78%                   ▼            │  │ salidas    │  │
│                          [Refinería]       │  │ Δ stock    │  │
│   [T-6020]───────▶〔Terminal〕──▶ ⛴ Buque   │  └────────────┘  │
│   ██▒▒▒ 41%                                │                  │
│                                            │  Conversión:     │
│   ● flujo animado por los ductos           │  15°C ⇄ 60°F     │
│   ▒ nivel de estanque (sube/baja)          │  [input + tabla] │
├────────────────────────────────────────────┴──────────────────┤
│ CONTROLES SIM:  ▶ ⏸  velocidad [1x|10x|60x|600x]   ↺ reset     │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Comportamiento

- **Diagrama de flujo (`FlowDiagram`, SVG):** nodos = estanques/estaciones/destinos; aristas = ductos. Un punto luminoso viaja por la arista cuando hay un movimiento activo (anima con `requestAnimationFrame`). El sentido y la velocidad del punto reflejan el caudal real.
- **Estanques (`TankGauge`):** cada estanque es un rectángulo que se llena/vacía. El relleno sube y baja según la simulación (`lib/simulation/flow.ts`). Color del líquido = azul crudo; al pasar 95% (alarma alto nivel) el borde parpadea ámbar.
- **Panel lateral contextual:** por defecto muestra el balance hora a hora del sistema. Al hacer **clic en un estanque o equipo**, el panel cambia a su detalle (nivel, caudal, equipos asociados, y un botón "ver en Mantención / Integridad" → navegación cruzada).
- **Conversión interactiva:** un mini-widget donde el usuario mete un volumen + temperatura + °API y ve el resultado a 15°C y 60°F (usa `lib/volumetrics/conversions.ts`). Demuestra el dominio físico de forma tangible.
- **Controles de simulación (barra inferior):** play/pausa, selector de velocidad (1x/10x/60x/600x), reset. El reloj de simulación del header avanza según la velocidad.

### 2.3 Qué se ve "vivo"

Lo importante de esta vista es el movimiento: niveles cambiando, puntos viajando por los ductos, KPIs actualizándose, el reloj corriendo. Es lo que hace que un revisor diga "esto está pasando en tiempo real" aunque sea simulado.

---

## 3. Módulo 2 — Maintenance / CMMS

Vista de gestión, más tabular y estructurada. Aquí sí aparece el **rail lateral** con el árbol jerárquico.

### 3.1 Wireframe

```
┌────────────┬─────────────────────────────────────────────────┐
│ ÁRBOL      │  KPIs:  ┌──────┐┌──────┐┌──────┐┌──────┐         │
│ (rail)     │         │Vencid││Próxim││ OT   ││Crític│         │
│            │         │  6 ⚠ ││ 11   ││abiert││  3 🔴│         │
│ ▾ Estación │         └──────┘└──────┘└──────┘└──────┘         │
│   Cabecera │                                                  │
│  ▾ Bombas  │  [ Tablero ][ Calendario ][ Órdenes ]  ← Tabs    │
│    J-6010 🔴│ ─────────────────────────────────────────────── │
│    J-6020  │                                                  │
│  ▸ Válvulas│  TABLA DE EQUIPOS / TAREAS                        │
│ ▾ Terminal │  ┌─────┬────────┬────────┬──────┬─────────────┐  │
│  ▾ Agitad. │  │ Tag │ Tipo   │Critic. │Horas │ Próx. mant. │  │
│    AG-01 ⚠ │  ├─────┼────────┼────────┼──────┼─────────────┤  │
│    AG-02   │  │J-6010│ Bomba │ 🔴 CRIT│ 1980h│ ⚠ vencida   │  │
│            │  │AG-01 │ Agit. │ 🟠 HIGH│ 1420h│ en 80h      │  │
│            │  │MOV-11│ Válv. │ 🟢 MED │  —   │ 12 may      │  │
│            │  └─────┴────────┴────────┴──────┴─────────────┘  │
│            │   ↑ click fila → detalle equipo (cruza módulos)  │
└────────────┴─────────────────────────────────────────────────┘
```

### 3.2 Comportamiento

- **Árbol jerárquico (`EquipmentTree`, rail):** Estación → categoría → equipo, expandible. Cada nodo lleva un `StatusBadge` de criticidad/estado. Seleccionar un nodo filtra la tabla de la derecha.
- **KPIs superiores:** tareas vencidas, próximas, OT abiertas, equipos críticos. Los números salen de `lib/maintenance/scheduling.ts`.
- **Tabs de la vista:**
  - **Tablero:** la tabla de equipos/tareas con estado de mantención (calculado: VENCIDA/PRÓXIMA/OK), ordenable por criticidad u horas. Las filas vencidas resaltan en rojo, próximas en ámbar.
  - **Calendario:** vista mensual con las tareas preventivas ubicadas en su `nextDueDate`. Las `BY_HOURS` se ubican en su fecha estimada.
  - **Órdenes:** lista de `WorkOrder` con estado, prioridad y barra de `progress`.
- **Detalle de equipo:** clic en una fila abre la vista de detalle (`equipment/[id]`), que es el punto de **navegación cruzada**: muestra datos de los tres módulos para ese equipo y enlaces "ver en Cockpit / Integridad".

### 3.3 Tono visual

Más sobrio que el cockpit: es una herramienta de trabajo. Tablas limpias, badges de color para escanear rápido, mucho aire. La gracia está en que los datos cuadran y las urgencias saltan a la vista.

---

## 4. Módulo 3 — Integrity & Cathodic Protection Map

Vista lineal/geográfica. El protagonista es el **trazado del ducto por kilómetro**, no un mapa geográfico real (eso simplifica y se ve más limpio).

### 4.1 Wireframe

```
┌──────────────────────────────────────────────────────────────┐
│ KPIs:  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│        │ Puntos OK│ │ Warnings │ │ Críticos │                │
│        │  142 🟢  │ │   18 🟠  │ │   4 🔴   │                │
│        └──────────┘ └──────────┘ └──────────┘                │
├──────────────────────────────────────────────────────────────┤
│  TRAZADO LINEAL DEL DUCTO (SVG horizontal)                    │
│                                                               │
│  pk201      pk220       pk240       pk255        pk270         │
│  ●━━━━━━━━━━━●━━━━━━━━━━━━●━━━━🔴━━━━━●━━━━━━━━━━━━●            │
│  │Cabecera   │Rect-1      │           │Rect-2      │Terminal    │
│  🟢          🟢           🟠          🔴           🟢            │
│        ↑ cada marcador = estación/rectificador/punto de lectura│
│        ↑ color = AlertLevel del punto                         │
├──────────────────────────────────────────────┬───────────────┤
│  TABLA DE LECTURAS                             │ DETALLE PUNTO │
│  ┌──────┬─────────┬──────────┬──────────────┐ │ (al click)    │
│  │ pk   │Potencial│ Nivel    │ Tendencia    │ │               │
│  ├──────┼─────────┼──────────┼──────────────┤ │ pk 248        │
│  │248   │-0.72 V  │ 🔴 CRIT  │ ↘ degradando │ │ Histórico:    │
│  │235   │-0.81 V  │ 🟠 WARN  │ → estable    │ │ ┌───────────┐ │
│  │220   │-0.95 V  │ 🟢 OK    │ → estable    │ │ │ línea temp│ │
│  └──────┴─────────┴──────────┴──────────────┘ │ └───────────┘ │
│   ↑ sparkline de tendencia por punto          │ + umbrales    │
└────────────────────────────────────────────────┴───────────────┘
```

### 4.2 Comportamiento

- **Trazado lineal (`PipelineMap`, SVG):** una línea horizontal de pk inicial a pk final. Marcadores sobre la línea = estaciones, rectificadores y puntos de lectura, coloreados por `AlertLevel` (verde/ámbar/rojo, según `lib/integrity/thresholds.ts`). Zoom/scroll horizontal si el ducto es largo.
- **KPIs:** conteo de puntos OK / warning / crítico.
- **Tabla de lecturas:** cada punto con su potencial, nivel calculado y una `Sparkline` de tendencia. La columna "tendencia" marca ↘ cuando la serie se degrada (detección de tendencia de las reglas de dominio 5.3), aunque aún esté en rango.
- **Detalle de punto (panel derecho):** al hacer clic en un marcador o fila, muestra el histórico de ese punto como `TimeSeriesChart`, con las líneas de umbral (−0.850 / −0.750 V) dibujadas para ver visualmente cuándo cruzó.

### 4.3 Tono visual

Limpio y diagnóstico. El trazado lineal con marcadores de color permite ver el estado de todo el ducto de un vistazo; la tabla y el detalle dan la profundidad. La línea de umbral en la gráfica es el detalle que demuestra criterio técnico.

---

## 5. Navegación cruzada (lo que une los tres módulos)

El hilo conductor. Una misma entidad se ve desde tres ángulos:

```
        ┌───────────── Equipo J-6010 ─────────────┐
        │                                          │
   [Cockpit]              [CMMS]              [Integridad]
   bombea crudo      plan vencido,         ubicada en pk 235,
   en el flujo       criticidad CRIT       lecturas OK
        │                   │                      │
        └──────── equipment/[id] (detalle) ────────┘
                  agrega los tres ángulos
                  + botones "ver en …"
```

- Desde cualquier módulo, clic en un equipo/estación → se puede saltar a las otras vistas con esa entidad pre-seleccionada.
- La página `equipment/[id]` es el punto de encuentro: resume los tres dominios para esa entidad.
- 🔧 La selección activa (qué equipo está enfocado) vive en el store compartido, así al cambiar de módulo se mantiene el contexto.

---

## 6. Responsividad y estados

- 🔧 **Desktop-first** (es una herramienta de operación; el caso real es pantalla grande). En móvil/tablet: el diagrama del cockpit se vuelve scrollable, el árbol del CMMS colapsa a un drawer, y las tablas pasan a tarjetas apiladas.
- **Estados de carga/vacío:** skeletons mientras se genera/carga el mundo; mensaje claro si una tabla queda vacía tras filtrar.
- **Accesibilidad:** los colores semánticos siempre acompañados de ícono o texto (no depender solo del color, importante para daltonismo en un contexto de alertas).

---

## 7. Qué necesito de ti para cerrar este punto

Igual que con las reglas, lo marcado 🔧 son decisiones de diseño que puedes confirmar o cambiar:
- Tema oscuro por defecto.
- Desktop-first.
- Diagrama del cockpit como SVG esquemático (no mapa geográfico real).
- Trazado lineal del ducto (no mapa con coordenadas reales).

Mi recomendación es dejarlas tal cual: son las que dan mejor relación impacto/esfuerzo para un portafolio. Si las confirmas, con esto + los tres documentos anteriores el blueprint de diseño está completo y solo falta el **punto 5: el backlog de tareas por fase** para empezar a construir con Claude Code.

¿Quieres que pase al backlog, o prefieres que genere algún **mockup visual** de la pantalla del cockpit para verla renderizada antes de seguir?
