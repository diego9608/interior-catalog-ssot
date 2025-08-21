# ADR-0004: Cost Override por Merma Real

**Estado**: Aceptado  
**Fecha**: 2025-08-21  
**Autor**: Claude (Anthropic)

## Contexto

En M3 calculamos costos de paneles usando un factor heurístico de merma (10% para melamina). Sin embargo, M4 introdujo un optimizador de corte que calcula la merma **real** (29.8% en DEMO-001). Esta diferencia impacta significativamente los costos finales.

## Decisión

Implementamos un sistema de **override opcional** que permite recalcular costos de paneles usando la merma real del optimizador de corte.

### Arquitectura

```
data/catalog/pricing/costs.config.json
├── use_cut_merma_override: boolean
├── optimization_baseline_waste_pct: number (0.35)
├── apply_salvage_credit: boolean
└── salvage_credit_pct: number (0.20)
```

### Flujo de Cálculo

1. **Heurístico** (siempre calculado):
   - Área estimada = lineales_base × 1.2 + lineales_altos × 0.8
   - Costo = área × precio_m2 × (1 + waste_factor_pct)

2. **Override Real** (si habilitado y existe cuts-*.json):
   - Lee reports/cuts-{projectId}.json
   - Costo real = hojas_usadas × área_hoja × precio_m2
   - Si salvage_credit: descuenta valor de offcuts

3. **Métricas de Comparación**:
   - **Delta vs heurístico**: Diferencia entre real y estimado
   - **Ahorro vs naive**: Comparación con baseline sin optimización (35% merma)

## Consecuencias

### Positivas
- Costos más precisos basados en uso real de material
- Visibilidad del valor de la optimización de corte
- Sistema flexible con configuración centralizada

### Negativas
- Dependencia entre módulos (calc-costs necesita cuts report)
- Complejidad adicional en el cálculo
- Potencial inconsistencia si cuts report está desactualizado

## Implementación

### Modificaciones en calc-costs.js

```javascript
// Estructura del breakdown.paneles
{
  heuristic: {
    area_m2: 6.24,
    waste_pct_pricing: 0.10,
    cost: 1921.92
  },
  override_real: {
    enabled: true,
    materials: {
      "mat.melamina.mdf18_mr": {
        sheets_used: 3,
        waste_pct_real: 0.298,
        cost: 2500.51
      }
    },
    cost_total: 2500.51,
    delta_vs_heuristic: 578.59,
    optimization_savings_vs_naive: 198.17
  }
}
```

### Resultados en DEMO-001

| Método | P50 (MXN) | P80 (MXN) | Merma |
|--------|-----------|-----------|--------|
| Heurístico | 24,497.58 | 26,212.41 | 10% |
| Real sin salvage | 25,242.52 | 27,009.50 | 29.8% |
| Real con salvage | 25,187.09 | 26,950.19 | 29.8% |

**Delta**: +578.59 MXN (2.4% incremento)  
**Ahorro vs naive**: 198.17 MXN (optimización exitosa)

## Notas

- El override es **opcional** y controlado por flag
- Mano de obra siempre usa área heurística (consistencia)
- Salvage credit aplica 20% del valor de offcuts
- Sistema extensible para futuros tipos de override