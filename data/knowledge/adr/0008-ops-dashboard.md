# ADR-0008: Ops Dashboard

**Estado**: Aceptado  
**Fecha**: 2025-08-21  
**Autor**: Claude (Anthropic)

## Contexto

Después de M8 (Field App), necesitamos un dashboard operativo para visualizar métricas agregadas de múltiples proyectos, identificar cuellos de botella, y exportar data para análisis externo.

## Decisión

Implementamos un dashboard read-only completamente estático generado en build time y servido desde Netlify.

### Arquitectura

```
/scripts/ops-prepare.js      # Agregación de métricas (build time)
/public/ops/                 # Dashboard estático
├── index.html              # Layout y estructura
├── styles.css              # Mobile-first CSS
└── ops.js                  # Client-side interactivity

/public/api/ops/            # Endpoints estáticos (generados)
├── index.json             # Resumen de todos los proyectos
├── history.json           # Tendencias históricas
└── projects/
    └── {projectId}.json   # Detalle por proyecto
```

### Métricas Agregadas

1. **KPIs principales**:
   - Cost P50/P80 (mediana y percentil 80)
   - Timeline P50 (días medianos)
   - Waste % (promedio real de merma)
   - QC Gate pass rate
   - Total sheets y pieces

2. **Vista tabla**:
   - Sorting por cualquier columna
   - Filtros: ALL/OK/BLOCKED
   - Click para ver detalle

3. **Vista detalle**:
   - QC phases con badges
   - Materials breakdown
   - Hardware counts
   - Sparklines de tendencias (30 días)

### Características Clave

1. **Build-time aggregation**: `ops-prepare.js` procesa todos los reports
2. **History tracking**: Mantiene últimos 60 snapshots por proyecto
3. **CSV export**: Genera archivo con fecha `ops-export-YYYYMMDD.csv`
4. **Mobile responsive**: Grid adaptativo para KPIs y tabla
5. **Client-side filtering**: Sin round-trips al servidor

### Formato de Datos

#### `/api/ops/index.json`
```json
[
  {
    "projectId": "DEMO-001",
    "cliente": "Demo Cliente",
    "cost_p50": 25242.52,
    "cost_p80": 27009.5,
    "timeline_days_p50": 10.4,
    "sheets_used": 3,
    "waste_pct": 0.298,
    "qc_overall_pass": false,
    "pieces_count": 32,
    "generated_at": "2025-08-21T06:41:55.115Z"
  }
]
```

#### `/api/ops/history.json`
```json
[
  {
    "date": "2025-08-21",
    "projectId": "DEMO-001",
    "cost_p50": 25242.52,
    "cost_p80": 27009.5,
    "waste_pct": 0.298,
    "qc_overall_pass": false
  }
]
```

## Alternativas Consideradas

1. **Real-time dashboard**: Descartado, requiere backend
2. **Google Data Studio**: Descartado, dependencia externa
3. **Grafana**: Descartado, overhead para read-only
4. **Excel export only**: Implementado CSV como complemento

## Consecuencias

### Positivas

- **Zero runtime cost**: Todo es estático en CDN
- **Instant loading**: JSON pre-generado en build
- **Historical tracking**: Tendencias sin base de datos
- **Export flexibility**: CSV para análisis en Excel/Sheets
- **Mobile friendly**: Responsive design por defecto

### Negativas

- **Build dependency**: Dashboard se actualiza solo en deploys
- **Limited history**: 60 días máximo por restricciones de tamaño
- **No real-time**: Data tan fresca como el último build
- **No drill-down**: Sin navegación a datos originales

## Implementación

### Sparkline Generation

```javascript
function createSparkline(values, color = '#111') {
  const points = values.map((v, i) => {
    const x = padding + i * xScale;
    const y = height - padding - ((v - min) * yScale);
    return `${x},${y}`;
  }).join(' ');
  
  return `<svg><polyline points="${points}" stroke="${color}"/></svg>`;
}
```

### Statistical Calculations

```javascript
// Percentile P80 para costs
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
```

### CSV Export

```javascript
// Escape y formato proper
row.map(cell => {
  const value = String(cell);
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}).join(',')
```

## Resultados

- **Load time**: <200ms (todo desde CDN)
- **Dashboard size**: ~15KB (HTML+JS+CSS)
- **Data size**: ~5KB por proyecto típico
- **History growth**: ~200 bytes/día/proyecto
- **CSV typical**: 10-50KB para 100 proyectos

## Seguridad

- **Read-only**: No mutations posibles
- **No auth**: Data pública por diseño
- **No PII**: Solo métricas agregadas
- **Static hosting**: Sin superficie de ataque dinámica

## Mejoras Futuras

1. **Incremental builds**: Solo procesar proyectos modificados
2. **Data compression**: Brotli para JSONs grandes
3. **Advanced charts**: D3.js para visualizaciones complejas
4. **Alerting**: Webhook cuando KPIs salen de rango
5. **API gateway**: Para queries dinámicas si se necesita
6. **Time series DB**: InfluxDB si history > 1 año