# QC Report - DEMO-001

**Generado:** 2025-08-21 00:23

## Estado General: ❌ RECHAZADO

### ✅ PRE CNC

- **Responsable:** Juan Pérez
- **Estación:** Corte/CNC
- **Fecha:** 2025-08-21 04:30
- **Resumen:** PASS: All checks passed

| Item | Descripción | Valor | Meta | Estado |
|------|-------------|-------|------|--------|
| CUT-COUNT | Total de piezas en cutlist coincide con piezas planificadas | 32 vs 32 | Igual | PASS |
| KERF-CAL | Kerf medido del disco (mm) | 3 | 2.5-3.5 mm | PASS |
| ADH-STOCK | Adhesivos requeridos disponibles (PUR zona húmeda, EVA interior) | true | Sí | PASS |
| EDG-BANDING | Rollo/banda para cantos disponible según piezas | true | Sí | PASS |
| CNC-TOOLING | Sierras/fresas en buen estado (MRO verificado) | true | Sí | PASS |

### ✅ PRE INSTALACION

- **Responsable:** María González
- **Estación:** Sitio
- **Fecha:** 2025-08-21 08:00
- **Resumen:** PASS: All checks passed

| Item | Descripción | Valor | Meta | Estado |
|------|-------------|-------|------|--------|
| PASO-UTIL | Paso útil en cocina | 1200 | 1000-1500 mm | PASS |
| SERV-READY | Servicios listos (eléctrico/agua/gas según aplique) | true | Sí | PASS |
| NIVEL-PISO | Desnivel de piso (mm por metro) | 2.5 | ≤3 mm/m | PASS |
| MUROS-PLANO | Desplome/planitud de muros (mm a 2 m) | 4 | ≤5 mm/2m | PASS |
| ANCLAJES | Anclajes y taquetes adecuados disponibles | true | Sí | PASS |

### ❌ ENTREGA

- **Responsable:** Carlos Martínez
- **Estación:** Instalación
- **Fecha:** 2025-08-21 10:45
- **Resumen:** FAIL: 1 high, 0 medium, 0 low failures

| Item | Descripción | Valor | Meta | Estado |
|------|-------------|-------|------|--------|
| HOLGURA-FRENTES | Holgura entre frentes | 5 | 1-3 mm | FAIL |
| ALINEACION | Alineación de frentes y nivel de líneas | true | Sí | PASS |
| CIERRE-DB | Cierre de puertas/cajones (dB a 1 m) | 52 | ≤55 dB | PASS |
| SILICONADOS | Sellos/siliconados continuos y limpios | true | Sí | PASS |
| LIMPIEZA | Limpieza final y entrega sin residuos | true | Sí | PASS |

**⚠️ Fallas críticas:** HOLGURA-FRENTES

