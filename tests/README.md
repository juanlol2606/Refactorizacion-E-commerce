# `tests/` — pruebas del módulo MVP

Las pruebas viven junto al código (convención de NestJS y de Vitest) y se ejecutan desde `src/backend/` y `src/frontend/`. Este índice dice dónde están y qué verifica cada una.

## Backend (Jest, `src/backend/`)

| Archivo | Tipo | Qué verifica |
|---|---|---|
| `src/auth/auth.service.spec.ts` | Unitaria | Cifrado con bcrypt, errores 400/401/500, mensaje 401 uniforme, que la respuesta no incluya `password` (ADR-002) y que el JWT vaya aparte del usuario |
| `src/auth/services/token.service.spec.ts` | Unitaria | Firma y verificación del JWT, lectura de la cookie, token CSRF (válido, de otro usuario, alterado, mal formado), atributos de las cookies y su vigencia |
| `src/auth/guards/csrf.guard.spec.ts` | Unitaria | `X-CSRF-Token` obligatorio en POST, PUT, PATCH y DELETE y comparación con la cookie |
| `src/auth/guards/user-role.guard.spec.ts` | Unitaria | Autorización por roles (permitido, 403, 400) |
| `src/auth/strategies/jwt.strategy.spec.ts` | Unitaria | Passport: usuario válido, inexistente o inactivo |
| `src/auth/auth.integration.spec.ts` | Integración HTTP | Registro, login, `check-status` y `logout` con cookies; `Set-Cookie`, ausencia de token en el cuerpo, 401 sin cookie, expirada o de otra firma, 403 sin CSRF o alterado, roles, CORS y rutas `private*` retiradas (404) |
| `src/message-ws/message-ws.gateway.spec.ts` | Unitaria | Autenticación del gateway con la cookie del handshake y `CookieIoAdapter` |
| `src/message-ws/message-ws.integration.spec.ts` | Integración | Cliente Socket.IO real: conexión válida, sin cookie, JWT inválido, expirado o de otra firma, usuario inactivo, ruta `/api/socket.io` y CORS |
| `src/files/files.controller.spec.ts` | Integración HTTP | Lectura de imágenes pública (sin salir de `static/`) y subida solo para `admin` con CSRF |
| `src/seed/seed.controller.spec.ts` | Unitaria | `GET /seed` responde 403 con `STAGE=prod` |
| `src/seed/seed.service.spec.ts` | Unitaria | Borrado sin `where` vacío, orden de borrado y roles válidos de la semilla |
| `src/products/products.service.spec.ts` | Unitaria | Borrado masivo y que ninguna respuesta de Products incluya `user` |
| `test/auth.e2e-spec.ts` | E2E con PostgreSQL | Registro → login → `check-status` → ruta protegida por rol → logout con la aplicación completa |

## Frontend (Vitest, `src/frontend/`)

| Archivo | Qué verifica |
|---|---|
| `src/auth/store/auth.store.test.ts` | Login correcto y fallido, registro, `checkAuthStatus` (un 401 es no autenticado), logout (aunque falle la llamada) y que no use `localStorage` |
| `src/api/eShopApi.test.ts` | `withCredentials`, cabecera `X-CSRF-Token` solo en POST, PUT, PATCH y DELETE, y que nunca envíe `Authorization` |
| `src/components/routes/ProtectedRoutes.test.tsx` | Redirecciones de `AuthenticatedRoute`, `NotAuthenticatedRoute` y `AdminRoute` según `authStatus` e `isAdmin()` |

## Ejecutar

```sh
cd src/backend
pnpm install
pnpm test                # 165 pruebas en 12 suites, sin base de datos
pnpm run test:cov:auth   # cobertura del módulo Auth; falla si baja del 70 %
pnpm run test:e2e        # 10 pruebas e2e; necesitan PostgreSQL y el .env (docker compose up -d db)

cd ../frontend
pnpm install
pnpm test                # 39 pruebas
```

## Resultados

- **Backend:** 165 pruebas en verde en 12 suites y 10 pruebas e2e contra PostgreSQL.
- **Frontend:** 39 pruebas en verde.
- **Cobertura del módulo Auth:** 92,33 % de sentencias; `AuthController`, `AuthService` y `CsrfGuard` al 100 %. El umbral del 70 % para `src/auth/` está en la configuración de Jest.
- Estado antes de la refactorización: 0 pruebas.

Evidencia (salidas reales):

- [`resultados/cobertura-auth.txt`](resultados/cobertura-auth.txt) — cobertura del módulo Auth.
- [`resultados/fase1-humo.txt`](resultados/fase1-humo.txt) — prueba de humo con `curl` (seed, login, CSRF, logout).
- [`resultados/semana15-validacion.txt`](resultados/semana15-validacion.txt) — validación final desde un clon limpio, con el recorrido en el navegador.

## Pendiente

Pruebas e2e del Frontend. Ver [ADR-001](../docs/adr/ADR-001-suite-de-pruebas-automatizadas-para-auth.md).
