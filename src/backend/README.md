<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# API

A RESTful API for managing products, users, authentication, file uploads, and real-time messaging, built with [NestJS](https://nestjs.com/).

## Features

- User registration and authentication: JWT in an `httpOnly` cookie with CSRF protection (ADR-004)
- Role-based access control (admin, super-user, user)
- Product CRUD with pagination and filtering
- File upload and static file serving
- Database seeding with initial data
- WebSocket real-time messaging
- Swagger API documentation

## Getting Started

### Installation

1. **Clone the repository**

2. **Install dependencies**
   ```sh
   pnpm install
   ```

3. **Setup environment variables**
   - Copy `.env.template` to `.env` and fill in the required values.

4. **Start the database with Docker**
   ```sh
   docker-compose up -d
   ```

5. **Start the development server**
   ```sh
   pnpm run start:dev
   ```

6. **Seed the database**
   - Visit [http://localhost:3000/api/seed](http://localhost:3000/api/seed) in your browser or use a tool like Postman.

7. **Access API documentation**
   - Visit [http://localhost:3000/api](http://localhost:3000/api) for Swagger docs.

## Project Structure

- `src/` - Main source code
  - `auth/` - Authentication and user management
  - `products/` - Product CRUD and related logic
  - `files/` - File upload and static file serving
  - `seed/` - Database seeding
  - `message-ws/` - WebSocket real-time messaging
  - `common/` - Shared modules and DTOs

## Scripts

- `pnpm run start:dev` - Start the server in development mode
- `pnpm run build` - Build the project
- `docker-compose up -d` - Start the PostgreSQL database

## Environment Variables

Copy `.env.template` to `.env` and complete it:

| Variable | Description |
|---|---|
| `APP_VERSION`, `STAGE` | Version label and stage (`dev` or `prod`) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | PostgreSQL connection. Use `DB_HOST=localhost` when the API runs outside Docker |
| `DB_SSL` | Optional. `true` or `false` forces SSL to PostgreSQL on or off; empty means SSL only when `STAGE=prod` (managed databases). `docker-compose.prod.yml` sets it to `false` by default because its bundled PostgreSQL has no SSL |
| `PORT`, `HOST_API` | API port and public URL |
| `JWT_SECRET` | Secret used to sign the JWT |
| `JWT_EXPIRES_IN` | JWT and session cookie lifetime (default `2h`) |
| `CSRF_SECRET` | **Required**, at least 16 characters. Secret of the CSRF token. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FRONTEND_URL` | Frontend origin allowed by CORS (HTTP and WebSocket), with credentials (default `http://localhost:5173`) |
| `COOKIE_SECURE` | `true` only in production over HTTPS (marks the cookies as `Secure`) |

## Authentication: httpOnly cookie + CSRF

The JWT never travels in a response body or in `localStorage`:

- `register`, `login` and `check-status` set two cookies and answer only `{ "user": { ... } }`.
  - `access_token`: the JWT. `HttpOnly`, `SameSite=Lax`, `Path=/api`, `Max-Age` equal to `JWT_EXPIRES_IN`.
  - `csrf_token`: `nonce.HMAC_SHA256(CSRF_SECRET, nonce + userId)`. Readable by JavaScript (`Path=/`).
- `POST`, `PUT`, `PATCH` and `DELETE` on authenticated routes require the header `X-CSRF-Token` with the value of the `csrf_token` cookie. Without it (or if it was tampered with) the API answers `403`.
- `POST /api/auth/logout` (authenticated + CSRF) expires both cookies and answers `{ "ok": true }`.
- Clients must send credentials (`withCredentials: true` in Axios, `credentials: 'include'` in `fetch`).
- WebSocket: Socket.IO listens on `/api/socket.io` and authenticates with the `access_token` cookie of the handshake.

## Docker Usage

### Development

To run the app in development mode with hot-reloading using Docker:

```sh
docker-compose up -d
```

This uses a bind mount (`.:/app/`) so changes on your host are reflected inside the container.  
**Note:** The `watchOptions` in `tsconfig.json` are configured to ensure TypeScript detects file changes correctly when using Docker bind mounts.

### Production

To build and run the app for production:

```sh
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

This will build the production image and start both the app and the database containers.

- The image includes `static/`, so the seed images are served from `/app/static/products`.
- `DB_SSL` defaults to `false` in this compose file (the bundled PostgreSQL has no SSL). Set `DB_SSL=true` in `.env` if `DB_HOST` points to a managed database that requires SSL.
- `GET /api/seed` answers `403` with `STAGE=prod`, so the database starts empty: register a user and promote it to `admin` in the database.
- Images uploaded in production are stored inside the container (`/app/static/products`) and are lost if it is recreated. Mount a volume on that path to keep them.
- Both compose files use fixed container names (`shop-app` and `${DB_NAME}`) and port `5432`, so they cannot run side by side nor next to another PostgreSQL on the same host.

---