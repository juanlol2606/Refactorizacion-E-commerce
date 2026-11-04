# `src/` — código de la refactorización

El código fuente de SHOP vive en dos aplicaciones independientes dentro de `src/`. Cada una conserva su propio `package.json`, Dockerfile y configuración (con rutas relativas).

| Aplicación | Ruta | Tecnología |
|---|---|---|
| Backend | [`src/backend/`](backend/) | NestJS + TypeORM + PostgreSQL |
| Frontend | [`src/frontend/`](frontend/) | React + Vite |

Este índice indica dónde está la estructura de la refactorización del módulo Auth. La numeración de las decisiones (ADR-001 a ADR-004) es la de [`docs/adr/`](../docs/adr/).

## Backend: `src/backend/src/auth/`

El módulo Auth se organiza en capas. Cada capa solo depende de la que tiene debajo.

```
src/backend/src/auth/
├── auth.module.ts                   # cableado: TypeORM, Passport, JwtModule (JWT_EXPIRES_IN) y TokenService
├── auth.constants.ts                # nombres de cookies y cabecera CSRF, rutas de las cookies y de Socket.IO
│
│   ── Presentación ──────────────────────────────────────────────────────────────
├── auth.controller.ts               # register, login, check-status y logout         [ADR-002, ADR-003, ADR-004]
├── dto/
│   ├── create-user.dto.ts           # entrada: registro
│   ├── login-user.dto.ts            # entrada: login
│   ├── user-response.dto.ts         # salida: lista blanca con @Expose()             [ADR-002]
│   ├── auth-response.dto.ts         # salida: { user }, sin token                    [ADR-004]
│   ├── logout-response.dto.ts       # salida: { ok }
│   └── index.ts
│
│   ── Control de acceso ─────────────────────────────────────────────────────────
├── decorators/                      # @Auth (AuthGuard + UserRoleGuard + CsrfGuard), @RoleProtected y @GetUser
├── guards/
│   ├── user-role.guard.ts           # autorización por roles
│   └── csrf.guard.ts                # double-submit firmado en POST, PUT, PATCH y DELETE  [ADR-004]
├── strategies/jwt.strategy.ts       # estrategia Passport: lee el JWT de la cookie y carga el usuario  [ADR-004]
│
│   ── Aplicación ───────────────────────────────────────────────────────────────
├── auth.service.ts                  # registro, login y renovación; devuelve una AuthSession
├── services/token.service.ts        # JWT, cookies de sesión y token CSRF             [ADR-004]
│
│   ── Persistencia ─────────────────────────────────────────────────────────────
├── entities/user.entity.ts          # entidad User (tabla `users`)
│
│   ── Transversal ──────────────────────────────────────────────────────────────
└── interfaces/                      # AuthSession, JwtPayload y ValidRoles
```

| Capa | Archivos | Responsabilidad |
|---|---|---|
| Presentación | `auth.controller.ts`, `dto/*` | Recibir y validar la petición HTTP, fijar las cookies y dar forma a la respuesta (sin `password` ni token). |
| Control de acceso | `decorators/*`, `guards/*`, `strategies/jwt.strategy.ts` | Autenticar con la cookie `access_token`, autorizar por rol y exigir el token CSRF al modificar estado. |
| Aplicación | `auth.service.ts`, `services/token.service.ts` | Reglas de negocio: cifrado con bcrypt, mensaje 401 uniforme, firma del JWT, cookies y token CSRF. |
| Persistencia | `entities/user.entity.ts` + `Repository<User>` de TypeORM | Acceso a la tabla `users`. El repositorio lo inyecta TypeORM en `AuthService` y `JwtStrategy`; no existe una clase de repositorio propia. |

Fuera de la carpeta `auth/` también forman parte de la sesión:

- `src/backend/src/app.setup.ts` — configuración HTTP global compartida por `main.ts` y las pruebas: prefijo `/api`, `cookie-parser`, CORS con credenciales solo para `FRONTEND_URL`, validación y Swagger.
- `src/backend/src/message-ws/` — el gateway WebSocket se autentica con la cookie del handshake y `cookie-io.adapter.ts` fija `/api/socket.io` y el CORS.

Las pruebas están junto al código (`*.spec.ts`) y el e2e en `src/backend/test/` (ver [`tests/`](../tests/README.md)).

## Frontend: `src/frontend/src/`

- `auth/` — páginas, store de Zustand (sin token ni `localStorage`) y acciones (`login`, `register`, `check-auth` y `logout`).
- `api/eShopApi.ts` — cliente HTTP (axios) con `withCredentials` y la cabecera `X-CSRF-Token` en las peticiones que modifican estado.
- `components/routes/ProtectedRoutes.tsx` — rutas protegidas según `authStatus` e `isAdmin()`.
- Pruebas con Vitest junto al código (`*.test.ts` y `*.test.tsx`) y `test/setup.ts`.

## Decisiones de refactorización

| ADR | Decisión | Estado | Dónde se ve |
|---|---|---|---|
| ADR-001 | Suite de pruebas automatizadas para Auth | Implementada | 165 pruebas en 12 suites y 10 e2e en el Backend, 39 en el Frontend; ver [`tests/`](../tests/README.md) |
| ADR-002 | Exclusión declarativa de `password` con DTOs de respuesta | Implementada | `dto/user-response.dto.ts`, `dto/auth-response.dto.ts`, `auth.service.ts` |
| ADR-003 | Retiro de las rutas de prueba `private`, `private2` y `private3` y del decorador `@RawHeaders` | Implementada | `auth.controller.ts`, `decorators/` |
| ADR-004 | JWT en cookie `httpOnly` con protección CSRF | Implementada | `services/token.service.ts`, `guards/csrf.guard.ts`, `strategies/jwt.strategy.ts`, `auth.controller.ts` (`logout`), `app.setup.ts` y el cliente `eShopApi.ts` del Frontend |

Limitaciones conocidas: el JWT es sin estado (no se puede revocar antes de que expire) y `POST /api/products` solo exige sesión, no rol `admin`. Más detalle en el [README raíz](../README.md) y en [`docs/arquitectura.md`](../docs/arquitectura.md).
