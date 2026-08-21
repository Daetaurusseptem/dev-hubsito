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

No ofrece scripts de migración, seed, reset, test, build o deploy como procesos de desarrollo. Los comandos se ejecutan sin pasar por un shell.

## Cards y servicios

El icono grande intenta usar el favicon del servicio web. En `•••` puedes subir una imagen propia, cambiar el nombre, descripción o color de la card y quitar el registro del Hub. Quitar un proyecto nunca borra sus archivos.

Cada servicio lleva su propia tecnología: Angular, Express, PostgreSQL, React, Vue, Bun, Docker, etc. El punto de estado significa:

- **Activo:** DevHubsito lo arrancó y puede mostrar logs, reiniciarlo o detenerlo.
- **Externo:** el puerto está ocupado por algo que arrancó fuera del Hub.
- **Detenido:** el puerto está libre.

## Theme Maker

El engrane abre la configuración global. Aurora, Midnight, Matcha y Ember son presets; colores, radios, densidad, glass, glow y fondo se pueden mover por separado. El resultado se guarda en `settings.json`.

## Side Waifu Module

El onboarding también permite activar a Kira, la compañera visual del Hub. Funciona como presencia ambiental: adopta expresiones de reposo, foco, éxito, atención, error o descanso según lo que ocurre con los servicios. Sus mensajes aparecen sólo durante eventos relevantes y se retiran solos; al pulsarla muestra el resumen actual.

Desde **Settings → Side Waifu Module** puedes elegir presencia completa, compacta u oculta y comportamiento reactivo, calmado o silencioso. También puedes cambiar nombre, tamaño y la celda que corresponde a cada estado, volver al personaje incluido o subir un spritesheet PNG/WebP de hasta 12 MB. Indica las columnas y filas de su cuadrícula para que DevHubsito calcule cada frame; el spritesheet incluido usa `4 × 4`.

## App de Windows

La app usa Tauri 2 y empaqueta el servidor Bun como sidecar. No hace falta tener una terminal abierta para usarla.

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

Los pushes y tags `v*` también disparan `.github/workflows/build-windows.yml`; el instalador queda como artifact `DevHubsito-Windows` en GitHub Actions.

Dentro de la app, **Settings → App de Windows → Iniciar con Windows** controla el autostart. Cuando Windows la lanza de esa forma, la ventana inicia oculta y el servidor queda disponible en la red local.

Si ya arrancó oculta, vuelve a abrir DevHubsito desde Inicio: la instancia existente muestra su ventana en lugar de duplicar procesos.

La integración sigue las guías oficiales de [sidecars](https://v2.tauri.app/develop/sidecar/), [autostart](https://v2.tauri.app/plugin/autostart/) e [instaladores de Windows](https://v2.tauri.app/distribute/windows-installer/) de Tauri.

## Datos locales

En desarrollo los registros están junto al proyecto y permanecen fuera de Git. En la app instalada viven en el directorio de datos de `com.daetaurus.devhubsito` dentro de AppData.

- `projects.json`: proyectos y servicios.
- `allowed-roots.json`: ubicaciones autorizadas.
- `settings.json`: tema y configuración de la waifu.
- `security.json`: elección de acceso y hash del PIN, si está activado.
- `uploads/`: imágenes de las cards y spritesheets personalizados.

`projects.example.json` sirve como punto de partida limpio para otro equipo.

## Antes de subir

```powershell
bun run typecheck
bun test
bun run desktop:prepare
```

El repo no incluye `.env`, datos personales, ejecutables compilados ni carpetas de build.
