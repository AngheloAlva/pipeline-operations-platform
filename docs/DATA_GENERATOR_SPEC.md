# Especificación del generador de datos sintéticos

Define cómo poblar el `PipelineWorld` (ver `domain-model.ts`) con datos inventados pero **coherentes**, de modo que los tres módulos tengan algo realista que mostrar. Es la referencia para que Claude Code implemente `lib/data/`.

> **Recordatorio:** todos los datos son sintéticos. Los nombres de empresas, equipos y estaciones son ficticios o genéricos. Ningún valor proviene de datos reales.

---

## 1. Objetivo y principios

El generador produce un único objeto `PipelineWorld` determinista y coherente. Tres principios:

1. **Coherencia sobre realismo.** Los números no necesitan ser exactos, pero deben cuadrar entre sí: un balance de estanque debe (casi) cerrar, un movimiento de carga de buque debe salir de un estanque que tenía volumen suficiente, etc.
2. **Determinismo opcional.** Aceptar una `seed` para reproducir el mismo mundo. Útil para tests y para que la demo no cambie en cada recarga.
3. **Parametrizable.** Un objeto de configuración controla el tamaño y la forma del mundo.

---

## 2. Configuración de entrada

```ts
interface GeneratorConfig {
  seed?: number;              // semilla para reproducibilidad
  pipelineLengthKm: number;   // 🔧 default 270
  pipelineDiameterInches: number; // 🔧 default 16
  stationCount: number;       // 🔧 default 5 (cabecera + intermedias + terminal)
  tanksPerStation: number;    // 🔧 default 2–3
  equipmentPerStation: number;// 🔧 default 6–10
  shipperCount: number;       // 🔧 default 4 (YPF/Shell/Vista/Equinor genéricos)
  historyDays: number;        // 🔧 default 30 (un mes de movimientos/telemetría)
  telemetryIntervalHours: number; // 🔧 default 1 (un punto por hora)
}
```

Todos con defaults sensatos para que `generateWorld()` sin argumentos ya produzca algo presentable.

---

## 3. Orden de generación (respetando dependencias)

El orden importa porque las entidades se referencian entre sí.

```
1. Pipeline + Segments      → la columna vertebral
2. Stations                 → ubicadas sobre el pipeline (km crecientes)
3. Tanks                    → dentro de estaciones de almacenamiento
4. Equipment                → dentro de estaciones, con jerarquía
5. Shippers                 → lista plana
6. Movements                → eventos coherentes a lo largo de historyDays
7. VolumeTargets            → programa/presupuesto por período, real derivado de movimientos
8. MaintenancePlans + Tasks → asociados a equipos rotativos
9. WorkOrders               → algunas derivadas de tareas vencidas, otras correctivas
10. CathodicReadings        → a lo largo del trazado, mayoría OK con algunas alertas
11. Telemetry               → series por hora para tanques/equipos/segmentos
```

---

## 4. Reglas de coherencia por entidad

### 4.1 Pipeline y Segments
- Dividir `pipelineLengthKm` en segmentos de longitud variable (🔧 ~30–70 km cada uno).
- Etiquetar al menos un segmento como tramo de "alta montaña" para dar color.

### 4.2 Stations
- Repartir las estaciones sobre el ducto con `km` **estrictamente crecientes**.
- La primera es cabecera (`PUMP_STATION` o `SOURCE`), la última es `TERMINAL`.
- Mezclar tipos coherentes: una refinería como destino intermedio, un terminal al final.

### 4.3 Tanks
- Solo en estaciones de tipo almacenamiento/terminal.
- `capacityM3`: 🔧 rango 15.000–100.000 m³.
- `currentLevelM3`: entre 20% y 90% de capacidad (nunca lleno ni vacío al inicio).
- `heightMm` coherente con el nivel: `heightMm = (currentLevelM3 / factor_aforo)` (ver reglas de dominio 2.3).
- `apiGravity`: 🔧 30–40 °API. `temperatureF`: 🔧 70–85 °F. `product`: de una lista ficticia ("CRUDO-A", "CRUDO-B").

### 4.4 Equipment
- Cada estación recibe `equipmentPerStation` equipos.
- Distribuir tipos de forma realista: bombas y agitadores en estaciones de bombeo/almacenamiento, rectificadores asociados a segmentos (protección catódica), válvulas por todos lados.
- Jerarquía: algunos equipos tienen `parentId` (p.ej. un motor dentro de una bomba).
- `criticality`: sesgar hacia MEDIUM/HIGH; pocas CRITICAL.
- `operatingHours`: 🔧 rango 500–8000 h, para que la mantención por horas tenga casos vencidos y al día.
- `tag` con prefijo por tipo: bombas "J-", válvulas "MOV-", rectificadores "RECT-".

### 4.5 Shippers
- Lista de `shipperCount` nombres ficticios.
- Asignar a cada uno una **cuota objetivo** (% del total) que sume ~100%, para los KPIs de participación.

### 4.6 Movements (la parte más delicada — debe cuadrar)
- Generar un flujo coherente a lo largo de `historyDays`:
  - Recepciones desde origen hacia estanques de cabecera.
  - Trasvasijes entre estanques.
  - Transporte por oleoducto hacia el terminal/refinería.
  - Cargas de buque desde el terminal.
- **Regla de oro:** una salida nunca puede exceder el volumen disponible en el nodo de origen en ese momento. El generador debe llevar un "nivel simulado" de cada estanque mientras crea movimientos.
- Para cada movimiento, calcular las tres unidades (`volumeGsvM3`, `volume15CM3`, `volume60FM3`) con las conversiones reales (reglas de dominio 1). Así los datos son internamente consistentes.
- Caudales coherentes: 🔧 300–1500 m³/h.
- Introducir **pequeños descuadres** intencionales (±0.2–0.3%) en algunos balances para que el módulo de balance tenga algo que detectar (si todo cuadra perfecto, la feature de detección no luce).

### 4.7 VolumeTargets
- Un registro por período (mensual y/o diario) y por cargador.
- `budgetM3` y `programM3` cercanos entre sí (🔧 ±5%).
- `realM3` = suma de movimientos reales de ese cargador/período (derivado, no inventado aparte) → así el cumplimiento real vs programa sale natural y la mayoría cae en la banda 95–105%, con algunos outliers.

### 4.8 MaintenancePlans + Tasks
- Crear planes para equipos rotativos (bombas, agitadores).
- Mezclar frecuencias: algunas por calendario, otras BY_HOURS.
- Calcular `nextDueDate`/`nextDueAtHours` con la lógica de programación (reglas de dominio 4), de modo que haya:
  - ~60% tareas OK,
  - ~25% PRÓXIMAS,
  - ~15% VENCIDAS (para que el tablero tenga urgencias que mostrar).

### 4.9 WorkOrders
- Algunas derivadas de tareas preventivas vencidas; otras correctivas sueltas.
- Distribuir estados: mayoría COMPLETED/IN_PROGRESS, algunas PLANNED, pocas ON_HOLD/CANCELLED.
- `otNumber` con formato "OT-XXX-0000" incremental.
- `progress` coherente con el estado (COMPLETED=100, PLANNED=0, IN_PROGRESS entre 10–90).

### 4.10 CathodicReadings
- Repartir lecturas a lo largo del trazado (varias por segmento).
- Mayoría OK (potencial ≤ −0.850 V), 🔧 ~15% WARNING, ~5% CRITICAL.
- Para al menos un punto, generar una **serie temporal degradante** (3+ lecturas que empeoran) para que la detección de tendencia tenga un caso real.
- `level` se calcula con la lógica de umbrales (reglas de dominio 5), no se inventa directo.

### 4.11 Telemetry
- Series por hora a lo largo de `historyDays` para:
  - Nivel de cada tanque (coherente con los movimientos).
  - Presión y caudal en segmentos (🔧 presión 20–40 kg/cm², caudal 300–1500 m³/h).
  - Voltaje de rectificadores.
- Añadir ruido leve (🔧 ±2%) para que las gráficas no sean líneas perfectas.

---

## 5. API pública del generador

```ts
// Genera el mundo completo
function generateWorld(config?: Partial<GeneratorConfig>): PipelineWorld;

// Helpers internos (uno por entidad), exportables para tests
function generatePipeline(cfg): Pipeline;
function generateStations(pipeline, cfg): Station[];
// ...etc
```

- `generateWorld()` sin argumentos → mundo por defecto presentable.
- Con `seed` → reproducible.
- Cada helper es testeable por separado.

---

## 6. Validación (un test que el propio generador debe pasar)

Tras generar, una función `validateWorld(world)` comprueba la coherencia global y se usa en tests:

- Todos los `*Id` referencian entidades existentes (integridad referencial).
- Ningún `currentLevelM3` excede `capacityM3` ni es negativo.
- Las estaciones tienen `km` crecientes y dentro de `[0, pipelineLengthKm]`.
- Cada balance de estanque cierra dentro de la tolerancia esperada (salvo los descuadres intencionales marcados).
- Los `level`/`status` calculados (catódico, mantención) son consistentes con sus umbrales.

Esto demuestra rigor: el generador no solo produce datos, también se autovalida.

---

## 7. Dónde vive

```
lib/data/
├── config.ts        # GeneratorConfig + defaults
├── generate.ts      # generateWorld() y helpers
├── validate.ts      # validateWorld()
└── seed.json        # (opcional) un mundo pre-generado y congelado para la demo
```

> Opción recomendada: generar **una vez** con una seed fija, guardar el resultado en `seed.json`, y que la app cargue ese archivo. Así la demo es estable y rápida, y el generador queda como herramienta para regenerar cuando se quiera.

---

## 8. Resumen

Con esto, los puntos 1 (modelo), 2 (reglas) y 4 (generador) quedan especificados y se encadenan:
el **generador** usa las **reglas de dominio** para producir datos que cumplen el **modelo**.
Falta el punto 3 (diseño visual/UX de cada módulo) y el punto 5 (backlog de tareas), y con eso Claude Code tendría el blueprint completo.
