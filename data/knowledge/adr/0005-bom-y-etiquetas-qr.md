# ADR-0005: BOM y Etiquetas QR

**Estado**: Aceptado  
**Fecha**: 2025-08-21  
**Autor**: Claude (Anthropic)

## Contexto

Después de M4 (optimización de corte), necesitamos trazabilidad completa desde el diseño hasta la instalación. Sin un BOM consolidado y etiquetas identificadoras, los errores en producción e instalación son frecuentes.

## Decisión

Implementamos un sistema de generación de BOM consolidado y etiquetas SVG con códigos QR para cada pieza y hoja.

### Arquitectura de BOM

```json
{
  "materials": {
    "panels": { /* desde cuts report */ },
    "countertops": { /* desde intake */ }
  },
  "hardware": { /* conteo desde scope */ },
  "adhesives": [ /* desde especificaciones */ ],
  "sheets": [ /* resumen por hoja */ ],
  "pieces": [ /* detalle por pieza con UID único */ ]
}
```

### Sistema de Etiquetas

- **Formato**: SVG con QR embebido (sin PNGs externos)
- **Tamaño**: 100×60mm configurable
- **Payload QR**: JSON compacto offline-friendly
- **Identificador único**: `piece_uid = piece_id#nn` (ej: DF-001#01)

### Campos en Etiqueta de Pieza

- Proyecto ID
- Pieza UID / ID
- Material (forma corta)
- Dimensiones y rotación
- Hoja # y posición X,Y
- Mapa de cantos (F/B/L/R)
- QR con payload JSON

### Payload QR JSON

```json
// Pieza
{"p":"DEMO-001","u":"DF-001#01","m":"mat.melamina.mdf18_mr","s":1,"x":0,"y":2149}

// Hoja
{"p":"DEMO-001","sheet":1,"m":"mat.melamina.mdf18_mr"}
```

## Alternativas Consideradas

1. **PNGs para QR**: Descartado por peso de archivos y complejidad de renderizado
2. **Códigos de barras 1D**: Descartado por baja densidad de datos
3. **UUID aleatorios**: Descartado, mejor usar IDs secuenciales legibles
4. **PDF multipágina**: Descartado, SVGs individuales más flexibles

## Consecuencias

### Positivas

- **Trazabilidad completa**: Cada pieza rastreable desde corte hasta instalación
- **Menos errores**: Identificación clara reduce equivocaciones
- **Offline-first**: QR contiene toda la info sin depender de red
- **Integración futura**: Base para apps móviles de escaneo

### Negativas

- **Dependencia npm**: Requiere qrcode package
- **Volumen de archivos**: 32 piezas = 32 SVGs (mitigado por ser texto)
- **Impresión**: Requiere impresora de etiquetas o A4 con plantilla

## Implementación

### Scripts

- `generate-bom-and-labels.js`: Genera BOM, etiquetas y manifest
- Integrado en pipeline: `npm run build`

### Archivos Generados

```
data/projects/DEMO-001/
├── bom.json              # BOM consolidado
├── labels/
│   ├── pieces/           # 32 etiquetas de piezas
│   └── sheets/           # 3 etiquetas de hojas
reports/
├── bom-DEMO-001.md       # BOM en markdown
└── labels-manifest-DEMO-001.csv  # Índice de etiquetas
```

### Resultados DEMO-001

- **Materiales**: 8.93 m² paneles, 2.6 m² encimera
- **Hardware**: 6 guías, 16 bisagras
- **Adhesivos**: 2 tipos (zona húmeda, interior)
- **Etiquetas**: 32 piezas + 3 hojas = 35 total

## Futuro

1. **URL corta**: Cuando `base_url` configurado, generar links a app
2. **Lote/Tienda**: Añadir para reposición de piezas
3. **Plantilla A4**: Auto-maquetado para imprimir múltiples etiquetas
4. **App móvil**: Escaneo QR → info detallada + checklist instalación
5. **Integración ERP**: Export a sistemas de inventario