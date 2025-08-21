# ADR-0007: Field App Lite (PWA Offline)

**Estado**: Aceptado  
**Fecha**: 2025-08-21  
**Autor**: Claude (Anthropic)

## Contexto

Después de M7 (QC Gates), necesitamos una forma de capturar datos QC en campo desde dispositivos móviles, incluyendo evidencia fotográfica y firmas digitales, sin depender de conectividad.

## Decisión

Implementamos una PWA (Progressive Web App) estática servida desde Netlify que funciona completamente offline.

### Arquitectura

```
/public/app/           # PWA estática
├── index.html        # Shell HTML
├── app.js           # SPA con hash routing
├── styles.css       # Mobile-first CSS
├── sw.js           # Service Worker
└── manifest.webmanifest

/public/api/          # Endpoints estáticos (generados en build)
├── projects.json
└── DEMO-001/
    ├── checklists.json
    └── meta.json
```

### Características Clave

1. **Offline-first**: Service Worker con cache-first strategy
2. **Hash routing**: `#/qc/{projectId}/{phase}` sin servidor
3. **Evidencia embebida**: Fotos como base64 en JSON (max 1600px)
4. **Firma digital**: Canvas HTML5 → PNG base64
5. **Sin backend**: Exporta JSON compatible con `qc-verify.js`

### Flujo de Trabajo

1. **Build time**: `app-prepare.js` genera `/public/api/*` desde datos del proyecto
2. **Runtime**: PWA carga checklists y renderiza formularios dinámicamente
3. **Captura**: Usuario llena campos, adjunta fotos, firma
4. **Export**: Descarga `{phase}.json` para copiar a `data/projects/*/qc/inputs/`

### Formato de Export

```json
{
  "projectId": "DEMO-001",
  "phase": "pre_instalacion",
  "responsable": "Juan Pérez",
  "station": "Sitio",
  "timestamp": "2025-08-21T14:00:00Z",
  "answers": {
    "PASO-UTIL": 1200,
    "SERV-READY": true
  },
  "evidence": {
    "PASO-UTIL": ["data:image/jpeg;base64,..."]
  },
  "signature_png": "data:image/png;base64,..."
}
```

## Alternativas Consideradas

1. **Netlify Functions**: Descartado, requiere conectividad
2. **Google Forms**: Descartado, esquema rígido y no offline
3. **Native app**: Descartado, complejidad de distribución
4. **localStorage only**: Implementado pero como complemento al export

## Consecuencias

### Positivas

- **Zero friction**: Funciona en cualquier móvil con browser moderno
- **Truly offline**: Todo el funcionamiento es local después del primer load
- **Trazabilidad completa**: Evidencias y firma embebidas en JSON
- **Compatible con pipeline**: JSON exportado funciona directo con `qc-verify.js`

### Negativas

- **Tamaño de archivos**: Base64 aumenta ~33% el peso
- **Manual sync**: Usuario debe copiar JSON manualmente
- **Sin colaboración**: Cada dispositivo trabaja aislado
- **Browser storage limits**: ~10MB en localStorage

## Implementación

### Service Worker Strategy

```javascript
// Cache-first con fallback a red
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

### Deep Linking

QR codes pueden apuntar directamente a:
```
https://site.netlify.app/app/#/qc/DEMO-001/pre_instalacion
```

### Optimización de Imágenes

```javascript
// Resize a max 1600px antes de base64
canvas.toDataURL('image/jpeg', 0.8)
```

## Resultados

- **Tamaño PWA**: ~50KB (HTML+JS+CSS)
- **Cache inicial**: ~200KB (includes API endpoints)
- **Tiempo offline**: Indefinido después del primer load
- **Export típico**: 200KB-2MB (con 3-5 fotos)

## Seguridad

- **No data transmission**: Todo es local
- **No credentials**: Sin autenticación (por diseño)
- **Signature validation**: Solo visual (no criptográfica)
- **CORS**: No aplica (todo es mismo origen)

## Futuro

1. **Sync automático**: WebDAV o GitHub API para push directo
2. **Compresión**: HEIC/WebP para reducir tamaño
3. **Barcode scanner**: BarcodeDetector API para QR nativos
4. **IndexedDB**: Para proyectos más grandes
5. **Collaborative**: CRDTs para merge offline changes
6. **Signature verification**: Firma criptográfica real