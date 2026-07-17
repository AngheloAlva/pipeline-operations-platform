# OTC 360 — De la planilla al sistema

### Propuesta aterrizada: qué construir, en qué orden y por qué dirán que sí

> Documento de trabajo — **v2**. Toma la lista de ideas de la sesión de estrategia y la ancla a lo que **hoy ya existe y funciona**: los dos Excel de captura (`Control_y_Buque_v10`, `Informe_y_Visualización_v10`), el **Power BI mensual** de gestión operacional, y OTC 360 (permisos, OT, LOTO, equipos). El mockup `pipeline-operations-platform` es el prototipo visual de dónde converge todo.
>
> **Cambios v1 → v2:** se incorpora el Power BI como tercera capa a absorber; el descuadre pasa a ser un problema **binacional OTA↔OTC** (no interno); se confirman supuestos que estaban "por averiguar" (existe SCADA, ya crean módulos dentro de OTC 360, la integridad por pk es real); y se agrega la especificación de la **hoja estrella: el diagrama de movimiento de crudo**.

---

## 0. El encuadre correcto: no son dos sistemas, son tres

El documento de estrategia decía: *"no son dos audiencias, son las mismas personas con dos sistemas abiertos (OTC 360 + Excel)."* Es correcto pero se quedó corto. **Son tres capas, y el trabajo humano que las mantiene sincronizadas es justamente el proyecto:**

1. **Excel = captura.** La sala tipea aquí la operación cruda: volúmenes, movimientos, niveles, horas de bomba, novedades de turno.
2. **Power BI = reporte gerencial.** Una vez al mes, alguien **reconstruye a mano** un reporte de ~11 páginas a partir de los Excel + datos de OTC 360 (órdenes de trabajo, permisos). Es lo que ve el directorio.
3. **OTC 360 = permisos, OT, LOTO, equipos.** Ya vive en la web, ya lo usa la sala todos los días.

Hoy estas tres capas se reconcilian con **esfuerzo humano y calendario**: se tipea en Excel, se espera al cierre de mes, se arma el BI, se cruza con OTC 360. La propuesta no es "digitalizar una de ellas" — es **colapsar las tres en una sola plataforma viva** donde la captura, el reporte y los permisos comparten una única fuente de verdad, y el reporte deja de armarse: *existe solo, siempre al día.*

Criterio de evaluación (del documento original, sigue vigente): *¿cuánto le devuelve identidad y tiempo al dato?* Con la mitad que consigue adopción: *¿y qué le devuelve al operador a cambio de la fricción?*

---

## 1. Capa 1 — Lo que la sala captura hoy en Excel

Cada fila es trabajo que hoy se hace tipeando, con el dolor que arrastra.

| Planilla / hoja | Qué se registra o calcula hoy | Dolor actual |
|---|---|---|
| `Mov_tk` | Movimiento de estanques: volumen inicial/final, entradas/salidas por TK, **stock diario y su diferencia** (descuadre, en m³) | El descuadre se arma a mano; el mismo nivel se re-tipea en otras hojas |
| `Cont_vol_diario` | Volumen horario por batch, flujómetros (FM-542/546/552/556), GSV a 15 °C y 60 °F, **diferencia OTC vs OTA** | Descuadre de custodia calculado a mano; error horario se arrastra al batch |
| `Progresivas_Batch` | Volumen **programado por cargador** (YPF, Shell, Vista, Equinor…) vs real, horas de bombeo, desviación | Nominación vs real conciliada a mano; desviación tardía |
| `Car_Buque` / `Des_Buque` | Carga/descarga de buque: fecha, estanque, B/T, M³, crudo, API, BRLS | Conversión M³↔BRLS a mano; buque desconectado del balance |
| `HRS_BBAS_Agitadores` | Horas de servicio por bomba/agitador, **horas acumuladas**, solicitante, volumen transportado | Horas acumuladas a mano; no disparan mantención |
| `Informe_diario` | **Bitácora de turno con timestamp**: trasvasijes, agitadores, presurizado de línea, personal en planta, y **firma** | Texto libre; sin identidad estructurada; handover en la memoria de quien sale |
| `Inf_TRM` | Presión de oleoducto, motores/generadores, stock de combustible, flota | Planilla paralela, nada se cruza |
| `Inf_Caudal` | **Caudales de ríos** (Itata, Polcura, Andalién…) — ambiental/regulatorio | Manual, sin alertas |
| `Linea_30` | Movimientos línea 30″: OTC↔Terminal, Terminal↔Refinería | Otra hoja más con volumen que ya existe en `Mov_tk` |

Dos hechos que las planillas **confirman** (ya no hay que ir a preguntarlos):

- **El mismo dato se tipea varias veces.** Nivel de estanque y volumen de línea aparecen en múltiples hojas → la "llave de adopción" del documento (¿se tipea el mismo dato en más de un archivo?) es **sí**.
- **La sala ya calcula descuadre a mano** (`Mov_tk`, OTC vs OTA). Automatizarlo no es agregar trabajo; es quitarlo.

---

## 2. Capa 2 — El Power BI: la prueba de que el dato ya vale (solo que llega tarde y a mano)

Este es el aporte nuevo de la v2. El BI mensual **ya demuestra que toda esta data tiene valor gerencial** — el problema es cómo se produce y cómo se consume: se arma una vez al mes, a mano, y solo lo ve quien recibe el archivo. Llevarlo a web significa: **self-service, siempre al día, con drill-down al registro que lo originó, y sin reconstrucción manual.**

Lo que cubre el BI hoy, página por página, y de dónde sale cada dato:

| Página del BI | Qué muestra | Fuente hoy |
|---|---|---|
| **Diagrama Movimiento Crudo** ⭐ | Tanques, plantas, buque, refinería con volúmenes y stock (15 °C / 60 °F). *La hoja estrella.* | Excel (`Mov_tk`, `Cont_vol_diario`, buque) |
| **Reporte de Diferencias** | **Descuadre binacional**: Puerto Hernández (OTA) vs Terminal Concepción (OTC) por cargador, diario/mes/YTD | Excel (`Cont_vol_diario`) |
| Movimiento por cargador | Participación y waterfall por cargador (YPF 44.3%, Vista 30.1%, Shell 20.9%, Equinor 4.7%) | Excel (`Progresivas_Batch`) |
| Comparativo Ppto vs Real | Presupuesto / Programa / Real, cumplimiento %, vs año anterior | Excel + presupuesto |
| Reporte Oleoducto 16 (Detención) | Análisis de **detenciones**: motivos, horas detenidas, responsable OTA/OTC/Ambos | Excel (novedades) |
| Cantidad Órdenes de Trabajo | OT por tipo (Prev/Proact/Correct/Predict), generadas vs ejecutadas | **OTC 360** |
| Permiso de Trabajo | Permisos Caliente/Frío mensuales y acumulados | **OTC 360** |
| Horas Trabajadas | Contratista vs Propio, mensual y acumulado | Excel / RRHH |
| KPIs Capacitación y Residuos | Horas de capacitación, generación de residuos, accidentología | Excel / HSE |
| Medio Ambiente | Inventario **GEI** por alcance/categoría (Alcance 1/2/3) | Excel / HSE |
| Comentarios de Cierres | **Narrativa mensual por área** (Integridad, Mantención, Operaciones, MA, Seguridad) | Excel / manual |

### Lo que el BI nos confirma (y cierra preguntas abiertas del documento)

Leyendo las páginas de "Comentarios de Cierres" y "Detenciones" aparecen confirmaciones que **cambian el alcance** de la propuesta:

- **Existe SCADA.** "Homologación pantalla SCADA OTA/OTC", botones "Ingreso Setpoint", paneles de alarma RIS. → El módulo de telemetría (presión, caudal, nivel) es probablemente **lectura, no captura**. Mejor producto, y baja de prioridad la duda "¿existe historian?".
- **Ya construyen módulos dentro de OTC 360.** "Se mejora el horizonte de proyección de las mantenciones mediante la creación de un **módulo de programador en OTC 360**"; "se agregan indicadores de mantención: backlog, tiempo de respuesta, OT en fecha". → **La recomendación de "módulos nuevos dentro de OTC 360" no es una apuesta: es la trayectoria que ya siguen.** Enorme para la venta.
- **El descuadre es binacional y es tema de gobernanza.** "Se realiza **taller de mediciones volumétricas entre OTA y OTC**, se acuerdan acciones para mejorar el control de diferencias en la medición." → El descuadre no es merma interna: es la **reconciliación de custodia entre Argentina (OTA) y Chile (OTC)**, y ya hacen talleres formales sobre él. Esto eleva mi pick #1 de "feature linda" a "el número que dos países discuten".
- **La integridad por pk es real.** "Corrida ILI en ducto de 30″ (MFLA/MFLC/Gyro)", "Estudio protección catódica ECOS – Alta montaña **pk201 al pk270**", "montaje rectificador KMT en PRS/TRM". → El módulo de integridad del mockup mapea a actividad concreta.
- **La fibra óptica existe y es de OTA.** "Mantención OTA medición fibra óptica" aparece como causa de detención del oleoducto. → El DAS/fibra es real y del lado argentino; confirma que el "premio grande" DAS es territorio de tercero/binacional (horizonte, no fase 1).

---

## 3. Capa 3 y el mockup: lo que ya está modelado

El mockup no es una maqueta genérica: su modelo de dominio es casi un calco de las planillas **y** del BI. Traducción comercial: el "antes/después" no se construye de cero, ya corre.

| Concepto (Excel / BI) | Ya existe en el mockup |
|---|---|
| Movimiento base del balance | `Movement` (RECEPTION, TRANSFER, PIPELINE, VESSEL_LOAD/UNLOAD, REFINERY_DELIVERY) |
| Programado vs real por cargador | `VolumeTarget` (`budgetM3`/`programM3`/`realM3` por `shipperId`) |
| Nivel de estanque mm y m³ | `Tank.heightMm` + `currentLevelM3` (gauges tipo SCADA) |
| Horas acumuladas de bomba | `Equipment.operatingHours` + mantención `BY_HOURS` |
| Descuadre / unaccounted volume | `BalancePanel` + `WaterfallChart` |
| OT por tipo/estado (de OTC 360) | CMMS: `WorkOrder` con estado, prioridad, progreso |
| Presión / caudal / nivel (SCADA) | `TelemetryPoint` (PRESSURE / FLOW_RATE / LEVEL) |
| Integridad por pk (ILI, catódica) | Mapa lineal por pk + `CathodicReading` con umbrales NACE |
| **Diagrama de movimiento de crudo** | `FlowDiagram` (cockpit) — *ver §6* |

---

## 4. El valor agregado, ponderado y ordenado

El criterio de ranking es doble: **cuánto valor** y **a quién** — porque el error político que el propio documento identificó es que los *wants* del jefe son beneficios para él que paga el operador en fricción. El orden ganador le da algo al operador **primero** y hace caer los beneficios del jefe como consecuencia.

### 🥇 1. Balance volumétrico + descuadre — *ahora binacional, y por eso más fuerte aún*

Es regalo al operador y a gerencia en el mismo objeto, ya está en el mockup, **y** —hallazgo v2— el descuadre no es interno: es la reconciliación de custodia **OTA (Puerto Hernández) ↔ OTC (Terminal Concepción)** por cargador, que ya tiene su propia página en el BI y hasta talleres binacionales.

- *Para el operador:* ingresa el nivel/movimiento **una vez** y el descuadre por tramo/turno sale solo. Hoy lo tipea en tres hojas y arma la diferencia a mano.
- *Para gerencia y para la relación binacional:* el descuadre acumulado, diario y YTD por cargador — el número que OTA y OTC concilian — deja de esperar al cierre de mes.
- *Táctico:* obliga a mover la captura al ingreso, que es la **única vía** a los dos wants del jefe. El balance no compite con la trazabilidad: la arrastra gratis.

Este se lleva el "sí".

### 🥈 2. Captura operacional con validación al ingreso (modelo libro contable)

Lo que el balance necesita para existir, y donde se cumplen —mejor que hoy— los dos dolores del jefe. Validación al ingresar (*el costo de un error es el ciclo de turno*); corrección como **enmienda, nunca sobrescritura** (autor, timestamp, valor anterior). **La identidad por acción (estación + PIN) entra aquí, como mecanismo, no como titular:** al operador le vendes "ingresas una vez, se calcula solo, nunca más ves un login" — la identidad viaja adentro del regalo.

### 🥉 3. Reporte vivo (absorber el Power BI) — *el nuevo gran gancho gerencial*

El BI completo, pero **self-service y siempre al día**: allocation por cargador, ppto vs real, diferencias, detenciones, OT, permisos, GEI, comentarios de cierre. Deja de depender del armado mensual manual; cualquiera lo consulta cuando quiere, con drill-down. Es lo que más entusiasma al directorio porque **es lo que ya miran** — solo que ahora sin esperar y sin que alguien lo reconstruya.

### 4. Línea de tiempo unificada + LOTO firmado + handover + detenciones

Gobernanza e incidentes: una sola línea de tiempo (qué estaba bloqueado, quién trabajaba, qué hacía el ducto, quién causó la detención OTA/OTC). Aquí la identidad paga completo. `Informe_diario` y "Comentarios de Cierres" ya son un handover con firma… en texto libre; estructurarlo es barato y de alto valor.

### 5. DAS × permisos — *el horizonte, no la portada*

El premio grande y la ventaja defendible, pero depende de terceros (fibra es de OTA), de la tabla fibra→KP y de un feed de solo lectura. Es la visión que cierra la propuesta a 2-3 años, no el módulo con que se parte. Regla que no cambia: *enriquecer jamás suprimir; el operador decide siempre.*

---

## 5. "¿Lo haremos en tiempo real?" — la pregunta correcta

Sí, pero conviene no venderlo como *"todo en tiempo real"*, porque no todo lo es ni conviene que lo sea. El dato del BI tiene **tres velocidades**:

| Cadencia | Qué | Qué significa "vivo" aquí |
|---|---|---|
| **Continua / por turno** | Stock, balance, descuadre, flujo, nivel de estanque | Se actualiza a medida que la sala captura; con SCADA (que existe), casi en vivo. Esto es lo más cercano a tiempo real. |
| **Por evento** | Permisos, OT, detenciones, novedades, LOTO | Aparecen cuando ocurren, no al cierre de mes |
| **Periódica (mensual)** | Inventario GEI, capacitación, residuos, comentarios de cierre | Son mensuales por naturaleza; "vivo" = se arman solos y están siempre consultables, no que cambien cada minuto |

**La ganancia real sobre el BI no es latencia cero.** Es: (1) self-service para cualquiera, cuando quiera; (2) no más reconstrucción manual mensual; (3) drill-down al registro fuente; (4) una sola fuente en vez de Excel + BI + OTC 360 conciliados a mano. Prometer "streaming de todo" es prometer de más y desenfoca el verdadero valor.

---

## 6. La hoja estrella: el diagrama de movimiento de crudo

Es la página 3 del BI y, con razón, la que se quiere llevar a web con prioridad: es donde **convergen los datos más grandes** (todo el balance, ingresos OTA, stock por batería de estanques, entregas, buque) en una sola imagen. Debe ser el **hero del cockpit**.

### Las tres versiones que existen hoy

- **La del Power BI** (clip-art): riquísima en datos pero **estática, recargada y de una sola foto mensual**. Mezcla el régimen de 15 °C (ingresos OTA) con el de 60 °F (salidas OTC) sin explicar el salto. No es clickeable ni se puede interrogar.
- **Tu test en SVG** (el que adjuntaste, estilo plano moderno): **mucho mejor base** — limpio, direccional, on-brand, ya trae el instinto correcto (marcador "PUNTO CRÍTICO", chip "VER PLANTA TRM · 1 crítico"). Es el punto de partida bueno.
- **El `FlowDiagram` del mockup**: la infraestructura para que ese SVG sea **vivo** (estanques que animan nivel, simulación de caudal, tokens de diseño del sistema).

### Qué le falta a tu test para ser el hero (oportunidades de mejora)

Tu test está bien de forma; le falta ser **producto vivo y conectado**, no una lámina. Dirección concreta:

1. **Que respire, no que ilustre.** Ligarlo a la misma data del `BalancePanel`: cada estanque anima su nivel real, cada flujo se enciende cuando hay movimiento (▲IN / ▼OUT). El mockup ya simula esto; es enchufarlo.
2. **Explicar visualmente el salto de custodia.** Zona izquierda/upstream = **15 °C, ingresos OTA (Argentina)**; zona derecha/downstream = **60 °F, salidas OTC (Chile)**. Una banda o etiqueta sutil, no más números. Hoy el usuario no sabe por qué cambian las unidades a mitad de camino.
3. **Poner el descuadre EN el diagrama.** Un chip pequeño en la frontera de custodia (Puerto Hernández → Terminal Concepción) con la diferencia OTA↔OTC del día/mes y su %. Así el diagrama no solo es lindo: es la **puerta de entrada al número que importa** (clic → Reporte de Diferencias).
4. **Nodos clickeables → historial.** Clic en T-6010, en la válvula, en el buque, en un ingreso → drill a su detalle (stock en el tiempo, movimientos, equipos y permisos asociados). El diagrama se vuelve navegación, no decoración.
5. **Estados de equipo sobre el nodo.** Tu "PUNTO CRÍTICO" es el instinto correcto: extenderlo a estado LOTO/permiso/alerta por nodo (gris operativo / ámbar permiso / rojo LOTO), que es donde el "esquemático por KP" del documento vive de verdad.
6. **Alinearlo al sistema de diseño y al peor turno.** Usar los tokens del mockup (misma paleta/tipografía que cockpit/integridad/mantención), **modo oscuro primero** para la sala a las 3 AM, tipografía grande, alertas distinguibles sin leer. Es la pantalla grande de la sala: legible desde el otro lado del cuarto.

En una línea: **tu SVG es el molde correcto; falta llenarlo con datos vivos, el salto de custodia OTA/OTC, el descuadre como chip, y el clic a historial.** Eso lo convierte de lámina en el hero interrogable del cockpit.

---

## 7. Mapa de módulos: Excel/BI ↔ web ↔ mockup ↔ valor

| # | Módulo web | Reemplaza / absorbe | Ya en mockup | Le sirve a | Esfuerzo |
|---|---|---|---|---|---|
| 1 | **Diagrama de crudo (hero)** ⭐ | Página 3 del BI | `FlowDiagram` + tu SVG | Toda la sala + directorio | Medio (base lista) |
| 2 | **Balance & descuadre binacional** | `Mov_tk`, `Cont_vol_diario`, Reporte Diferencias | `BalancePanel`, `WaterfallChart` | Operador + Gerencia + OTA/OTC | Medio |
| 3 | **Captura operacional validada** (estación+PIN, enmienda) | El acto de tipear en todas las hojas | — (nuevo, sobre modelo existente) | Operador + los 2 wants del jefe | Alto (el corazón) |
| 4 | **Reporte vivo** (allocation, ppto vs real, GEI, capacitación, residuos) | Casi todo el BI mensual | `VolumeTarget`, KPIs, charts | Directorio + HSE | Medio |
| 5 | **Nominación por cargador** | `Progresivas_Batch`, Mov. por cargador | `VolumeTarget` | Gerencia + Comercial | Medio |
| 6 | **Buque (carga/descarga)** | `Car_Buque`, `Des_Buque` | `Movement` VESSEL_* | Operador + Terminal | Bajo-Medio |
| 7 | **Equipos, horas y OT** | `HRS_BBAS`, OT del BI (ya de OTC 360) | CMMS completo | Operador + Mantención | Bajo (ya está) |
| 8 | **Detenciones** | Reporte Oleoducto 16 | — (nuevo) | Operaciones + gobernanza OTA/OTC | Bajo-Medio |
| 9 | **Bitácora + handover + LOTO + permisos** | `Informe_diario`, Comentarios de Cierre, permisos | parcial | Operador + Seguridad | Medio |
| 10 | **Telemetría** (presión, caudal río) | `Inf_TRM`, `Inf_Caudal`, SCADA | `TelemetryPoint` | Cumplimiento + Mantención | Medio (lectura SCADA) |
| 11 | **Esquemático por KP** (capa sobre todo) | — (unifica) | Mapa integridad por pk | Toda la sala | Medio |
| 12 | **DAS × permisos** | — (horizonte) | eje KP habilita el cruce | Seguridad + Gerencia | Alto + 3ros |

Sobre **equipos (#7)**, que dejaste a mi criterio: **sí conviene, y es de los más baratos.** Las horas de bomba (`HRS_BBAS`) ya se anotan y el mockup ya tiene el CMMS que las consume; las OT ya salen de OTC 360. Es el caso más limpio de reciprocidad ("el dato que ya ingresas ahora te avisa cuándo vence la mantención") y vale la pena mostrarlo en la muestra visual.

---

## 8. Dónde vive esto: ya está respondido por ellos mismos

Recomendación (reforzada por la v2): **módulos nuevos dentro de OTC 360, compartiendo shell y sesión — no una app separada.**

Ya no es solo el argumento del documento ("mismas personas, mismo PC"). Es que **ellos ya lo están haciendo**: los comentarios de cierre muestran que crearon un "módulo de programador de mantenciones en OTC 360" y agregaron indicadores de backlog/tiempo de respuesta/OT en fecha. La propuesta no introduce un patrón nuevo; **acelera el que ya adoptaron.** El Excel sobrevive como salida exportable, no como fuente; el BI se absorbe como vistas vivas. El mockup en Vercel es el prototipo visual, no el hogar final.

---

## 9. Roadmap aterrizado

1. **Diagrama de crudo (hero) + esquemático por KP con estado real** *(cero captura nueva)*. La pantalla grande y la demo que ya gustó, ahora con datos reales de OTC 360. Requiere KP por equipo.
2. **Balance & descuadre binacional en vivo** sobre los movimientos que la sala ya registra. El gancho; demoable con `BalancePanel`.
3. **Reporte vivo** (absorber páginas del BI que no requieren captura nueva: allocation, ppto vs real, OT, GEI). Golpe de efecto para el directorio, bajo riesgo.
4. **Captura operacional validada** (estación + PIN + enmienda). Los dos wants del jefe. Migrar por archivo/estación, piloto con la cuadrilla más dispuesta — nunca big bang.
5. **Nominación, buque, detenciones, bitácora/handover/LOTO.** Sobre la captura ya instalada.
6. **Telemetría (lectura SCADA)** y luego **DAS × permisos.** El horizonte.

Los pasos 1 y 3 son "quick wins" de alto impacto visual sin captura nueva; el 2 es el gancho; el 4 es el corazón (y el riesgo). Se solapan.

---

## 10. Por confirmar antes de comprometer alcance

**Ya respondido por Excel + BI (no preguntar):**
- ✅ ¿Se tipea el mismo dato en varios archivos? **Sí.**
- ✅ ¿Se calcula descuadre hoy? **Sí, a mano, y es binacional OTA↔OTC.**
- ✅ ¿Existe SCADA/historian? **Sí** (homologación pantallas, setpoints, alarmas).
- ✅ ¿Se pueden hacer módulos en OTC 360? **Sí, ya los hacen.**
- ✅ ¿Integridad por pk real? **Sí** (ILI 30″, protección catódica pk201-270).

**Sigue abierto y crítico:**
- [ ] **¿Los equipos tienen KP hoy, o la ubicación es texto libre?** Define el tamaño real de la fase 1 del esquemático. (Trabajo de datos, no frontend.)
- [ ] **¿Cuánto de lo que se tipea a mano ya está en el SCADA?** Si presión/caudal/nivel vienen de instrumentos, el módulo de telemetría es lectura, no captura. ¿Se lee desde la red corporativa (DMZ, OPC UA, réplica)?
- [ ] **¿Red OT segregada? ¿La app puede vivir en la sala y hablar con OTC 360?** Arquitectura de despliegue.
- [ ] **¿Quién ejecuta los trabajos: sala, mantención, contratistas?** Cambia identidad y LOTO.
- [ ] **El presupuesto/programa mensual (para Ppto vs Real): ¿de dónde sale y quién lo carga?**

**Solo para el horizonte DAS:** proveedor de la fibra (es de OTA), si expone API/Modbus/OPC UA/syslog/correo, y la tabla de calibración fibra→KP.

---

## 11. El riesgo #1 sigue siendo el mismo — y el orden lo mitiga

**El riesgo es adopción, no tecnología.** Cinco personas, un PC, apuro; cualquier fricción sin algo a cambio se sabotea sola. Por eso el orden importa tanto como los módulos: liderar con **balance + reporte vivo + el diagrama hero** (le sacas re-tipeo al operador y le das su número a gerencia, con una pantalla que ya gusta) es empezar por el regalo. La identidad llega igual, adentro de algo que el operador quiere.

Todo lo demás es negociable. Esto no: **cada módulo tiene que devolverle algo al operador el día que se lo entregas, o no se usa.**

---

## Resumen en una línea para la reunión

> "Hoy tienen tres sistemas que alguien reconcilia a mano: el Excel donde se tipea, el Power BI que se arma una vez al mes, y OTC 360. Los unimos en uno solo, vivo: el operador ingresa una vez y el descuadre, la nominación y la mantención se calculan solos; el reporte que hoy esperan al cierre de mes está siempre al día y cualquiera lo consulta; y el diagrama de movimiento de crudo deja de ser una lámina para volverse la pantalla viva de la sala. Empezamos por lo que ya miran y por el número que ya hacen a mano."
