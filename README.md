# Interior Catalog SSOT

Sistema de catálogo con validación para proyectos de interiores. Implementa Single Source of Truth (SSOT) con validación automática pre-deploy.

## 🚀 Quick Start

```bash
# Instalar dependencias (ninguna requerida para M1)
npm install

# Validar catálogos
npm run validate:data

# Build (incluye validación)
npm run build
```

## 📁 Estructura

```
/data/
  /catalog/       # Catálogos maestros
    materials/    # Materiales (cuarzo, melamina, madera)
    hardware/     # Herrajes (bisagras, guías)
    adhesives/    # Adhesivos (PUR, EVA)
    vendors/      # Proveedores
    tokens/       # Paletas y estilos
  /projects/      # Proyectos con intake.json
  /knowledge/     # ADRs y documentación
/schemas/         # JSON Schemas para validación
/scripts/         # Validadores
```

## ✅ Validación

El sistema valida automáticamente:
- IDs con prefijos correctos (`mat.*`, `hard.*`, etc.)
- Tipos de datos y rangos
- Campos requeridos
- Reglas específicas (ej: `calor_directo_c` solo para cuarzo)

## 🔍 Códigos de Error

- `E-MAT-001`: Campo requerido faltante en material
- `E-MAT-002`: Falta límite de calor para cuarzo
- `E-MAT-007`: Score fuera de rango 0-10
- `E-HARD-001`: Campo requerido faltante en herraje
- `E-JSON-001`: JSON inválido

## 📊 Estado Actual (M1)

- ✅ 4 JSON Schemas
- ✅ 3 Materiales de ejemplo
- ✅ 2 Herrajes
- ✅ 2 Adhesivos
- ✅ 1 Proveedor
- ✅ 1 Paleta
- ✅ Validador funcional
- ✅ Integración Netlify

## 🚦 Próximos Pasos (M2)

- Rules Engine v1 (ergonomía, fabricación, humedad)
- Validación de referencias cruzadas
- Sistema de semáforos (Go/No-Go)
- Generación automática de cutlist

## 📝 Licencia

MIT