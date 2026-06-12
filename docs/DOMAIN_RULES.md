# Reglas de dominio — Pipeline Operations Platform

Este documento define las **reglas, fórmulas y supuestos** que la lógica de `lib/` debe implementar. Es la referencia que se le entrega a Claude Code para codificar el comportamiento del dominio.

> **Origen de las fórmulas y disclaimer**
> - Las fórmulas físicas (API gravity, conversión volumétrica) son **estándares públicos de la industria** (API/ASTM), no datos del cliente.
> - Los **umbrales, parámetros y supuestos** (rangos de alerta, frecuencias, tolerancias) son **valores inventados y razonables** para el proyecto. Están marcados con 🔧 y deben ajustarse o reemplazarse libremente.
> - Ningún valor proviene de datos reales del cliente.

---

## 1. Conversiones volumétricas (lib/volumetrics/conversions.ts)

El crudo cambia de volumen con la temperatura, por eso los reportes manejan el mismo movimiento expresado a distintas condiciones (15°C, 60°F, GSV). Estas son las conversiones base.

### 1.1 API gravity ↔ Specific Gravity (SG a 60°F)

Fórmula estándar API (verificada contra fuentes públicas de la industria):

```
SG@60F = 141.5 / (°API + 131.5)
°API   = (141.5 / SG@60F) − 131.5
```

- `SG` = densidad relativa al agua a 60°F.
- El agua a 60°F tiene SG = 1.0, equivalente a 10°API.
- Crudos típicos: 30–40 °API. (Ejemplo visto en reportes: Medanito ≈ 37.6 °API, OTASA-2 ≈ 38.5 °API.)

### 1.2 Densidad a condición de referencia

```
ρ_ref = SG@60F × ρ_water
```

- 🔧 `ρ_water` = **999.016 kg/m³** a 60°F (valor ASTM D1250 estándar). Usar esta constante.

### 1.3 Corrección de volumen por temperatura (VCF — Volume Correction Factor)

El estándar real es la tabla ASTM D1250 (compleja). Para el proyecto se usa una **aproximación lineal** con coeficiente de expansión térmica, que es suficiente y transparente:

```
V_ref = V_obs / (1 + α × (T_obs − T_ref))
```

- `V_obs` = volumen observado a temperatura `T_obs`.
- `V_ref` = volumen corregido a la temperatura de referencia `T_ref`.
- `T_ref` = 60°F (15.56°C) o 15°C según el destino de la conversión.
- 🔧 `α` = coeficiente de expansión térmica. Para crudo, rango típico **0.0005–0.0010 por °C**. Usar **0.0007 /°C** como valor por defecto del proyecto.
- ⚠️ Trabajar internamente en una sola escala de temperatura (°C) y convertir °F↔°C en los bordes:
  `°C = (°F − 32) × 5/9`

### 1.4 GSV (Gross Standard Volume)

Para el proyecto, GSV = volumen corregido a condición estándar (60°F) **sin** descontar agua y sedimentos (no modelamos BSW). Es decir, en este proyecto `GSV ≈ V@60F`. Se documenta así para evitar confusión: si más adelante se quisiera modelar agua/sedimento, GSV sería el neto.

### 1.5 Conversión 15°C ↔ 60°F (la que más aparece en los reportes)

Como 15°C ≈ 59°F y 60°F ≈ 15.56°C, la diferencia es pequeña pero existe. El procedimiento:

1. Llevar el volumen observado a `V@15C` con la fórmula 1.3 usando `T_ref = 15°C`.
2. Llevar el volumen observado a `V@60F` con la fórmula 1.3 usando `T_ref = 15.56°C`.

Ambos parten del mismo `V_obs`/`T_obs`. La función debe exponer ambas salidas.

**Tests sugeridos:** ida y vuelta (convertir y revertir devuelve el original ± epsilon); SG de 10°API = 1.0; volumen a T_ref = T_obs no cambia.

---

## 2. Balance volumétrico de estanque (lib/volumetrics/balance.ts)

Cada estanque y el sistema completo deben "cuadrar": lo que entra menos lo que sale debe igualar el cambio de stock.

### 2.1 Ecuación de balance

```
stock_final = stock_inicial + Σ(entradas) − Σ(salidas)
diferencia  = stock_final_medido − stock_final_calculado
```

- `entradas`: recepciones, trasvasijes entrantes, descargas de buque.
- `salidas`: trasvasijes salientes, cargas de buque, entregas a refinería.
- Todo en la **misma unidad** (GSV a 60°F recomendado, para ser consistente).

### 2.2 Tolerancia y alertas

- 🔧 Tolerancia aceptable de descuadre: **±0.5%** del stock final. Dentro de eso → OK.
- 🔧 Entre 0.5% y 1% → WARNING.
- 🔧 Mayor a 1% → CRITICAL (posible error de medición, fuga o registro).
- La función devuelve `{ calculado, medido, diferencia, porcentaje, nivel }`.

### 2.3 Nivel ↔ volumen del estanque

Los estanques miden altura (mm) y eso se traduce a volumen con un factor de conversión (tabla de aforo real; aquí se simplifica a lineal):

```
volumen = altura_mm × factor_aforo
```

- 🔧 `factor_aforo` por estanque (m³/mm). Inventar uno coherente con la capacidad:
  `factor_aforo = capacidad_m3 / altura_max_mm`.
- Ejemplo de los reportes: T-6010 con ~13.300 mm de altura máx y capacidad del orden de las decenas de miles de m³.

---

## 3. Simulación de flujo / caudal (lib/simulation/flow.ts)

Anima el llenado/vaciado de estanques en el cockpit en tiempo cuasi-real.

### 3.1 Modelo de caudal

```
Δvolumen = caudal_m3h × Δt_horas
nivel(t+Δt) = nivel(t) + Δvolumen_entrada − Δvolumen_salida
```

- `caudal_m3h`: caudal del movimiento activo (m³/h). De los reportes, valores del orden de **300–1500 m³/h** por estanque.
- `Δt_horas`: paso de simulación. En tiempo real Δt = (tiempo transcurrido) × factor de velocidad.

### 3.2 Restricciones físicas (la simulación nunca debe violarlas)

- `0 ≤ nivel ≤ capacidad`. Si un llenado superaría la capacidad → se topa en capacidad y se marca evento "tanque lleno".
- Un vaciado no puede dejar el nivel negativo → se topa en 0 y se marca "tanque vacío".
- 🔧 Margen operativo de seguridad: detener llenado al **95%** de capacidad (alarma de alto nivel, como los "HH NIVEL" de las pantallas SCADA).

### 3.3 Tiempo estimado de llenado/vaciado

```
horas_para_llenar = (capacidad − nivel_actual) / caudal_entrada
horas_para_vaciar = nivel_actual / caudal_salida
fecha_estimada = ahora + horas
```

(Esto reproduce la lógica de las tablas "Hora Llenado y vaciado".)

### 3.4 Factor de velocidad de simulación

- 🔧 Velocidades: **1x, 10x, 60x, 600x**. A 60x, un minuto real = una hora simulada.

---

## 4. Programación de mantención (lib/maintenance/scheduling.ts)

Calcula cuándo toca la próxima intervención de cada tarea.

### 4.1 Mantención por calendario

Según `frequency`, sumar el intervalo a la última ejecución:

| frequency  | intervalo |
|------------|-----------|
| DAILY      | +1 día |
| WEEKLY     | +7 días |
| MONTHLY    | +1 mes |
| QUARTERLY  | +3 meses |
| BIANNUAL   | +6 meses |
| ANNUAL     | +12 meses |

```
nextDueDate = ultimaEjecucion + intervalo(frequency)
```

### 4.2 Mantención por horas de operación (BY_HOURS)

Para equipos rotativos (bombas, agitadores) la mantención depende de horas acumuladas, no del calendario:

```
nextDueAtHours = ultimaIntervencionHoras + intervalHours
horasRestantes = nextDueAtHours − operatingHours_actual
```

- 🔧 Intervalos típicos inventados: bombas cada **2000 h**, agitadores cada **1500 h**.
- Si se conoce el promedio de horas/día del equipo, estimar la fecha:
  `fecha_estimada = ahora + (horasRestantes / horas_por_dia)`.

### 4.3 Estado de la tarea (para el tablero)

- 🔧 `VENCIDA`: nextDueDate < hoy (o horasRestantes < 0).
- 🔧 `PRÓXIMA`: faltan ≤ 7 días o ≤ 10% del intervalo de horas.
- 🔧 `OK`: el resto.
- 🔧 Regla de bloqueo: si `blockIfPreviousNotCompleted`, una tarea no se reprograma hasta cerrar la anterior (esto venía en tu esquema Prisma).

### 4.4 Priorización por criticidad

Ordenar el backlog de mantención combinando vencimiento y criticidad del equipo:

```
score = pesoVencimiento × urgencia + pesoCriticidad × nivelCriticidad
```

- 🔧 `nivelCriticidad`: LOW=1, MEDIUM=2, HIGH=3, CRITICAL=4.
- 🔧 Pesos: `pesoVencimiento = 0.6`, `pesoCriticidad = 0.4`. Mayor score = atender primero.

---

## 5. Integridad y protección catódica (lib/integrity/thresholds.ts)

Evalúa cada lectura catódica contra umbrales y genera alertas.

### 5.1 Criterio de protección

El criterio real de la industria (NACE/ISO) es el potencial "-850 mV on" respecto a electrodo Cu/CuSO₄. Para el proyecto se usa este criterio simplificado:

```
si potencial ≤ −0.850 V  → OK (bien protegido)
si −0.850 V < potencial ≤ −0.750 V → WARNING (protección marginal)
si potencial > −0.750 V → CRITICAL (subprotegido, riesgo de corrosión)
```

- 🔧 Estos umbrales (−0.850 / −0.750) son los valores estándar de referencia; ajustables.
- ⚠️ Atención al signo: los potenciales son negativos; "más protegido" = más negativo.

### 5.2 Sobreprotección (opcional)

- 🔧 Si potencial < **−1.200 V** → WARNING por sobreprotección (riesgo de desprendimiento de recubrimiento). Útil para mostrar que el rango es por ambos lados.

### 5.3 Detección de tendencia

Más allá del umbral puntual, marcar un punto si su potencial se **degrada de forma sostenida** respecto al histórico:

- 🔧 Si las últimas **3 lecturas** del mismo punto suben (se hacen menos negativas) de forma monótona → flag "tendencia a la baja", aunque aún esté en rango. Demuestra análisis de series, no solo umbral fijo.

---

## 6. KPIs de cumplimiento (lib/volumetrics/compliance.ts)

Para el cockpit: comparar real vs programa vs presupuesto.

```
cumplimiento_programa    = real / programa × 100
cumplimiento_presupuesto = real / presupuesto × 100
```

- 🔧 Banda objetivo: **95%–105%** = en meta (verde). Fuera de esa banda = desviación (amarillo/rojo).
- Participación por cargador: `participacion_i = volumen_i / Σ volumen × 100` (para el donut/waterfall).

---

## 7. Resumen de constantes y parámetros ajustables 🔧

Conviene centralizar todos estos en un único archivo `lib/domain/constants.ts`:

| Constante | Valor por defecto | Uso |
|-----------|-------------------|-----|
| `WATER_DENSITY_60F` | 999.016 kg/m³ | conversión densidad |
| `THERMAL_EXPANSION_ALPHA` | 0.0007 /°C | corrección por temperatura |
| `BALANCE_TOLERANCE_OK` | 0.5 % | balance de estanque |
| `BALANCE_TOLERANCE_WARN` | 1.0 % | balance de estanque |
| `TANK_HIGH_LEVEL_ALARM` | 95 % | simulación de llenado |
| `SIM_SPEEDS` | [1, 10, 60, 600] | velocidad de simulación |
| `PUMP_MAINT_INTERVAL_H` | 2000 h | mantención por horas |
| `AGITATOR_MAINT_INTERVAL_H` | 1500 h | mantención por horas |
| `CRITICALITY_WEIGHTS` | venc 0.6 / crit 0.4 | priorización |
| `CATHODIC_OK` | −0.850 V | protección catódica |
| `CATHODIC_WARN` | −0.750 V | protección catódica |
| `CATHODIC_OVERPROTECT` | −1.200 V | sobreprotección |
| `COMPLIANCE_BAND` | 95 %–105 % | KPIs de cumplimiento |

---

## 8. Lo que necesito de ti para cerrar este punto

Las fórmulas físicas están firmes. Lo que conviene que **revises o reemplaces** (todo lo marcado 🔧) son los parámetros operativos: intervalos de mantención, tolerancias de balance, umbrales, bandas de cumplimiento. Puedes:

- Dejar los valores inventados tal cual (son razonables para un portafolio), o
- Reemplazarlos por los que conozcas del dominio (sin que sean datos sensibles del cliente; un intervalo de mantención típico no lo es).

Una vez confirmados, este documento + el modelo de datos son suficientes para que Claude Code implemente toda la lógica de `lib/`.
