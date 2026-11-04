# SHOP — Re-arquitectura del módulo de autenticación (Auth)

Plataforma de comercio electrónico: **Backend** en NestJS, TypeORM y PostgreSQL; **Frontend** en React, Vite, TypeScript y Zustand. Permite registrarse e iniciar sesión, consultar un catálogo con paginación y filtros, administrar productos según el rol, subir imágenes y usar mensajería en tiempo real (WebSocket).

**Proyecto de Arquitectura de Sistemas — Universidad Luis Amigó.** Integrantes: Sebastian Patiño Sandoval, Juan David Diaz Quiros, Isaac Tamayo Sierra, Edison Ciro.

## Módulo MVP: Auth

- **Backend:** registro, inicio de sesión, renovación y cierre de sesión. La sesión es un JWT en una cookie `httpOnly`; las peticiones que modifican estado llevan un token CSRF. Autorización por roles (`admin`, `super-user`, `user`). Código en [`src/backend/src/auth`](src/backend/src/auth).
- **Frontend:** páginas de acceso y registro, estado de sesión con Zustand y rutas protegidas. El navegador nunca ve el JWT (no hay `localStorage`). Código en [`src/frontend/src/auth`](src/frontend/src/auth).

La estructura de capas del módulo y el estado de cada decisión están en [`src/README.md`](src/README.md). La arquitectura completa está en **[`docs/arquitectura.md`](docs/arquitectura.md)**, los diagramas C4 en [`docs/diagramas/`](docs/diagramas/README.md) y las decisiones en [`docs/adr/`](docs/adr/).

## Problemas arquitectónicos identificados (Semana 3)

| # | Problema | Estado | Decisión |
|---|---|---|---|
| 1 | Endpoints de prueba `GET /auth/private`, `/private2` y `/private3` expuestos en producción | Resuelto: rutas y decorador `@RawHeaders` retirados | [ADR-003](docs/adr/ADR-003-retirar-endpoints-de-prueba-de-auth.md) |
| 2 | Exclusión manual de la contraseña con `delete user.password` | Resuelto: DTOs de respuesta con lista blanca (`@Expose`) | [ADR-002](docs/adr/ADR-002-exclusion-declarativa-del-password.md) |
| 3 | JWT guardado en `localStorage`, expuesto ante un XSS exitoso | Resuelto: JWT en cookie `httpOnly` con protección CSRF | [ADR-004](docs/adr/ADR-004-jwt-en-cookie-httponly-con-proteccion-csrf.md) |
| 4 | Ausencia de pruebas automatizadas | Resuelto: pruebas unitarias, de integración y e2e en el Backend y pruebas en el Frontend | [ADR-001](docs/adr/ADR-001-suite-de-pruebas-automatizadas-para-auth.md) |

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22 o superior | Backend y Frontend |
| pnpm | 11.21.0 (la fija `packageManager`) | Gestor de paquetes. Se obtiene con `corepack enable`, que viene con Node |
| [Docker](https://www.docker.com/) | Con Docker Compose | Base de datos PostgreSQL 17 (`src/backend/docker-compose.yml`) |
| PostgreSQL | 17 | Si prefiere no usar Docker, una instancia propia con la base y el usuario de `.env` |

Dependencias principales: NestJS 11, TypeORM, Passport JWT, `cookie-parser`, Socket.IO, `bcrypt` (Backend); React 19, Vite, Zustand, Axios, TanStack Query, Tailwind y shadcn/ui (Frontend). Se instalan solas con `pnpm install`.

## Instalación y ejecución

Se parte de un clon del repositorio. Los pasos siguientes están probados desde un clon limpio.

```sh
git clone https://github.com/juanlol2606/Refactorizacion-E-commerce.git
cd Refactorizacion-E-commerce
corepack enable
```

### 1. Backend (puerto 3000)

```sh
cd src/backend
cp .env.template .env
```

Edite `.env` y complete, como mínimo:

| Variable | Valor para desarrollo local |
|---|---|
| `STAGE` | `dev` |
| `DB_HOST` | `localhost` |
| `DB_PASSWORD`, `DB_NAME`, `DB_USERNAME`, `DB_PORT` | Los de la plantilla sirven (`DB_NAME=ShopDB`, `DB_USERNAME=postgres`, `DB_PORT=5432`); cambie `DB_PASSWORD` |
| `JWT_SECRET` | Una cadena larga y aleatoria |
| `CSRF_SECRET` | **Obligatorio**, al menos 16 caracteres. La API no arranca sin él |

Para generar un secreto aleatorio (úselo para `JWT_SECRET` y para `CSRF_SECRET`):

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El resto de variables (`FRONTEND_URL`, `JWT_EXPIRES_IN`, `COOKIE_SECURE`, `PORT`, `HOST_API`) ya traen un valor útil; su descripción está en [`src/backend/README.md`](src/backend/README.md).

```sh
docker compose up -d db     # levanta solo PostgreSQL 17
pnpm install
pnpm run start:dev          # API en http://localhost:3000/api
```

En otra terminal, cargue los datos de ejemplo:

```sh
curl http://localhost:3000/api/seed     # responde: SEED EXECUTED
```

> **Atención:** `GET /api/seed` borra **todos** los usuarios y productos antes de cargar los de ejemplo, y está deshabilitado (403) con `STAGE=prod`.

La semilla crea 2 usuarios y 52 productos. Las contraseñas de ejemplo son `Abc123`:

| Correo | Roles |
|---|---|
| `test1@google.com` | `admin` |
| `test2@google.com` | `user`, `super-user` |

La documentación interactiva (Swagger) queda en **<http://localhost:3000/api>**.

### 2. Frontend (puerto 5173)

```sh
cd src/frontend
cp .env.template .env       # VITE_API_URL=http://localhost:3000/api
pnpm install
pnpm dev                    # http://localhost:5173
```

Abra <http://localhost:5173>, inicie sesión con `test1@google.com` / `Abc123` y entre a `/admin` para gestionar productos.

### Pruebas

```sh
cd src/backend
pnpm test                   # unitarias y de integración: no requieren base de datos
pnpm run test:cov:auth      # cobertura del módulo Auth; falla si baja del 70 %
pnpm run test:e2e           # e2e contra PostgreSQL (necesita la base y el .env)

cd ../frontend
pnpm test                   # Vitest
pnpm lint
pnpm build
```

El CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) ejecuta el build y las pruebas del Backend, el build, las pruebas y el lint del Frontend, y el e2e con un servicio `postgres:17`.

## Cómo funciona la sesión (cookie `httpOnly` + CSRF)

El JWT nunca viaja en el cuerpo de una respuesta ni se guarda en `localStorage`.

1. `register`, `login` y `check-status` fijan dos cookies y responden solo `{ "user": { ... } }`:

   | Cookie | Contenido | Atributos |
   |---|---|---|
   | `access_token` | El JWT | `HttpOnly`, `SameSite=Lax`, `Path=/api`, `Max-Age` = `JWT_EXPIRES_IN` (2 h por defecto). `Secure` solo con `COOKIE_SECURE=true` |
   | `csrf_token` | `nonce.HMAC_SHA256(CSRF_SECRET, nonce + userId)` | Legible por JavaScript, `SameSite=Lax`, `Path=/`, misma vigencia |

2. Las peticiones **`POST`, `PUT`, `PATCH` y `DELETE` autenticadas** deben enviar la cabecera `X-CSRF-Token` con el valor de la cookie `csrf_token`. Si falta o fue alterada, la API responde `403`.
3. El cliente debe enviar las cookies: `withCredentials: true` en Axios (ya configurado en el Frontend), `credentials: 'include'` en `fetch`, o `-b` / `-c` en `curl`.
4. `POST /api/auth/logout` expira ambas cookies.

Ejemplo completo con `curl`:

```sh
# 1. Iniciar sesión y guardar las cookies en jar.txt
curl -i -c jar.txt -H "Content-Type: application/json" \
  -d '{"email":"test1@google.com","password":"Abc123"}' \
  http://localhost:3000/api/auth/login

# 2. Leer el token CSRF de la cookie csrf_token
CSRF=$(awk '$6=="csrf_token"{print $7}' jar.txt)

# 3. Crear un producto (como admin) enviando las cookies y X-CSRF-Token
curl -b jar.txt -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" \
  -d '{"title":"Gorra de ejemplo","price":25,"stock":10,"sizes":["M","L"],"gender":"unisex"}' \
  http://localhost:3000/api/products

# 4. Cerrar la sesión
curl -b jar.txt -c jar.txt -H "X-CSRF-Token: $CSRF" -X POST http://localhost:3000/api/auth/logout
```

> **Despliegue:** en desarrollo el Frontend (`localhost:5173`) y la API (`localhost:3000`) comparten sitio, por lo que las cookies `SameSite=Lax` viajan y JavaScript puede leer `csrf_token`. En producción deben compartir sitio (por ejemplo `app.ejemplo.com` y `api.ejemplo.com`) y usar HTTPS con `COOKIE_SECURE=true`. Si estuvieran en sitios distintos, habría que devolver el token CSRF en el cuerpo de la respuesta.

## Endpoints (prefijo `/api`)

Todas las rutas cuelgan de `http://localhost:3000/api`. Los ejemplos salen de llamadas reales a la API en ejecución, con los identificadores abreviados (`0a0a92a5…`). La documentación interactiva está en [Swagger](http://localhost:3000/api).

**Autenticación:** *Pública* = sin sesión; *Sesión* = cookie `access_token`; *CSRF* = además la cabecera `X-CSRF-Token` (solo en `POST`, `PUT`, `PATCH` y `DELETE`); *admin* = rol `admin`.

| Método | Ruta | Autenticación | Descripción | Ejemplo de entrada (JSON) | Ejemplo de salida (JSON) |
|---|---|---|---|---|---|
| `POST` | `/auth/register` | Pública | Crea un usuario con rol `user` y abre la sesión (fija las cookies). La contraseña lleva de 6 a 50 caracteres, con mayúscula, minúscula y número | `{"email":"ana@example.com","fullName":"Ana Pérez","password":"Abc12345"}` | `201` `{"user":{"id":"0a0a92a5…","email":"ana@example.com","fullName":"Ana Pérez","isActive":true,"roles":["user"]}}` |
| `POST` | `/auth/login` | Pública | Valida las credenciales y abre la sesión (fija las cookies) | `{"email":"ana@example.com","password":"Abc12345"}` | `201` `{"user":{"id":"0a0a92a5…","email":"ana@example.com","fullName":"Ana Pérez","isActive":true,"roles":["user"]}}` |
| `GET` | `/auth/check-status` | Sesión | Comprueba que la sesión sigue vigente y renueva las dos cookies | — | `200` `{"user":{"id":"0a0a92a5…","email":"ana@example.com","fullName":"Ana Pérez","isActive":true,"roles":["user"]}}` |
| `POST` | `/auth/logout` | Sesión + CSRF | Cierra la sesión: expira `access_token` y `csrf_token` | — | `200` `{"ok":true}` |
| `GET` | `/products` | Pública | Catálogo paginado. Parámetros opcionales: `limit` (10), `offset` (0), `gender` (`men`, `women`, `kid`, `unisex`), `sizes` (`XS,S,M`), `minPrice`, `maxPrice`, `q` (texto del título) | `?limit=2&offset=0&gender=women` | `200` `{"count":13,"pages":7,"products":[{"id":"17cf9ccb…","title":"Women's Raven Joggers","price":100,"slug":"women_raven_joggers","stock":162,"sizes":["XS","S","M","L","XL","XXL"],"gender":"women","tags":["shirt"],"images":["1740270-00-A_0_2000.jpg","1740270-00-A_1.jpg"],"description":"…"}]}` |
| `GET` | `/products/:term` | Pública | Un producto por `id` (UUID), `slug` o título | `/products/women_raven_joggers` | `200` `{"id":"17cf9ccb…","title":"Women's Raven Joggers","price":100,"slug":"women_raven_joggers","stock":162,"sizes":["XS","S","M","L","XL","XXL"],"gender":"women","tags":["shirt"],"images":["1740270-00-A_0_2000.jpg","1740270-00-A_1.jpg"],"description":"…"}` |
| `POST` | `/products` | Sesión + CSRF (cualquier rol) | Crea un producto. El título es único | `{"title":"Gorra de ejemplo","price":25,"stock":10,"sizes":["M","L"],"gender":"unisex","tags":["gorra"]}` | `201` `{"id":"8dd0fa70…","title":"Gorra de ejemplo","price":25,"stock":10,"sizes":["M","L"],"gender":"unisex","tags":["gorra"],"images":[],"slug":"gorra_de_ejemplo","description":null}` |
| `PATCH` | `/products/:id` | admin + CSRF | Actualiza los campos enviados; `id` es un UUID | `{"price":29.9,"stock":8}` | `200` `{"id":"56fd73e4…","title":"Gorra de ejemplo","price":29.9,"stock":8,"slug":"gorra_de_ejemplo","sizes":["M","L"],"gender":"unisex","tags":["gorra"],"images":[]}` |
| `DELETE` | `/products/:id` | admin + CSRF | Elimina el producto; `id` es un UUID | — | `200` (cuerpo vacío) |
| `GET` | `/files/product/:imageName` | Pública | Devuelve la imagen guardada con ese nombre | `/files/product/1740280-00-A_0_2000.jpg` | `200` el archivo (`image/jpeg`, `image/png`…) |
| `POST` | `/files/product` | admin + CSRF | Sube una imagen. `multipart/form-data` con el campo `file`; solo se aceptan imágenes | `file=@ejemplo.png` | `201` `{"secureUrl":"http://localhost:3000/api/files/product/2f95004f-….png","fileName":"2f95004f-….png"}` |
| `GET` | `/seed` | Pública (403 con `STAGE=prod`) | Borra todos los usuarios y productos y carga los de ejemplo | — | `200` `SEED EXECUTED` |

### Errores comunes

| Código | Cuándo | Ejemplo de cuerpo |
|---|---|---|
| `400` | Cuerpo o parámetros inválidos, o dato duplicado (correo o título ya existentes) | `{"message":["email must be an email","The password must have a Uppercase, lowercase letter and a number","password must be longer than or equal to 6 characters"],"error":"Bad Request","statusCode":400}` |
| `401` | Sin sesión, cookie inválida o expirada, o credenciales incorrectas en `login` | `{"message":"Unauthorized","statusCode":401}` · `{"message":"Credentials are not valid","error":"Unauthorized","statusCode":401}` |
| `403` | Falta o es inválido el token CSRF | `{"message":"Invalid or missing CSRF token","error":"Forbidden","statusCode":403}` |
| `403` | El usuario no tiene el rol requerido | `{"message":"User Ana Pérez need a valid role: [admin]","error":"Forbidden","statusCode":403}` |
| `404` | El producto no existe | `{"message":"Product with no-existe-este-producto not found","error":"Not Found","statusCode":404}` |
| `500` | Error inesperado; el detalle queda en el log del servidor | `{"message":"Unexpected error, check server logs","error":"Internal Server Error","statusCode":500}` |

## WebSocket (Socket.IO)

Mensajería en tiempo real entre usuarios autenticados. El servidor escucha en `http://localhost:3000` con la ruta **`/api/socket.io`** (bajo `/api`, para que el navegador envíe la cookie `access_token`).

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  path: '/api/socket.io',
  withCredentials: true, // envía la cookie access_token en el handshake
});
```

| Elemento | Sentido | Descripción | Ejemplo (JSON) |
|---|---|---|---|
| Conexión | Cliente → servidor | Se autentica con la cookie `access_token` del handshake. Sin cookie, con una inválida o expirada, o de un usuario inactivo, el servidor desconecta (`io server disconnect`). Solo se admite una conexión por usuario: la anterior se cierra | — |
| `clients-updated` | Servidor → todos | Se emite cuando alguien se conecta o desconecta. Trae los identificadores de socket conectados | `["Ma3q…", "Zp9k…"]` |
| `message-from-client` | Cliente → servidor | Envía un mensaje | `{"message":"Hola desde el cliente"}` |
| `message-from-server` | Servidor → todos | Difunde el mensaje con el nombre del usuario que lo envió | `{"fullName":"Test One","message":"Hola desde el cliente"}` |

## Estado y pendientes

**Implementado** (todas las decisiones de refactorización):

- **ADR-001, pruebas:** 165 pruebas unitarias y de integración en 12 suites (incluida la integración de WebSocket con un cliente real) y 10 pruebas e2e contra PostgreSQL en el Backend; 39 pruebas en el Frontend. Cobertura del módulo Auth: 92 % de sentencias, con `AuthController` y `AuthService` al 100 % y un umbral mínimo del 70 % en el CI.
- **ADR-002, exclusión declarativa de `password`:** DTOs de respuesta con lista blanca.
- **ADR-003, retiro de las rutas `private*`.**
- **ADR-004, JWT en cookie `httpOnly` con CSRF:** `TokenService`, `CsrfGuard`, `POST /auth/logout`, CORS con credenciales y WebSocket autenticado por cookie.
- **Docker verificado:** la imagen de producción ya copia `static/` (las imágenes de productos se sirven desde el contenedor) y se probó junto con el `docker-compose.yml` de desarrollo con el API dentro de un contenedor. Nueva variable opcional `DB_SSL` (vacía = SSL solo con `STAGE=prod`): el PostgreSQL de `docker-compose.prod.yml` no trae SSL y sin ella el API de producción no arrancaba; ese compose la fija en `false`.
- **Dependencias:** `pnpm update` dentro de los rangos y overrides de la misma versión mayor en el Backend. `pnpm audit` bajó de 24 a 3 avisos en el Backend y de 43 a 3 en el Frontend; `pnpm audit --prod` del Frontend no encuentra vulnerabilidades.
- **Endurecimientos:** subida de archivos solo para `admin`; `GET /seed` bloqueado con `STAGE=prod`; Products ya no devuelve al propietario (`user`); mensaje `401` uniforme en `login`; el rol `super` de la semilla es ahora `super-user`.

**Pendiente y limitaciones conocidas:**

- El JWT no se puede revocar: `logout` expira las cookies en el navegador, pero un JWT ya copiado sigue siendo válido hasta que vence (2 h por defecto). No hay lista de revocación.
- `POST /api/products` solo exige sesión, no rol `admin` (`PATCH` y `DELETE` sí lo exigen).
- TypeORM corre con `synchronize: true`, incluso con `STAGE=prod`; en producción conviene usar migraciones.
- Las imágenes que se suben en producción se guardan en el sistema de archivos del contenedor (`/app/static/products`) y se pierden si se recrea; para conservarlas hay que montar un volumen en esa ruta.
- Avisos de `pnpm audit` sin corrección compatible: `deepmerge` (bajo, no existe versión parcheada), `glob` y `minimatch` (moderados; exigen glob 14 y minimatch 11, y ni TypeORM ni `@nestjs/cli` los usan todavía). En el Backend solo `glob` y `minimatch` están en producción, a través de TypeORM, y se aplican a patrones de nuestra configuración, no a entrada de usuarios. En el Frontend los 3 avisos (`zod`, `deepmerge`, `minimatch`) vienen de la CLI de `shadcn` y de `typescript-eslint`, solo de desarrollo.
- Quedan pendientes las pruebas e2e del Frontend.

El detalle por capas está en [`src/README.md`](src/README.md) y el de las pruebas en [`tests/README.md`](tests/README.md).

## Estructura del repositorio

| Carpeta | Contenido |
|---|---|
| [`docs/`](docs/) | Arquitectura ([`arquitectura.md`](docs/arquitectura.md)), decisiones ([`adr/`](docs/adr/)) y diagramas C4 ([`diagramas/`](docs/diagramas/README.md)) |
| [`src/backend/`](src/backend/README.md) | API NestJS (TypeORM, PostgreSQL, Swagger, WebSocket) |
| [`src/frontend/`](src/frontend/README.md) | SPA React (Vite, Tailwind, Zustand, TanStack Query) |
| [`src/`](src/README.md) | Índice de la refactorización: capas del módulo Auth y decisiones implementadas |
| [`tests/`](tests/README.md) | Índice de pruebas y resultados ([`resultados/`](tests/resultados/)) |
| [`.github/`](.github/workflows/ci.yml) | Integración continua y plantilla de pull request |

Para contribuir, vea [`CONTRIBUTING.md`](CONTRIBUTING.md).
