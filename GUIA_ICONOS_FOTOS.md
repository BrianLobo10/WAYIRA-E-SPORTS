# Guía de Ubicación de Iconos y Fotos Personalizados

## Iconos Personalizados

### Ubicación Recomendada
- **Carpeta**: `public/icons/` o `src/assets/icons/`
- **Formato**: SVG (recomendado) o PNG con fondo transparente
- **Tamaño**: 24x24px, 32x32px, 48x48px, 64x64px

### Dónde Colocar Iconos

1. **Logo de la Empresa**
   - Archivo: `public/image.png` (ya existe)
   - Usado en: Header, Footer, Página de inicio

2. **Iconos de Redes Sociales**
   - Ubicación: `public/icons/social/`
   - Archivos sugeridos:
     - `discord.svg`
     - `facebook.svg`
     - `instagram.svg`
     - `twitch.svg`

3. **Iconos de Servicios**
   - Ubicación: `public/icons/services/`
   - Archivos sugeridos:
     - `trophy.svg` (Torneos)
     - `graduation.svg` (Formación)
     - `video.svg` (Producción)
     - `handshake.svg` (Alianzas)

4. **Iconos de Valores**
   - Ubicación: `public/icons/values/`
   - Archivos sugeridos:
     - `star.svg` (Excelencia)
     - `shield.svg` (Integridad)
     - `users.svg` (Trabajo en equipo)
     - `globe.svg` (Inclusión)

## Fotos Personalizadas

### Ubicación Recomendada
- **Carpeta**: `public/images/` o `src/assets/images/`
- **Formatos**: JPG, PNG, WebP
- **Tamaños recomendados**:
  - Hero images: 1920x1080px
  - Cards: 800x600px
  - Thumbnails: 400x300px
  - Avatares: 200x200px

### Dónde Colocar Fotos

1. **Imágenes del Hero (Página Principal)**
   - Ubicación: `public/images/hero/`
   - Archivos sugeridos:
     - `hero-main.jpg` - Imagen principal del hero
     - `hero-background.jpg` - Fondo del hero

2. **Fotos del Equipo**
   - Ubicación: `public/images/team/`
   - Archivos sugeridos:
     - `team-member-1.jpg`
     - `team-member-2.jpg`
     - `team-photo.jpg` - Foto grupal

3. **Imágenes de Proyectos**
   - Ubicación: `public/images/projects/`
   - Archivos sugeridos:
     - `liga-wayira.jpg`
     - `academia.jpg`
     - `produccion.jpg`
     - `alianzas.jpg`

4. **Fotos de Noticias**
   - Ubicación: `public/images/news/`
   - Archivos sugeridos:
     - `news-1.jpg`
     - `news-2.jpg`
     - `news-3.jpg`

5. **Galería de Eventos**
   - Ubicación: `public/images/events/`
   - Archivos sugeridos:
     - `event-1.jpg`
     - `event-2.jpg`
     - `event-3.jpg`

6. **Banners y Fondos**
   - Ubicación: `public/images/banners/`
   - Archivos sugeridos:
     - `about-banner.jpg`
     - `projects-banner.jpg`
     - `news-banner.jpg`

## Cómo Usar las Imágenes

### En Componentes HTML
```html
<img src="images/hero/hero-main.jpg" alt="Descripción">
```

### En Componentes TypeScript
```typescript
imageUrl = 'images/projects/liga-wayira.jpg';
```

### En CSS
```css
.hero {
  background-image: url('/images/hero/hero-background.jpg');
}
```

## Estructura de Carpetas Recomendada

```
public/
├── icons/
│   ├── social/
│   ├── services/
│   └── values/
├── images/
│   ├── hero/
│   ├── team/
│   ├── projects/
│   ├── news/
│   ├── events/
│   └── banners/
└── image.png (logo actual)
```

## Notas Importantes

1. **Optimización**: Comprime las imágenes antes de subirlas para mejorar el rendimiento
2. **Nombres**: Usa nombres descriptivos y en minúsculas con guiones
3. **Formatos**: Prefiere WebP para mejor compresión, con fallback a JPG/PNG
4. **Tamaños**: Mantén las imágenes en tamaños razonables (máx 500KB por imagen)
5. **Alt Text**: Siempre incluye texto alternativo para accesibilidad

