# Guion de demo — recorrido verificado

Guion operativo del recorrido de venta (§9 del plan), con los valores concretos que
funcionan hoy contra la seed actual. Pantalla 1440×900, tema oscuro, `npm run dev`.

**PINs de la demo** (esquema mock: últimos 4 dígitos del ID de operador):
María Soto `0580` · Juan Pérez `0581` · Carla Muñoz `0582` · Diego Herrera `0583` · Ana Riquelme `0584`.

## Beats

1. **Hero — Movimiento de Crudo** (`/cockpit`).
   Decir: *"Su diagrama de la página 3 del BI, pero vivo."*
   Se ve: estado global PRECAUCIÓN · 1 TANQUE, caudal ~19.089 m³/h, 23 flujos activos,
   estanques respirando, estados de nodo (ALERTA en Ingreso OldelVal, PERMISO en Puerto
   Hernández, LOTO en Terminal Concepción) y el chip verde **Descuadre OTA↔OTC −298 m³ · −0,19 %**.

2. **Declarar el turno.** Botón **+ Captura de datos** → *Declarar dotación del turno* →
   dejar los 5 operadores marcados → **Declarar turno**.
   Decir: *"La estación nunca pide login; la dotación declarada habilita la identidad por acción."*

3. **Lectura de estanque con validación.** Tipo *Lectura de estanque* → estanque
   **T-6010 · Terminal Concepción** (stock registrado 27.500 m³ / capacidad 50.000 m³) →
   nivel **29.500** → aparece la **advertencia**: difiere 7,3 % del stock, sobre la tolerancia de 1 %.
   Decir: *"Si tipeo un valor raro, el sistema me lo dice acá, no tres días después."*
   Confirmar con PIN: María Soto · `0580`. Queda **CAP-0001**.

4. **Efecto en vivo.** Cerrar el drawer: T-6010 sube de 55 % a **59 %** en el diagrama y el
   balance recalcula. Decir: *"Un ingreso, muchos usos — se acabó el doble tipeo."*

5. **Corregir un valor (enmienda).** Reabrir captura → en *Registros del turno*,
   **Traza / Corregir** sobre CAP-0001 → **Corregir registro vigente** → nivel **28.900** →
   **Corregir con PIN** con otro operador (Juan Pérez · `0581`).
   Se ve: **CAP-0001 REEMPLAZADO / CAP-0002 VIGENTE**, con "Corrige a CAP-0001 · antes: 29.500 m³".
   Decir: *"No borro: queda la enmienda, con quién y cuándo. Como un libro contable."*

6. **Horas de bomba.** Tipo *Horas de bomba* → equipo **AG-012 — Bomba de Reserva
   Confluencia** (acumuladas **1.882 h**) → horas **8** → PIN → acumuladas pasan a **1.890 h**
   y el aviso indica *quedan 426 h para la mantención a las 2.316 h*.
   Guardias que se pueden mostrar sin miedo: **16 h** da advertencia (turno típico 12 h),
   **30 h** bloquea (máximo físico 24 h), y **J-6010** (Bomba de Despacho T-6010) advierte
   porque figura **fuera de servicio**.
   Rematar con **Ver equipo →**: en `/equipment/EQP-0034` la franja de horas muestra
   *1.890 h acumuladas · Última captura: +8 h por María Soto (CAP-0003)*.

7. **Descuadre binacional OTA↔OTC.** Volver a `/cockpit`, bajar al panel *Descuadre
   Binacional*: tabla por cargador (Pampa −177 · CGC +27 · Vista −73 · YPF −75 = **−298 m³ ·
   −0,19 %** en MES 2026-06) y el gráfico de descuadre por cargador.
   Decir: *"El número que concilian con OTA, al día, por cargador."*

8. **Reportes.** Nav **Reportes** → abrir *Diferencias* desde el landing (o
   **Ver reporte completo →** del panel): vista MES y **YTD** (−1.396 m³ · −0,14 %;
   el YTD acumula solo los meses 2026 con serie en la demo, enero–junio).
   Pasar rápido por los otros cinco: *Allocation* (participación por cargador),
   *Presupuesto vs Real* (solo may/jun 2026 tienen real cerrado; los "—" son meses sin
   cierre, indicado al pie), *Detenciones* (2025-07 y 2026-02 no aparecen a propósito:
   meses sin eventos no se listan), *Medio Ambiente* y *Cierres del Mes*.
   Decir: *"Todo el BI, sin que nadie lo reconstruya cada mes."*

9. **Cierre.** *"Nada de esto pide capturar dos veces. Empieza por lo que ya miran y por el
   número que ya hacen a mano — y por fin el dato sabe quién lo escribió y cuándo."*

## Notas para quien presenta

- Los montos exactos del hero (caudal, recibido/entregado) varían con el reloj de
  simulación; el descuadre mensual −298 m³ y los valores de captura de arriba son estables.
- Si la simulación corre en 60×/600×, volver a 1× antes de capturar para que los niveles
  no se muevan mientras se habla.
- La demo es sintética y de estado local: refrescar el navegador reinicia turno y registros.
