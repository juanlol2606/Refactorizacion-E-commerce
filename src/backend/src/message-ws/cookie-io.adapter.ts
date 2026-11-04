import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

import { WS_PATH } from '../auth/auth.constants';

/**
 * Adaptador de Socket.IO para la sesión por cookie (ADR-004).
 *
 * - `path`: /api/socket.io. La cookie access_token tiene Path=/api, así que el
 *   navegador solo la envía en el handshake si Socket.IO cuelga de /api.
 * - `cors`: solo FRONTEND_URL y con credenciales, igual que el CORS HTTP.
 *
 * Se aplica aquí (y no en @WebSocketGateway) porque los decoradores se evalúan
 * antes de que ConfigModule cargue el archivo .env.
 */
export class CookieIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    return super.createIOServer(port, {
      ...options,
      path: WS_PATH,
      cors: { origin: this.origin, credentials: true },
    }) as Server;
  }
}
