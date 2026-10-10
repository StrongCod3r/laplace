# Arquitectura Preact SPA de Laplace

La aplicación principal arranca en `src/main.tsx` con Preact 11. Vite 7 genera una SPA estática en `public/`, compatible con hosting estático. El workspace se carga mediante `lazy` y `Suspense` de `preact/compat`, sin router; Zustand mantiene una proyección tipada del estado de cliente para los componentes Preact. CSS Modules aísla la presentación de las features; los estilos globales conservan los tokens de tema y el contenido editable. Tailwind se ha eliminado del código, del plugin Vite y de las dependencias.

La aplicación se ejecuta en el cliente, sin SSR ni backend de notas. En desarrollo, Vite ofrece un gateway local para el protocolo Git de GitHub; ese gateway no forma parte del build estático. TanStack Query no se instala porque los datos siguen siendo locales. Puede añadirse en hooks de features si más adelante se consume una API con caché compartida.

```text
src/
├── main.tsx
├── app-identity.ts             # Nombre e identificadores compartidos de Laplace
├── app/
│   ├── App.tsx
│   ├── components/Ribbon.tsx
│   └── providers/pwa.ts
├── store/workspace.store.ts    # Proyección de UI y controlador activo
├── shared/
│   ├── components/             # Iconos y ErrorBoundary global
│   └── lib/controller-lifecycle.ts
├── styles/                    # Entrada global y tokens de tema
├── features/
│   ├── workspace/              # Carga, guardado, permisos, carpetas, registry
│   ├── notes/                  # Árbol Preact, favoritos, outline y backlinks
│   ├── navigation/             # Pestañas Preact, grupos y navegación
│   ├── dashboard/              # Inicio Preact
│   ├── graph/                  # SVG Preact, enlaces, filtro y zoom
│   ├── git/                    # Cliente Git de navegador, sincronización y panel de cambios
│   ├── attachments/            # Galería Preact, previews y operaciones de imagen
│   ├── editor/                 # DOM editable, hook y controlador con lifecycle
│   ├── history/                # Undo/redo por workspace
│   ├── markdown/               # Parsing, serialización, frontmatter y enlaces
│   ├── tables/                 # Selección, ejes, clipboard y edición de tablas
│   ├── code/                   # Highlight y Mermaid
│   ├── commands/               # Slash, búsqueda, iconos y emojis
│   ├── interactions/           # Teclado, arrastre, clipboard y selección
│   └── settings/               # Preferencias, atajos y diálogos
├── config.ts                   # Configuración del almacenamiento local
└── storage.ts                  # Gateway IndexedDB y archivos fijos por carpeta
```

Cada feature contiene `components/`, `hooks/`, `services/` y `types.ts` según sus necesidades. Las features que solo implementan algoritmos no tienen carpetas vacías de UI. `WorkspacePage` compone los paneles, vistas y diálogos. Los componentes Preact se suscriben mediante selectores pequeños de Zustand.

## Propiedad del DOM y del estado

Preact es propietario del shell, árbol de archivos, pestañas, inicio, grafo, galería, outline, backlinks y montaje de los diálogos. La edición `contenteditable`, selección de texto, menús flotantes y editores divididos mantienen el motor DOM existente dentro de hosts sin hijos Preact. Esa frontera evita que la reconciliación del DOM altere el cursor, el clipboard o una selección en curso. No se sustituye el editor por una versión reducida.

`useWorkspaceController` monta una instancia del controlador después del commit y la libera al desmontar el workspace. Un montaje cancelado antes de inicializarse no abre IndexedDB ni registra eventos. `ControllerLifecycle` registra listeners, timeouts, intervals y animation frames; su limpieza es idempotente. Los object URLs y las confirmaciones pendientes también se liberan. El controlador hace un último intento de guardar los cambios pendientes al desmontarse.

El documento editable mutable permanece encapsulado en el motor. `workspace.store.ts` publica modelos de UI inmutables y tipados: preferencias, permisos, tabs, árbol, grafo, adjuntos y contexto. Solo el gateway y los servicios existentes escriben datos. No se persiste la tienda completa ni se crea un segundo documento de workspace en Zustand.

Los servicios del controlador contienen actualmente 642 funciones, conservando dependencias a través de un contexto interno explícito. [El inventario](migration-inventory.json) registra cada función y su módulo. Los algoritmos heredados conservan su `@ts-nocheck`; las nuevas fronteras del controlador, modelos Preact, hooks y tienda se comprueban con TypeScript estricto. Esta migración de framework **no supone haber reescrito ni tipado exhaustivamente todos esos algoritmos**. Para cambios nuevos, usar contratos tipados y mantener aislada esa frontera.

## Estilos por feature

Cada grupo de componentes importa su archivo `.module.css`: layout, ribbon, notas, selector y diálogos de workspace, pestañas, inicio, grafo, adjuntos, ajustes, comandos y superficie del editor. Vite genera nombres locales `nv_…`. Los tokens de color, los estilos base y las primitivas compartidas permanecen en `src/styles/global.css`; el contenido `contenteditable`, las tablas, columnas, código y paneles divididos mantienen sus estilos en `features/editor/styles/engine.css`. El antiguo `styles.css` raíz se ha retirado.

Los nombres semánticos existentes se conservan como hooks del motor para consultas y eventos, junto a los nombres locales de presentación. `withModuleClasses` añade las clases del módulo en JSX. Los estados que el motor alterna, como `hidden`, `active`, `selected`, `dim` y `collapsed`, permanecen explícitamente globales mediante `:global` en los selectores que los necesitan.

`ui-styles.ts` expone las mismas clases al motor para los fragmentos de UI que todavía genera, como breadcrumbs, menús y editores divididos. Las funciones del contexto `htmlWithStyles` y `classWithStyles` aplican las clases locales antes de insertar esa UI; no requieren un observador de DOM ni modifican los contratos de almacenamiento. Para un componente nuevo, importar directamente su módulo y usar sus clases locales; conservar nombres globales solo cuando sean hooks necesarios del motor.

## Almacenamiento y compatibilidad

Se conserva la DB `laplace-local-workspace`, versión 3, los stores `meta`, `vaults`, `attachments`, los IDs, el registry y los handles del sistema de archivos. Cada carpeta representa un único workspace. La configuración en disco usa archivos de nombre fijo separados por función; el almacenamiento del navegador conserva su esquema IndexedDB.

```text
Preact → controlador/servicios de feature → StorageGateway actual
                                         ├── modo navegador: IndexedDB
                                         └── carpeta seleccionada:
                                             ├── notas .md
                                             ├── .laplace/app.json
                                             ├── .laplace/appearance.json
                                             ├── .laplace/hotkeys.json
                                             ├── .laplace/workspace.json
                                             ├── .laplace/git-automation.json (si se configura)
                                             └── .attachments/
```

La carpeta elegida sigue siendo autoritativa. Permisos denegados o metadatos ausentes no se sustituyen por datos de otra caché. Se conserva el guardado serializado, la reconciliación Markdown y los modos de solo lectura y desconectado. El editor sigue bloqueado durante la hidratación para evitar aceptar cambios sobre defaults que luego serían reemplazados.

IndexedDB y los permisos están vinculados al origen. Mantener el mismo protocolo, dominio y puerto en el despliegue para acceder a los datos de navegador existentes; abrir el servidor de desarrollo en otro puerto no comparte esa DB. Solicitar acceso a carpetas sigue requiriendo una acción explícita del usuario y soporte del navegador.

Una prueba de round trip detectó y corrigió un fallo previo en la serialización de wikilinks sin alias: `[[Nota]]` ya no se convierte en `[[NotaNota]]`. Se conservan los aliases, el frontmatter del usuario y los formatos Markdown existentes.

## Git: operaciones y rendimiento

La feature `git/` utiliza `isomorphic-git` sobre el directorio seleccionado. `git-worker-client.ts` mantiene un worker por repositorio y lo reutiliza al cambiar de panel dentro del mismo workspace; al cambiar de ubicación libera el cliente anterior. `git.worker.ts` serializa las peticiones y prepara también las diferencias de líneas fuera del hilo de UI. Si no se dispone de Worker o el handle no admite clonación estructurada, el cliente usa el adaptador directo como fallback.

`WorkspaceGitClient.repositoryInfo()` consulta configuración, rama y referencias sin recorrer el working tree ni el historial. Se utiliza para inicialización, ajustes, credenciales, restauración de automatización y preparación de Fetch. El arranque con Source Control oculto restaura la automatización mediante esta lectura ligera; el estado completo se consulta al abrir el panel o ejecutar una comprobación programada.

`status()` vuelve a comprobar los archivos locales en cada consulta. La comparación del historial y las listas de archivos entrantes/salientes se cachean por el par de OIDs local/remoto, porque los commits son inmutables. Un cambio de OID por Commit, Fetch o una operación externa invalida esa comparación; las ediciones de archivos se detectan sin invalidarla. Si ambos OIDs coinciden, no se recorre el historial. Los errores de comparación descartan la caché para permitir un nuevo intento.

Los previews locales limitan `statusMatrix` al archivo seleccionado; la lectura del index poda subárboles ajenos y `readBlob` resuelve la ruta dentro del commit. Los previews remotos comparan la entrada de ese archivo en la base común y la rama correspondiente. No necesitan un estado completo del repositorio ni modifican archivos o el index.

Commit guarda localmente; Fetch descarga objetos y referencias sin aplicar archivos; Sync hace Fetch, valida divergencia y cambios locales, aplica solo un fast-forward limpio o crea el commit local, y envía los commits pendientes sin force-push. Sync reutiliza el estado posterior al Fetch para preparar el commit. Sin cambios realiza dos recorridos completos del working tree; cuando crea un commit realiza tres, más una comprobación limitada a las rutas que se añaden al index. Estas cifras describen lecturas locales y no incluyen solicitudes de red ni recorridos de árboles de commits.

`GitPanel` reserva el workspace y vacía la cola de guardado antes de los comandos manuales. Al finalizar, `endGitOperation(false)` restaura el acceso sin releer las notas ni reiniciar su historial para Commit, Fetch, ajustes o Sync sin archivos recibidos. Sync devuelve `worktreeUpdated` cuando ha aplicado archivos remotos; en ese caso se recargan las notas y se reinicia el historial. Si Sync falla, se recarga de forma conservadora porque podría haber cambiado parcialmente el working tree. Las lecturas de estado en segundo plano y los commits/pushes automáticos mantienen el editor activo.

## Navegación y manejo de errores

La aplicación principal no necesita rutas URL: notas, grafo y adjuntos usan las pestañas y grupos de editor existentes, conservando los IDs almacenados. `src/main.tsx` monta `App` mediante `render` de Preact. `App` importa el workspace de forma diferida y muestra `Suspense` mientras se descarga su módulo. El HTML inicial y el fallback Preact comparten `StartupSkeleton.html` y sus estilos: ribbon, sidebar, pestañas y contenido siguen la distribución de la aplicación, con ajustes responsive y soporte de tema. Vite inserta el skeleton en el entrypoint para mostrarlo antes de cargar JavaScript.

El boundary global captura errores de renderizado y de la importación diferida. Las operaciones asíncronas del gateway siguen mostrando errores y permisos mediante los avisos de workspace. Un error no borra los datos ni reemplaza la carpeta por defaults.

`@preact/preset-vite` configura JSX y la compatibilidad del ecosistema React. Los componentes de la aplicación usan Preact; `memo`, `lazy`, `Suspense` y `flushSync` proceden de `preact/compat`. El nombre `react` en el manifiesto es un alias npm de `@preact/compat`, requerido por el peer dependency de Zustand, no una instalación del runtime React. No se incluye React DOM ni React Router en la aplicación principal.

La aplicación local original no tiene autenticación de usuarios: no se ha añadido un login ficticio ni se ha restringido el acceso local a las notas. Los permisos del sistema de archivos siguen siendo la protección de acceso real. Si se añade autenticación para una API remota, conectar su proveedor, mantener la sesión en memoria y colocar un guardián antes de renderizar rutas privadas; la API debe verificar identidad y permisos.

## PWA y hosting estático

La PWA solo se registra en producción. El service worker se genera con una versión derivada del manifest de Vite y su código, mantiene juntos el HTML y los assets de una misma versión, y usa rutas relativas al scope. Precarga el entrypoint y los recursos de instalación; los chunks diferidos se almacenan después de que el navegador los haya solicitado. La carga diferida del workspace no se anula precargando todas las páginas. Los datos privados del workspace permanecen en el almacenamiento actual y no se introducen en Cache Storage.

El build incluye `public/.vite/manifest.json`, `public/sw.js` y el manifest instalable. La prueba de producción verifica que, después de abrir la aplicación, puede recargarse sin red y recuperar sus notas en IndexedDB.

- **Netlify:** comando `pnpm build`, directorio publicado `public`. `_redirects` aporta el fallback SPA.
- **Vercel:** `vercel.json` declara el build, salida `public` y fallback SPA.
- **GitHub Pages:** compilar con `pnpm build --base=/NOMBRE-REAL-DEL-REPOSITORIO/`, ejecutar `pnpm prepare:pages` y publicar `public/` mediante Actions. Los assets y la PWA respetan `BASE_URL`. El fallback `404.html` permite abrir rutas profundas, conservando el código HTTP 404 de Pages.

No se ha ejecutado ningún despliegue remoto como parte de esta migración. La aplicación activa es la raíz.

## Comprobaciones

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

Las pruebas unitarias comprueban lifecycle, contrato de almacenamiento, el adaptador de clases locales y Git: lecturas limitadas de previews, configuración sin recorridos de archivos, invalidación de caché por referencias, detección de cambios externos, cantidad de recorridos de Sync y protección de cambios locales ante divergencia. Las pruebas de navegador usan perfiles aislados, sin datos ni carpetas personales, y cubren el arranque, creación/edición/recarga de notas, preferencias, codec Markdown, historial, paneles divididos, grafo, pestañas, adjuntos, navegación y permisos locales. Para probar carpetas se usan handles reales del almacenamiento privado del navegador (OPFS), nunca una carpeta del usuario. También se comprueban caché offline, lazy loading, errores de chunks, clases locales en UI dinámica, variables de tema y breakpoints responsive. Las pruebas de Git verifican la reutilización y serialización del worker, actualización de cambios tras guardados, automatización, envío a un remoto real y recarga de notas recibidas.

Los checks no equivalen a una prueba exhaustiva de cada interacción posible del editor; conservar los algoritmos originales reduce esa superficie de cambio. La integración de CI queda configurada, pero no se ha ejecutado en GitHub durante este trabajo.

Referencias de las APIs empleadas: [Preact](https://preactjs.com/guide/v11/getting-started/), [preset Vite para Preact](https://github.com/preactjs/preset-vite), [CSS Modules con Vite](https://vite.dev/guide/features.html#css-modules), [hosting estático con Vite](https://vite.dev/guide/static-deploy.html).
