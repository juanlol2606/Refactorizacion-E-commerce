import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';

import {
  ACCESS_TOKEN_COOKIE,
  API_PREFIX,
  DEFAULT_FRONTEND_URL,
} from './auth/auth.constants';
import { CookieIoAdapter } from './message-ws/cookie-io.adapter';

/**
 * Configuración HTTP global (ADR-004): prefijo /api, cookie-parser, CORS con
 * credenciales solo para FRONTEND_URL (HTTP y WebSocket) y validación de
 * entrada. La comparten main.ts y las pruebas, de modo que se prueba lo mismo
 * que se ejecuta.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const frontendUrl =
    config.get<string>('FRONTEND_URL') || DEFAULT_FRONTEND_URL;

  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token'],
  });
  app.useWebSocketAdapter(new CookieIoAdapter(app, frontendUrl));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}

/** Swagger en /api. La sesión es la cookie `access_token`; las mutaciones llevan X-CSRF-Token. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Teslo RESTful API')
    .setDescription(
      'Teslo shop endpoints. The session is the httpOnly cookie `access_token`, set by register, login and check-status. ' +
        'POST, PUT, PATCH and DELETE on authenticated routes must also send the header `X-CSRF-Token` with the value of the ' +
        '`csrf_token` cookie (use the Authorize button). Sign in with `POST /api/auth/login` and keep using this page: ' +
        'the browser sends the cookie automatically.',
    )
    .setVersion('1.0')
    .addCookieAuth(ACCESS_TOKEN_COOKIE, undefined, ACCESS_TOKEN_COOKIE)
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(API_PREFIX, app, documentFactory);
}
