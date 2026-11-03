/** Cookie httpOnly con el JWT de sesión (ADR-004). */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Cookie legible por JavaScript con el token CSRF (patrón double-submit). */
export const CSRF_TOKEN_COOKIE = 'csrf_token';

/** Cabecera en la que el Frontend devuelve el token CSRF. */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * El JWT solo viaja hacia la API. El token CSRF debe ser legible desde las
 * páginas del SPA (`document.cookie` solo ve cookies cuyo Path es prefijo de la
 * ruta de la página), por eso su Path es `/`.
 */
export const ACCESS_TOKEN_COOKIE_PATH = '/api';
export const CSRF_TOKEN_COOKIE_PATH = '/';

/** Prefijo de la API; también es la ruta de Socket.IO (`/api/socket.io`) para que el navegador envíe la cookie. */
export const API_PREFIX = 'api';
export const WS_PATH = `/${API_PREFIX}/socket.io`;

export const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
export const DEFAULT_JWT_EXPIRES_IN = '2h';
