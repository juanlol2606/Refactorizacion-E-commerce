import axios from 'axios';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';
const MUTATING_METHODS = ['post', 'put', 'patch', 'delete'];

/** Lee una cookie legible por JavaScript (el JWT es httpOnly y no se puede leer). */
export const readCookie = (name: string): string | undefined => {
  const entry = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${name}=`));

  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
};

const eShopApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  // La sesión viaja en la cookie httpOnly access_token.
  withCredentials: true,
});

// Protección CSRF (ADR-004): las peticiones que modifican estado devuelven en la
// cabecera X-CSRF-Token el valor de la cookie csrf_token.
eShopApi.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();

  if (MUTATING_METHODS.includes(method)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) config.headers.set(CSRF_HEADER, csrfToken);
  }

  return config;
});

export { eShopApi };
