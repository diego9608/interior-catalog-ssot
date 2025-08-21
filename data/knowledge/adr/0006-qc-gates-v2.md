# ADR-0006: QC Gates v2

**Estado**: Aceptado  
**Fecha**: 2025-08-21  
**Autor**: Claude (Anthropic)

## Contexto

Después de M6 (BOM y etiquetas), necesitamos asegurar calidad en cada fase del proceso: pre-CNC, pre-instalación y entrega. Sin gates de calidad, los errores se propagan y resultan costosos de corregir en sitio.

## Decisión

Implementamos un sistema de QC por fases con severidades y gates que bloquean cuando hay fallas críticas (high).

### Arquitectura de Checklists

```yaml
phases:
  pre_cnc:
    gate:
      high_fail_blocks: true
    items:
      - id: CUT-COUNT
        type: auto_eq  # Automático sin input manual
        severity: high
        evidence: none
```

### Tipos de Validación

1. **auto_eq**: Comparación automática de fuentes internas
2. **number_range**: Valor debe estar en rango [min, max]
3. **number_max**: Valor no debe exceder máximo
4. **bool_true**: Debe ser verdadero

### Severidades y Gates

- **high**: Falla crítica, bloquea la fase si `high_fail_blocks: true`
- **medium**: Advertencia importante pero no bloqueante
- **low**: Observación menor

### Flujo de Trabajo

1. **Generación** (`qc:generate`):
   - Lee checklists.core.yaml
   - Calcula valores automáticos (cuts vs pieces)
   - Genera templates JSON por fase
   - Crea PDF checklist en blanco

2. **Verificación** (`qc:verify`):
   - Lee inputs/*.json con respuestas
   - Evalúa cada ítem según su tipo
   - Aplica lógica de gates
   - Genera reportes (JSON, MD, PDF)

### Integración CI/CD

```bash
CI_QC_ENFORCE=true npm run qc:verify
```

Si `CI_QC_ENFORCE=true` y hay fallas high → `process.exit(1)` bloquea el build.

## Alternativas Consideradas

1. **Checklist plano sin severidades**: Descartado por baja trazabilidad y falta de enforcement
2. **Solo PDF manual**: Descartado por falta de automatización y validación
3. **Web app completa**: Descartado por complejidad, optamos por JSON inputs + PDF

## Consecuencias

### Positivas

- **Calidad reproducible**: Mismo estándar en todos los proyectos
- **Gates automáticos**: Prevención de entregas con fallas críticas
- **Trazabilidad completa**: Responsable, timestamp, evidencia por ítem
- **Integración CI**: Deploy bloqueado si QC falla

### Negativas

- **Inputs manuales**: Requiere crear JSON manualmente (mitigado en M8 con app)
- **Sin evidencia integrada**: Fotos/videos referenciados pero no almacenados
- **Dependencia de PDFKit**: Package adicional para generar PDFs

## Implementación

### Scripts

- `qc-generate.js`: Genera templates y checklist PDF en blanco
- `qc-verify.js`: Evalúa inputs y genera reportes de resultados

### Archivos Generados

```
data/projects/DEMO-001/qc/
├── template.pre_cnc.json
├── template.pre_instalacion.json
├── template.entrega.json
└── inputs/
    ├── pre_cnc.json
    ├── pre_instalacion.json
    └── entrega.json

reports/
├── qc-DEMO-001-checklist.pdf    # Checklist en blanco
├── qc-DEMO-001.json              # Resultados JSON
├── qc-DEMO-001.md                # Resultados Markdown
└── qc-DEMO-001-results.pdf      # PDF con resultados
```

### Resultados DEMO-001

#### Escenario PASS
- **pre_cnc**: ✅ PASS (CUT-COUNT: 32=32, KERF: 3.0mm)
- **pre_instalacion**: ✅ PASS (PASO-UTIL: 1200mm)
- **entrega**: ✅ PASS (HOLGURA: 2mm)

#### Escenario FAIL
- **entrega**: ❌ FAIL (HOLGURA-FRENTES: 5mm fuera de rango 1-3mm)
- Con `CI_QC_ENFORCE=true`: ⛔ Build bloqueado

## Ejemplos de Ítems

### Pre-CNC
- CUT-COUNT: Verificación automática piezas = placements
- KERF-CAL: Calibración del kerf (2.5-3.5mm)
- ADH-STOCK: Adhesivos disponibles

### Pre-Instalación
- PASO-UTIL: Espacio de trabajo (1000-1500mm)
- NIVEL-PISO: Desnivel máximo (≤3mm/m)
- SERV-READY: Servicios listos

### Entrega
- HOLGURA-FRENTES: Separación entre frentes (1-3mm)
- CIERRE-DB: Ruido de cierre (≤55dB)
- SILICONADOS: Sellos continuos

## Futuro

1. **M8 - Field App**: PWA para captura de inputs desde móvil
2. **Firma digital**: Integración con DocuSign o similar
3. **Evidencia integrada**: Upload de fotos/videos a S3
4. **Sensores IoT**: Medición automática (sonómetro BLE, nivel láser)
5. **Dashboard web**: Visualización de métricas y tendencias QC