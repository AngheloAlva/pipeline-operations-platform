# Pipeline Operations Platform

Plataforma web de operación de un oleoducto que unifica tres dominios en una sola aplicación: **flujo de crudo en tiempo cuasi-real**, **gestión de mantención (CMMS)** e **integridad y protección catódica del trazado**. Proyecto de portafolio orientado al sector petróleo/operaciones, con foco en **frontend** y **lógica/algoritmos**.

> **Nota sobre datos:** el proyecto usa exclusivamente **datos sintéticos generados por código** que imitan la estructura y escala de un oleoducto real. No se usa ningún dato real del cliente. La capacidad de generar datos sintéticos realistas es, además, parte de lo que el proyecto demuestra.

---

## 1. Visión

Una sola aplicación con un modelo de datos compartido (ducto, estaciones, equipos, volúmenes) sobre el que se montan tres "lentes" o módulos. El usuario navega entre ellos sin cambiar de mundo: el mismo ducto que ve fluir crudo en el cockpit es el que tiene equipos con planes de mantención y el que recorre por kilómetro en el mapa de integridad.

El diferenciador frente a un portafolio genérico es el **conocimiento de dominio**: conversiones volumétricas (15°C ↔ 60°F), balances de estanque, cumplimiento real vs programa vs presupuesto, criticidad de equipos, lecturas de protección catódica. Demuestra que se entiende un negocio real, no solo que se sabe programar.

### Qué demuestra a una empresa
- **Frontend:** diagramas animados, visualizaciones de datos, mapas, layout coherente, estado complejo, tiempo real simulado.
- **Algoritmos:** simulación de llenado/vaciado por caudal, balances volumétricos, conversiones físicas, programación de mantención, detección de anomalías por umbral.
- **Arquitectura:** un modelo de datos unificado con tres vistas, separación lógica/UI, generación de datos sintéticos, código tipado y testeable.
- **Dominio:** comprensión de un proceso industrial real de principio a fin.

---

## 2. Modelo de datos compartido (el "pegamento")

Todas las entidades viven en un núcleo común. Los tres módulos son vistas sobre estas mismas tablas.

- **Pipeline / Segmentos:** el ducto dividido por kilómetro (pk), con diámetro, trazado y progresiva.
- **Stations (Estaciones):** puntos a lo largo del ducto (cabecera, intermedias, terminal). Jerárquicas.
- **Tanks (Estanques):** T-101, T-6010/20/30, etc. Con capacidad, nivel actual, producto, temperatura, API.
- **Equipment (Equipos):** bombas, agitadores, válvulas, rectificadores. Jerárquicos (padre-hijo), con criticidad, ubicación y estado operacional.
- **Movements (Movimientos):** transferencias de crudo entre nodos (recepción, trasvasije, carga buque, entrega refinería) con volumen, temperatura y timestamps.
- **MaintenancePlans / Tasks:** planes con tareas por frecuencia (preventiva/correctiva), próxima fecha, equipo asociado.
- **WorkOrders (Órdenes de trabajo):** estado, prioridad, equipo, fechas, progreso.
- **CathodicReadings (Lecturas):** lecturas de protección catódica por estación/pk, con umbrales.
- **Readings/Telemetry (Telemetría):** series temporales de presión, caudal, nivel, voltaje.

---

## 3. Los tres módulos

### Módulo 1 — Pipeline Operations Cockpit (flujo de crudo)
La vista estrella. Un **diagrama animado del flujo** (estanques → oleoducto → refinería / terminal / buque), inspirado en el diagrama de movimiento de crudo.
- Estanques con nivel que sube/baja según una **simulación de caudal** en tiempo cuasi-real.
- Balance volumétrico hora a hora (entradas vs salidas, diferencia a stock).
- **Conversiones físicas:** volumen a 15°C ↔ 60°F según API y temperatura.
- KPIs de cumplimiento: real vs programa vs presupuesto, con waterfall por cargador.
- Aporta: diagramático + simulación + numérico + datos.

### Módulo 2 — Maintenance / CMMS
Vista de gestión de activos sobre los mismos equipos del ducto.
- **Árbol jerárquico** de estaciones → equipos (bombas, agitadores, rectificadores).
- **Tablero de criticidad** y estado operacional.
- **Calendario de mantención preventiva** y proyección de próximas intervenciones según horas de operación acumuladas (como las tablas de horas de servicio de bombas).
- Órdenes de trabajo con estados, prioridades y progreso.
- Aporta: diagramático (árbol/calendario) + algoritmos (programación, predicción) + datos.

### Módulo 3 — Integrity & Cathodic Protection Map
Vista geográfica/lineal del trazado del ducto.
- **Mapa lineal por kilómetro** (pk) con estaciones, rectificadores y tramos.
- **Lecturas de protección catódica** con alertas por umbral (fuera de rango → flag).
- Historial de lecturas por punto y evolución temporal.
- Aporta: gráfico/mapa + numérico + detección de anomalías.

### Hilo conductor entre módulos
Una bomba que aparece moviendo crudo en el **Cockpit** es la misma que tiene un plan en **CMMS** y vive en un pk del **mapa de Integridad**. Clic en un equipo en cualquier vista → se puede saltar a las otras dos. Eso es lo que convierte tres demos en una plataforma.

---

## 4. Stack tecnológico

| Capa | Tecnología | Razón |
|------|-----------|-------|
| Framework | Next.js (App Router) + TypeScript | Routing, tipado, SSR |
| Estilos | Tailwind CSS | Consistencia y velocidad |
| Diagramas / flujo | SVG + animación (requestAnimationFrame) | Diagrama de flujo y niveles de estanque |
| Mapa lineal | SVG / Canvas | Trazado por kilómetro |
| Gráficas | Recharts (o D3 para control fino) | Series, waterfall, comparativos |
| Estado | Zustand | Estado por módulo y simulación |
| Datos sintéticos | Generador propio (faker + lógica de dominio) | Poblar el modelo de forma realista |
| Persistencia (opcional) | Prisma + SQLite/Postgres | Si se quiere backend; el esquema ya existe como referencia |
| Tests | Vitest | Validar conversiones, balances, programación |

> El esquema Prisma existente sirve como **referencia de estructura** para el modelo de datos, adaptándolo y simplificándolo a las entidades del núcleo compartido.

---

## 5. Fases de construcción

### Fase 0 — Fundaciones y modelo de datos
- Inicializar Next.js + TypeScript + Tailwind.
- Definir los **tipos del núcleo compartido** (Pipeline, Station, Tank, Equipment, Movement, etc.).
- Construir el **generador de datos sintéticos**: un ducto con N estaciones, M equipos, estanques con capacidades, y un histórico de movimientos coherente.
- Layout base: navegación entre los tres módulos, header, sistema de diseño (colores, tipografía, modo claro/oscuro).
- **Entregable:** app navegable con datos sintéticos cargados y páginas placeholder.

### Fase 1 — Módulo 1: Cockpit (la vista ancla)
- Diagrama SVG del flujo (estanques, ductos, destinos).
- Lógica pura de **simulación de caudal**: dado un caudal y capacidad, calcular nivel en el tiempo.
- Animación de niveles de estanque y flujo en tiempo cuasi-real.
- **Conversiones volumétricas** (15°C ↔ 60°F) como funciones puras testeadas.
- Panel de balance hora a hora y KPIs real vs programa.
- **Entregable:** primer módulo funcional y muy vistoso. Buen ancla del portafolio.

### Fase 2 — Módulo 2: CMMS
- Árbol jerárquico de estaciones/equipos (reutiliza patrones del primer proyecto si aplica).
- Tablero de criticidad y estado.
- Lógica de **programación de mantención**: dada una frecuencia y horas acumuladas, calcular próxima intervención.
- Calendario y órdenes de trabajo.
- **Entregable:** segundo módulo, conectado a los mismos equipos del cockpit.

### Fase 3 — Módulo 3: Integrity Map
- Mapa lineal por kilómetro con estaciones y rectificadores.
- Lecturas de protección catódica con **detección de anomalías por umbral**.
- Historial y evolución temporal de lecturas.
- **Entregable:** tercer módulo, cerrando el trazado completo del ducto.

### Fase 4 — Integración entre módulos
- Navegación cruzada: clic en un equipo/estación salta entre las tres vistas.
- Estado y selección compartidos.
- Vista de detalle de equipo que agrega información de los tres dominios.
- **Entregable:** la plataforma se siente como una sola cosa, no tres demos.

### Fase 5 — Pulido
- Transiciones, estados vacíos/carga, responsividad.
- Tests de la lógica de dominio (conversiones, balances, programación, umbrales).
- README con GIFs, descripción técnica y deploy en Vercel.
- **Entregable:** proyecto listo para mostrar.

> Cada fase es demostrable por sí sola. El orden Cockpit → CMMS → Integridad → Integración maximiza el impacto visual temprano y deja la unificación para cuando las tres piezas existen.

---

## 6. Estructura de carpetas

```
pipeline-operations-platform/
├── app/
│   ├── layout.tsx                # Layout global: nav entre módulos
│   ├── page.tsx                  # Landing / resumen general
│   ├── cockpit/page.tsx          # Módulo 1
│   ├── maintenance/page.tsx      # Módulo 2
│   ├── integrity/page.tsx        # Módulo 3
│   └── equipment/[id]/page.tsx   # Detalle cruzado de un equipo
│
├── components/
│   ├── layout/                   # Nav, Header, ThemeToggle
│   ├── controls/                 # Panel, Slider, Tabs, Toolbar
│   ├── cockpit/                  # FlowDiagram, TankGauge, BalancePanel
│   ├── maintenance/              # EquipmentTree, MaintenanceCalendar
│   └── integrity/                # PipelineMap, ReadingChart
│
├── lib/                          # LÓGICA PURA, sin React
│   ├── domain/                   # Tipos del núcleo compartido
│   ├── simulation/               # flow.ts (caudal/niveles)
│   ├── volumetrics/              # conversions.ts (15°C↔60°F), balance.ts
│   ├── maintenance/              # scheduling.ts (próxima intervención)
│   ├── integrity/                # thresholds.ts (detección de anomalías)
│   └── data/                     # generador de datos sintéticos
│
├── hooks/                        # useAnimationLoop, useSimulation...
├── store/                        # Estado compartido y por módulo
├── types/                        # Tipos compartidos
└── __tests__/                    # Tests de lib/
```

**Principio clave:** todo lo de `lib/` son funciones puras y testeables (conversiones, balances, simulación, programación, umbrales) que no saben que existe React. Es lo que más valoran los revisores técnicos y lo que demuestra el lado "algoritmos".

---

## 7. Detalles que elevan la percepción de calidad

- **Conversiones físicas reales y testeadas** (15°C ↔ 60°F según API): muestra dominio del negocio.
- **Simulación con control de velocidad** (1x, 10x, 60x) para ver llenado/vaciado acelerado.
- **Balance volumétrico que cuadra** (entradas − salidas = diferencia de stock), con detección de descuadres.
- **Navegación cruzada entre módulos** sobre la misma entidad.
- **Generador de datos parametrizable** (cambiar tamaño del ducto, nº de equipos, etc.).
- **Tests visibles** en el README y **deploy en Vercel**.

---

## 8. Riesgo principal y cómo gestionarlo

El riesgo es el **alcance**: tres módulos es ambicioso. Mitigación:
- El modelo de datos compartido (Fase 0) es lo que evita triplicar el trabajo.
- Cada fase entrega algo presentable, así que el proyecto es valioso aunque se detenga en la Fase 1, 2 o 3.
- La integración (Fase 4) es lo último; hasta entonces los módulos funcionan de forma independiente.

---

## 9. Próximos pasos sugeridos

1. Confirmar las entidades del núcleo compartido (Sección 2) y simplificarlas a lo esencial.
2. Montar la Fase 0: tipos del dominio + generador de datos sintéticos + layout.
3. Implementar la lógica pura de conversiones volumétricas y simulación de caudal antes de tocar la UI del cockpit.
