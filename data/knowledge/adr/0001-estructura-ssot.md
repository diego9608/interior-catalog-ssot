# ADR-0001: Estructura de Datos SSOT (Single Source of Truth)

## Estado
Aceptado

## Contexto
Necesitamos establecer un sistema robusto para gestionar el catálogo de materiales, herrajes y componentes para proyectos de interiores. El sistema debe garantizar:
- Integridad de datos
- Trazabilidad completa
- Validación automática
- Escalabilidad para futuras extensiones

## Decisión
Implementamos una estructura basada en:

1. **JSON como formato de datos**: Simple, legible, ampliamente soportado
2. **JSON Schema para validación**: Estándar de la industria, permite validación declarativa
3. **Estructura jerárquica de carpetas**: Organización clara por tipo de entidad
4. **Sistema de prefijos para IDs**: Previene colisiones, facilita búsquedas
5. **Unidades SI exclusivamente**: Elimina ambigüedades, facilita cálculos

### Estructura de carpetas:
```
/data/
  /catalog/      # Catálogos maestros
  /library/      # Componentes reutilizables
  /projects/     # Proyectos específicos
  /knowledge/    # Documentación y decisiones
/schemas/        # Definiciones de validación
/scripts/        # Herramientas de validación
```

### Convenciones de IDs:
- `mat.*` para materiales
- `hard.*` para herrajes
- `adh.*` para adhesivos
- `vend.*` para proveedores
- `rule.*` para reglas (M2)
- `mod.*` para módulos (M2)

## Alternativas Consideradas

### 1. Base de Datos SQL
- **Pros**: Consultas complejas, integridad referencial automática
- **Contras**: Mayor complejidad inicial, requiere servidor, más difícil versionado
- **Rechazado porque**: Overhead innecesario para M1

### 2. YAML en lugar de JSON
- **Pros**: Más legible, menos verboso
- **Contras**: Parsing más lento, menos soporte nativo en JavaScript
- **Rechazado porque**: JSON es estándar web, mejor tooling

### 3. TypeScript interfaces en lugar de JSON Schema
- **Pros**: Type safety en desarrollo, mejor IDE support
- **Contras**: Solo validación en tiempo de compilación, no runtime
- **Rechazado porque**: Necesitamos validación runtime para datos externos

### 4. MongoDB/NoSQL
- **Pros**: Esquema flexible, escalable
- **Contras**: Requiere infraestructura, complejidad operacional
- **Rechazado porque**: Innecesario para volumen de datos actual

## Consecuencias

### Positivas
- ✅ Validación robusta antes de cada deploy
- ✅ Fácil versionado con Git
- ✅ Sin dependencias de infraestructura
- ✅ Portable y reproducible
- ✅ Fácil debug y auditoría
- ✅ Integración simple con Netlify

### Negativas
- ❌ Consultas complejas requieren código personalizado
- ❌ Sin integridad referencial automática (debe validarse)
- ❌ Potencial duplicación de datos sin normalización

### Mitigaciones
- Implementar validación de referencias cruzadas en M2
- Crear índices en memoria para búsquedas eficientes
- Documentar relaciones entre entidades

## Métricas de Éxito
- Tiempo de validación < 1 segundo para 1000 items
- Zero errores de datos en producción
- Onboarding de nuevos desarrolladores < 30 minutos

## Referencias
- [JSON Schema Specification](https://json-schema.org/)
- [12 Factor App - Config](https://12factor.net/config)
- [Martin Fowler - Single Source of Truth](https://martinfowler.com/bliki/SingleSourceOfTruth.html)