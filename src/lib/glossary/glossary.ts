export type GlossaryCategory = "Integridad" | "Volumetría" | "Mantención" | "Equipos"

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  "Integridad",
  "Volumetría",
  "Mantención",
  "Equipos",
]

export type GlossaryTerm = {
  id: string
  label: string
  short: string
  long?: string
  unit?: string
  threshold?: string
  category: GlossaryCategory
}

export const GLOSSARY: Record<string, GlossaryTerm> = {
  "proteccion-catodica": {
    id: "proteccion-catodica",
    label: "Protección catódica",
    short: "Técnica que previene la corrosión del acero del ducto convirtiéndolo en el cátodo de una celda electroquímica.",
    long: "Se logra mediante ánodos de sacrificio o por corriente impresa desde rectificadores. Al mantener el acero como cátodo, se suprime la reacción de corrosión sobre la pared del ducto.",
    category: "Integridad",
  },
  "potencial-catodico": {
    id: "potencial-catodico",
    label: "Potencial catódico",
    short: "Tensión eléctrica (en volts) entre el ducto y el suelo que indica si la protección contra corrosión está activa.",
    long: "Se mide respecto a un electrodo de referencia de cobre/sulfato de cobre (Cu/CuSO₄). Cuanto más negativo el valor, mayor el nivel de protección del acero.",
    unit: "V",
    category: "Integridad",
  },
  "criterio-085": {
    id: "criterio-085",
    label: "Criterio −0.85 V",
    short: "Umbral estándar de protección catódica adecuada.",
    long: "Según práctica internacional (NACE/ISO), un potencial igual o más negativo que −0.85 V indica que el acero está protegido contra la corrosión.",
    threshold: "≤ −0.85 V",
    category: "Integridad",
  },
  "nivel-protegido": {
    id: "nivel-protegido",
    label: "Protegido",
    short: "El ducto está adecuadamente protegido contra la corrosión.",
    long: "Potencial igual o más negativo que −0.85 V. La protección catódica cumple el criterio.",
    threshold: "≤ −0.85 V",
    category: "Integridad",
  },
  "nivel-marginal": {
    id: "nivel-marginal",
    label: "Marginal",
    short: "Protección insuficiente; requiere atención antes de volverse crítica.",
    long: "Potencial entre −0.85 V y −0.75 V. El nivel de protección está por debajo del criterio recomendado y debe corregirse.",
    threshold: "−0.85 V a −0.75 V",
    category: "Integridad",
  },
  "nivel-sin-proteccion": {
    id: "nivel-sin-proteccion",
    label: "Sin protección",
    short: "El acero queda expuesto a corrosión activa; riesgo de pérdida de integridad.",
    long: "Potencial menos negativo que −0.75 V. La protección catódica no cumple su función y debe restablecerse con prioridad.",
    threshold: "> −0.75 V",
    category: "Integridad",
  },
  "sobreproteccion": {
    id: "sobreproteccion",
    label: "Sobreprotección",
    short: "Exceso de corriente de protección que puede dañar el recubrimiento del ducto.",
    long: "Potencial excesivamente negativo (más allá de aproximadamente −1.20 V). Puede causar desprendimiento del recubrimiento (disbondment) y fragilización por hidrógeno del acero.",
    threshold: "< −1.20 V",
    category: "Integridad",
  },
  "rectificador": {
    id: "rectificador",
    label: "Rectificador",
    short: "Equipo que inyecta corriente continua al sistema de protección catódica.",
    long: "Convierte la corriente alterna (CA) de la red en corriente continua (CC) y la inyecta al ducto mediante un sistema de corriente impresa, manteniendo el potencial de protección a lo largo del tramo.",
    category: "Integridad",
  },
  "punto-catodico": {
    id: "punto-catodico",
    label: "Punto catódico",
    short: "Ubicación del ducto donde se mide el potencial catódico.",
    long: "Identificado por su progresiva (km), es el lugar físico donde se toma la lectura de potencial para verificar el estado de la protección.",
    category: "Integridad",
  },
  "progresiva": {
    id: "progresiva",
    label: "Progresiva (PK)",
    short: "Distancia acumulada en kilómetros desde el origen del ducto (PK 0).",
    long: "El punto kilométrico (PK) ubica estaciones, segmentos y puntos de medición a lo largo del trazado del ducto.",
    unit: "km",
    category: "Integridad",
  },
  "tendencia-degradacion": {
    id: "tendencia-degradacion",
    label: "Tendencia",
    short: "Dirección del potencial a lo largo del tiempo.",
    long: "Una tendencia hacia valores menos negativos indica que la protección catódica se está degradando y el punto se acerca a un estado marginal o crítico.",
    category: "Integridad",
  },
  "segmento": {
    id: "segmento",
    label: "Segmento",
    short: "Tramo del ducto entre dos puntos de referencia.",
    long: "Agrupa mediciones y análisis de integridad para una porción definida del ducto.",
    category: "Integridad",
  },
  // ---------------------------------------------------------------------------
  // Volumetría
  // ---------------------------------------------------------------------------
  "entradas": {
    id: "entradas",
    label: "Entradas",
    short: "Volumen de producto que ingresa al sistema en un período.",
    long: "Suma de los flujos de recepción al ducto o a una estación durante el intervalo medido.",
    unit: "m³",
    category: "Volumetría",
  },
  "salidas": {
    id: "salidas",
    label: "Salidas",
    short: "Volumen de producto que egresa del sistema en un período.",
    long: "Suma de los flujos de entrega del ducto o de una estación durante el intervalo medido.",
    unit: "m³",
    category: "Volumetría",
  },
  "delta-stock": {
    id: "delta-stock",
    label: "Δ Stock",
    short: "Variación neta del inventario en el período.",
    long: "Diferencia entre entradas y salidas (Δstock = entradas − salidas). Positivo indica acumulación de inventario; negativo, reducción.",
    unit: "m³",
    category: "Volumetría",
  },
  "balance-volumetrico": {
    id: "balance-volumetrico",
    label: "Balance volumétrico",
    short: "Comparación entre lo que entra, lo que sale y la variación de inventario.",
    long: "Permite detectar diferencias no explicadas (pérdidas, errores de medición) cuando entradas, salidas y variación de stock no cuadran.",
    category: "Volumetría",
  },
  "programa": {
    id: "programa",
    label: "Programa",
    short: "Volumen planificado de transporte para el período.",
    long: "Plan operativo acordado de cuánto producto se moverá; sirve de referencia para medir el cumplimiento real.",
    unit: "m³",
    category: "Volumetría",
  },
  "presupuesto": {
    id: "presupuesto",
    label: "Presupuesto",
    short: "Volumen de referencia fijado en la planificación de mayor nivel.",
    long: "Cifra presupuestaria definida con anticipación; se compara con el programa y el volumen real.",
    unit: "m³",
    category: "Volumetría",
  },
  "cumplimiento": {
    id: "cumplimiento",
    label: "Cumplimiento",
    short: "Qué tan cerca está el volumen real del programado.",
    long: "Porcentaje del volumen real respecto del programa. Una banda de 95–105% suele considerarse aceptable.",
    threshold: "95–105%",
    category: "Volumetría",
  },
  "cargador": {
    id: "cargador",
    label: "Cargador",
    short: "Empresa que contrata el transporte de su producto por el ducto.",
    long: "También llamado 'shipper': es el dueño del producto que paga por moverlo. El cumplimiento se mide por cargador.",
    category: "Volumetría",
  },
  "api-gravity": {
    id: "api-gravity",
    label: "Gravedad API",
    short: "Medida de la densidad del crudo respecto del agua.",
    long: "Escala del American Petroleum Institute: a mayor grado API, más liviano y de mayor valor es el crudo. Por debajo de 10° API el crudo es más denso que el agua.",
    unit: "°API",
    category: "Volumetría",
  },
  "metro-cubico": {
    id: "metro-cubico",
    label: "Metro cúbico (m³)",
    short: "Unidad de volumen usada para medir el producto transportado.",
    long: "Un metro cúbico equivale a 1.000 litros. Es la unidad estándar para volúmenes de petróleo y derivados.",
    unit: "m³",
    category: "Volumetría",
  },
  "temperatura-producto": {
    id: "temperatura-producto",
    label: "Temperatura",
    short: "Temperatura del producto almacenado o en tránsito.",
    long: "Afecta el volumen por dilatación térmica y la viscosidad del crudo; se usa para corregir mediciones a condiciones de referencia.",
    category: "Volumetría",
  },
  "estacion": {
    id: "estacion",
    label: "Estación",
    short: "Instalación a lo largo del ducto que cumple una función operativa.",
    long: "Puede ser de bombeo, recepción, despacho o terminal. Agrupa tanques y equipos en un punto kilométrico del ducto.",
    category: "Volumetría",
  },
  "tanque": {
    id: "tanque",
    label: "Tanque",
    short: "Recipiente de almacenamiento de producto en una estación.",
    long: "Su nivel de llenado, capacidad, producto y temperatura se monitorean para gestionar el inventario.",
    category: "Volumetría",
  },
  "nivel-tanque": {
    id: "nivel-tanque",
    label: "Nivel de llenado",
    short: "Porcentaje de la capacidad del tanque ocupado por producto.",
    long: "Indica cuánto producto contiene el tanque respecto de su capacidad total; clave para evitar rebalse o vaciado.",
    unit: "%",
    category: "Volumetría",
  },
  // ---------------------------------------------------------------------------
  // Mantención
  // ---------------------------------------------------------------------------
  "mantenimiento-vencido": {
    id: "mantenimiento-vencido",
    label: "Vencida",
    short: "Tarea de mantención cuya fecha límite ya pasó sin ejecutarse.",
    long: "Representa un riesgo operativo: el equipo opera fuera de su intervalo de mantención recomendado. Requiere acción prioritaria.",
    category: "Mantención",
  },
  "mantenimiento-proximo": {
    id: "mantenimiento-proximo",
    label: "Próxima",
    short: "Tarea de mantención cuya fecha de ejecución se acerca.",
    long: "Está dentro de la ventana de anticipación; conviene planificarla antes de que venza.",
    category: "Mantención",
  },
  "orden-trabajo": {
    id: "orden-trabajo",
    label: "Orden de Trabajo (OT)",
    short: "Documento que autoriza y registra un trabajo de mantención sobre un equipo.",
    long: "Detalla la tarea, el equipo, la prioridad y el estado de avance. Es la unidad de ejecución del mantenimiento.",
    category: "Mantención",
  },
  "criticidad": {
    id: "criticidad",
    label: "Criticidad",
    short: "Nivel de importancia de un equipo para la operación y la seguridad.",
    long: "Determina la prioridad y la frecuencia de mantención: mayor criticidad implica mayor impacto si el equipo falla (BAJA, MEDIA, ALTA, CRÍTICA).",
    category: "Mantención",
  },
  "equipos-criticos": {
    id: "equipos-criticos",
    label: "Equipos críticos",
    short: "Equipos cuya falla tiene el mayor impacto operativo o de seguridad.",
    long: "Reciben mantención prioritaria y monitoreo más frecuente por su rol clave en el sistema.",
    category: "Mantención",
  },
  "mantenimiento-preventivo": {
    id: "mantenimiento-preventivo",
    label: "Mantención preventiva",
    short: "Trabajo planificado para evitar fallas antes de que ocurran.",
    long: "Se ejecuta a intervalos regulares (por tiempo u horas de operación) para conservar el equipo y reducir fallas imprevistas.",
    category: "Mantención",
  },
  "mantenimiento-correctivo": {
    id: "mantenimiento-correctivo",
    label: "Mantención correctiva",
    short: "Trabajo para reparar un equipo que ya falló o presenta una anomalía.",
    long: "Restablece la función del equipo tras una falla; suele ser no planificado y de mayor costo que el preventivo.",
    category: "Mantención",
  },
  "mantenimiento-predictivo": {
    id: "mantenimiento-predictivo",
    label: "Mantención predictiva",
    short: "Trabajo basado en la condición real del equipo medida con sensores o análisis.",
    long: "Anticipa la falla monitoreando variables (vibración, temperatura, etc.) para intervenir justo antes de que ocurra.",
    category: "Mantención",
  },
  "frecuencia-mantenimiento": {
    id: "frecuencia-mantenimiento",
    label: "Frecuencia",
    short: "Cada cuánto se repite una tarea de mantención.",
    long: "Puede ser por calendario (diaria, semanal, mensual, trimestral, semestral, anual) o por horas de operación del equipo.",
    category: "Mantención",
  },
  "plan-mantenimiento": {
    id: "plan-mantenimiento",
    label: "Plan de mantención",
    short: "Conjunto de tareas de mantención programadas para un equipo.",
    long: "Agrupa las tareas con su tipo y frecuencia, definiendo el régimen de cuidado del equipo en el tiempo.",
    category: "Mantención",
  },
  // ---------------------------------------------------------------------------
  // Equipos
  // ---------------------------------------------------------------------------
  "tag": {
    id: "tag",
    label: "Tag",
    short: "Código único que identifica un equipo en la instalación.",
    long: "Nomenclatura estándar (por ejemplo J-6010 o MOV-111) que identifica de forma inequívoca cada equipo para operación, mantención e integridad.",
    category: "Equipos",
  },
  "tipo-equipo": {
    id: "tipo-equipo",
    label: "Tipo de equipo",
    short: "Categoría funcional del equipo.",
    long: "Indica la función del equipo dentro del sistema: bomba, válvula, agitador, motor, transformador o rectificador, entre otros.",
    category: "Equipos",
  },
}

export function getTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY[id]
}
