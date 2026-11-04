# KomaRead — App Web & Móvil para Leer Mangas y Libros (PDF)

Aplicación completa **Web y Móvil (PWA)** creada con **Next.js 14, React, Tailwind CSS, Prisma ORM y PDF.js** para subir, organizar y leer mangas, libros, novelas ligeras y cómics.

## ✨ Funcionalidades Principales

1. **Gestión Completa de Biblioteca y Archivos**:
   - Subida individual o **subida múltiple de archivos PDF** (crea los tomos automáticamente numerados).
   - **Extracción automática de portada** desde la página 1 del PDF subido, o subida de cualquier imagen personalizada (`.jpg`, `.png`, `.webp`, `.svg`).
   - Botón **Cambiar Portada** tanto para la Obra general como para **cada Tomo individualmente**.
2. **Organización Total por Tomos y Estanterías**:
   - En cada obra puedes **ordenar los tomos manualmente** con botones `↑` / `↓`, o usar los botones de orden rápido: **Tomo (1 → N)**, **Tomo (N → 1)** y **Alfabético (A → Z)**.
   - En la pantalla principal puedes activar el botón **"Organizar Todo"** para mover obras con `←` / `→` o cambiar portadas directamente desde la tarjeta.
   - Creación de **Estanterías personalizadas (Colecciones)** y filtros por tipo (*Manga, Libro, Novela Ligera, Cómic*), estado (*Leyendo, Pendiente, Terminado*) y *Favoritos*.
3. **Lector Avanzado de Mangas y Libros**:
   - **Modo Manga (Derecha ← Izquierda)**: Navegación invertida estilo manga japonés (clic a la izquierda o flecha izquierda avanza de página) + soporte de **Doble Página (Spread)**.
   - **Modo Libro (Izquierda → Derecha)**: Navegación tradicional de libros + soporte de Doble Página.
   - **Modo Cascada / Webtoon (Vertical continuo)**: Desplazamiento vertical continuo ideal para leer en el celular.
   - **Guardado automático de progreso**: Recuerda exactamente en qué página te quedaste de cada tomo y lo muestra en la sección **"Continuar Leyendo"**.
   - **Índice de Capítulos y Marcadores**: Añade marcadores de páginas favoritas o marca el inicio de capítulos dentro de un PDF.

---

## 🗄️ Estructura de Base de Datos

- **Esquema Prisma ORM**: [`prisma/schema.prisma`](./prisma/schema.prisma)
- **Script SQL para PostgreSQL en Producción**: [`prisma/production_postgresql.sql`](./prisma/production_postgresql.sql)

Tablas incluidas:
- `Work`: Serie / Obra principal (Manga, Libro, Novela, Cómic).
- `Volume`: Tomos / Volúmenes asociados a cada obra, con su propio PDF, portada individual, orden (`sortOrder`, `volumeNumber`) y progreso (`currentPage`, `totalPages`, `isCompleted`, `lastReadAt`).
- `Chapter`: Capítulos o marcadores de índice dentro de cada tomo.
- `Bookmark`: Páginas guardadas en favoritos durante la lectura.
- `Collection` & `CollectionItem`: Estanterías personalizadas.

---

## 🚀 Cómo Ejecutar Localmente

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Abre `http://localhost:3000` en tu navegador (o desde tu móvil conectado a la misma red Wi-Fi).
