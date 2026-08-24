# DevHubsito

Tus proyectos locales en un solo hubsito. Hecho por **Daetaurus Jaime**.

DevHubsito encuentra repos, levanta frontend, backend y Docker, recuerda puertos y te deja abrir todo desde la PC o el celular. También vive como app de Windows: trae su servidor incluido y puede arrancar al iniciar sesión.

## Usarlo hoy

```powershell
bun install
bun run start
```

Abre `http://localhost:4173`. Desde otro dispositivo conectado a la misma red usa la IP que aparece arriba a la izquierda.

En el primer arranque, el onboarding permite elegir entre acceso libre en la red local o un PIN numérico de 4 a 12 dígitos. El PIN nunca se guarda en texto plano: DevHubsito conserva un hash con salt en `security.json`.

## Agregar un proyecto

Pulsa **Agregar → Explorar**. Puedes entrar a una ubicación conocida o usar **Agregar ubicación** para navegar desde `C:\`, `D:\` y las demás unidades.

DevHubsito distingue un repo normal, un monorepo y una carpeta con varios repos. Lee los `package.json`, reconoce el framework y propone comando y puerto. Antes de guardar puedes corregir cualquiera de los dos.

Cuando existen varias opciones, prioriza comandos con recarga automática (`--watch`, `nodemon`, `tsx watch`, `ng serve`, Vite, Next/Nuxt/Astro dev, etc.). El selector indica **WATCH** o **REINICIO MANUAL** y las cards conservan esa señal para saber si los cambios de código se aplican sin reiniciar el servicio.

El discovery también revisa `compose.yaml`, `compose.yml`, `docker-compose.yaml` y `docker-compose.yml`. Los servicios con puertos publicados —por ejemplo PostgreSQL, Redis o MySQL— aparecen junto a los paquetes para que puedas seleccionarlos. También puedes adjuntarlos después desde `••• → Adjuntar Docker` en cualquier proyecto existente.

No ofrece scripts de migración, seed, reset, test, build o deploy como procesos de desarrollo. Los comandos se ejecutan sin pasar por un shell.

## Cards y servicios

El icono grande intenta usar el favicon del servicio web. En `•••` puedes subir una imagen propia, cambiar el nombre, descripción o color de la card y elegir el comando predeterminado de cada servicio entre los scripts ejecutables de su `package.json`. El Hub muestra si la opción usa watch; para cambiarla, el servicio debe estar detenido. Desde el mismo modal también puedes quitar el registro del Hub. Quitar un proyecto nunca borra sus archivos.

Cada servicio lleva su propia tecnología: Angular, Express, PostgreSQL, React, Vue, Bun, Docker, etc. El punto de estado significa:

- **Activo:** DevHubsito lo arrancó y puede mostrar logs, reiniciarlo o detenerlo.
- **Iniciando:** el proceso ya existe, pero todavía está compilando o aún no abrió su puerto; no se permiten arranques duplicados.
- **Sin respuesta:** el proceso sigue vivo después de 60 segundos sin abrir el puerto esperado; sus logs y controles de recuperación permanecen disponibles.
- **Falló:** el proceso terminó antes de quedar disponible y conserva sus últimos logs para diagnosticarlo.
- **Externo:** el puerto está ocupado por algo que arrancó fuera del Hub.
- **Detenido:** el puerto está libre.

## Theme Maker

El engrane abre la configuración global. Aurora, Midnight, Matcha y Ember son presets; colores, radios, densidad, glass, glow y fondo se pueden mover por separado. El resultado se guarda en `settings.json`.

## Side Waifu Module

El onboarding también permite activar a Kira, la compañera visual del Hub. Funciona como presencia ambiental: adopta expresiones de reposo, foco, éxito, atención, error o descanso según lo que ocurre con los servicios. Sus mensajes aparecen sólo durante eventos relevantes y se retiran solos; al pulsarla muestra el resumen actual.

Desde **Settings → Side Waifu Module** puedes elegir presencia completa, compacta u oculta y comportamiento reactivo, calmado o silencioso. También puedes cambiar nombre, tamaño y la celda que corresponde a cada estado, volver al personaje incluido o subir un spritesheet PNG/WebP de hasta 12 MB. Indica las columnas y filas de su cuadrícula para que DevHubsito calcule cada frame; el spritesheet incluido usa `4 × 4`.

## App de Windows

La app usa Tauri 2 y empaqueta el servidor Bun como sidecar. No hace falta tener una terminal abierta para usarla. La ventana utiliza una barra propia que sigue los colores del Theme Maker y conserva minimizar, maximizar, arrastrar y cerrar.

Primera preparación de Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
```

Ese script instala Rust MSVC y Visual Studio Build Tools C++. Después abre una terminal nueva y comprueba el equipo:

```powershell
bun run desktop:doctor
```

Desarrollo de escritorio:

```powershell
bun run desktop:dev
```

Instalador de Windows:

```powershell
bun run desktop:build
```

El setup NSIS queda en `src-tauri/target/release/bundle/nsis/`. `desktop:build` recompila el sidecar, regenera los iconos desde `public/devhubsito.svg` y construye el instalador.

GitHub Actions valida TypeScript y tests en cada PR o push. Al llegar a `main`, `.github/workflows/build-windows.yml` compila el instalador x64, genera `SHA256SUMS.txt`, conserva un artifact versionado durante 14 días y, si la versión de `package.json` todavía no existe, crea automáticamente el tag `v*` y una GitHub Release con ambos archivos. El workflow también admite tags manuales y ejecución manual con o sin publicación.

Dentro de la app, **Settings → App de Windows → Iniciar con Windows** controla el autostart. Cuando Windows la lanza de esa forma, la ventana inicia oculta y el servidor queda disponible en la red local.

La opción **Cerrar servicios al salir** está activa por defecto. Al cerrar la ventana, DevHubsito muestra una pantalla de cierre, detiene solamente los procesos y servicios Docker que abrió durante esa sesión y después termina su motor local. Los procesos detectados como externos no se tocan.

Si ya arrancó oculta, vuelve a abrir DevHubsito desde Inicio: la instancia existente muestra su ventana en lugar de duplicar procesos.

La integración sigue las guías oficiales de [sidecars](https://v2.tauri.app/develop/sidecar/), [autostart](https://v2.tauri.app/plugin/autostart/) e [instaladores de Windows](https://v2.tauri.app/distribute/windows-installer/) de Tauri.

## Roadmap

- Agregar icono y branding propios al instalador de Windows en el próximo release.
- Clonar proyectos desde una URL de GitHub en una ubicación autorizada.
- Al terminar el clone, ejecutar el discovery normal para distinguir repositorios individuales, monorepos y carpetas con varios repos.
- Mostrar los paquetes y servicios detectados antes de registrarlos, para que el usuario confirme comandos, puertos y qué componentes quiere adjuntar al Hub.

## Datos locales

En desarrollo los registros están junto al proyecto y permanecen fuera de Git. En la app instalada viven en el directorio de datos de `com.daetaurus.devhubsito` dentro de AppData.

- `projects.json`: proyectos y servicios.
- `allowed-roots.json`: ubicaciones autorizadas.
- `settings.json`: tema y configuración de la waifu.
- `security.json`: elección de acceso y hash del PIN, si está activado.
- `uploads/`: imágenes de las cards y spritesheets personalizados.

`projects.example.json` sirve como punto de partida limpio para otro equipo.

## Antes de subir

DevHubsito es principalmente una app de Windows. Todo cambio funcional debe terminar con una compilación del instalador, no sólo con la validación del servidor web.

```powershell
bun run typecheck
bun test
bun run desktop:build
```

El repo no incluye `.env`, datos personales, ejecutables compilados ni carpetas de build.
