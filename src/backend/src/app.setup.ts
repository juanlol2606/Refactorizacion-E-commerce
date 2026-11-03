import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';

import {
  ACCESS_TOKEN_COOKIE,
  API_PREFIX,
  DEFAULT_FRONTEND_URL,
} from './auth/auth.constants';

/**
 * Configuración HTTP global (ADR-004): prefijo /api, cookie-parser, CORS con
 * credenciales solo para FRONTEND_URL y validación de entrada. La comparten
 * main.ts y las pruebas, de modo que se prueba lo mismo que se ejecuta.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL') || DEFAULT_FRONTEND_URL,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token'],
  });
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
    .setTitle('Teslo RESTul API')
    .setDescription('Teslo shop endpoints')
    .setVersion('1.0')
    .addCookieAuth(ACCESS_TOKEN_COOKIE, undefined, ACCESS_TOKEN_COOKIE)
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(API_PREFIX, app, documentFactory);
}
