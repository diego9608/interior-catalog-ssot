# ADR-0002: Rules Engine v1 - Sistema de Validación Declarativo

## Estado
Aceptado

## Contexto
Con el catálogo SSOT establecido (ADR-0001), necesitamos un sistema para validar que los proyectos cumplan con:
- Estándares ergonómicos básicos
- Requerimientos técnicos de materiales (humedad)
- Especificaciones mínimas de herrajes
- Buenas prácticas de la industria

El sistema debe ser:
- Declarativo (no hardcoded)
- Extensible sin modificar código
- Capaz de bloquear builds en errores críticos
- Transparente en sus reportes

## Decisión
Implementamos un motor de reglas basado en:

1. **YAML para definición de reglas**: Legible, mantenible, versionable
2. **Sistema de severidades**: high (bloquea), medium (avisa), low (informa)
3. **Motor de evaluación simple**: Tres tipos de checks iniciales
4. **Reportes JSON por proyecto**: Trazabilidad completa
5. **Integración con CI/CD**: Exit codes apropiados para Netlify

### Estructura de reglas:
```yaml
rules:
  - id: <dominio>-<numero>
    domain: ergonomia|humedad|herrajes
    severity: high|medium|low
    applies: <condiciones>
    check: <validación>
    guidance: <mensaje de ayuda>
```

### Tipos de checks implementados:
- `range`: Valida que un valor esté dentro de un rango
- `catalog_prop_equals`: Compara una propiedad del catálogo
- `list_catalog_min`: Valida mínimos en listas de items del catálogo

### Condiciones de aplicación:
- `equals`: Campo igual a valor específico
- `exists`: Campo existe en el intake
- `some_in_list_catalog`: Al menos un item en lista cumple criterio

## Alternativas Consideradas

### 1. Reglas Hardcoded en JavaScript
- **Pros**: Máximo control, mejor performance
- **Contras**: Requiere desarrollador para cambios, no versionable independientemente
- **Rechazado porque**: No cumple requisito de ser declarativo

### 2. Motor JSONPath/JMESPath Complejo
- **Pros**: Muy potente, sintaxis estándar
- **Contras**: Curva de aprendizaje alta, dependencias pesadas
- **Rechazado porque**: Overkill para M2, complejidad innecesaria

### 3. Base de Reglas Externa (API/DB)
- **Pros**: Gestión centralizada, UI potencial
- **Contras**: Requiere infraestructura, latencia, complejidad
- **Rechazado porque**: Viola principio de simplicidad y portabilidad

### 4. Schema Validation (JSON Schema extendido)
- **Pros**: Reutiliza infraestructura existente
- **Contras**: JSON Schema no está diseñado para reglas de negocio complejas
- **Rechazado porque**: Limitado para validaciones cruzadas con catálogo

## Consecuencias

### Positivas
- ✅ Reglas modificables sin tocar código
- ✅ Severidades permiten flexibilidad (advertir vs bloquear)
- ✅ Reportes detallados para auditoría
- ✅ Fácil agregar nuevas reglas y dominios
- ✅ Motor simple pero suficiente para casos actuales
- ✅ Integración perfecta con pipeline existente

### Negativas
- ❌ Motor limitado a 3 tipos de checks (expandible en M3+)
- ❌ No hay UI para gestión de reglas
- ❌ Validación sintáctica de YAML manual

### Mitigaciones
- Documentar formato de reglas exhaustivamente
- Agregar más tipos de checks según necesidad
- Considerar generador de reglas en futuro

## Implementación

### Archivos clave:
- `/data/catalog/rules/rules.core.yaml`: 6 reglas iniciales
- `/scripts/verify-rules.js`: Motor de evaluación
- `/reports/rules-*.json`: Reportes por proyecto

### Flujo:
1. `npm run validate:all` ejecuta validaciones
2. Carga catálogos en memoria
3. Por cada proyecto evalúa reglas aplicables
4. Genera reporte y lo guarda
5. Si hay fallas `high` → exit 1 (bloquea build)

## Métricas de Éxito
- Tiempo de evaluación < 500ms para 50 reglas
- Zero falsos positivos en reglas high
- Adopción de nuevas reglas sin modificar código
- Reducción de errores en fabricación por validación temprana

## Ejemplos de Uso

### Regla que pasa:
```
✅ PASS: ERG-001 Paso útil entre frentes en cocina
```

### Advertencia no bloqueante:
```
⚠️ WARN: E-RULE-M-002 ERG-002 Altura recomendada de encimera
   Actual: 880
   Expected: 900–950
   Guidance: Estándar cómodo 90–95 cm; ajustar por usuario.
```

### Error bloqueante:
```
❌ FAIL: E-RULE-H-001 HUM-001 Adhesivo adecuado para zona húmeda
   Actual: EVA
   Expected: PUR
   Guidance: Zona húmeda requiere PUR; EVA sólo interior seco.
```

## Referencias
- [YAML Specification](https://yaml.org/spec/)
- [Exit Codes Best Practices](https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html)
- [Netlify Build Hooks](https://docs.netlify.com/configure-builds/build-hooks/)