/**
 * Prueba e2e del flujo principal de Auth contra PostgreSQL real (ADR-001 y
 * ADR-004): registro → login → check-status → ruta protegida por rol → logout.
 *
 * Usa AppModule completo y la misma configuración HTTP que main.ts. Requiere
 * una base PostgreSQL accesible con las variables DB_*, JWT_SECRET y CSRF_SECRET
 * (en local, las de .env: `docker compose up -d db`). Crea un usuario y un
 * producto con datos únicos y los elimina al terminar, sin tocar el resto de
 * la base.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { User } from '../src/auth/entities/user.entity';

interface AuthBody {
  user: { id: string; email: string; fullName: string; roles: string[] };
}

const PASSWORD = 'Abc123';

describe('Auth (e2e con PostgreSQL): registro → login → check-status → rol → logout', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let agent: ReturnType<typeof request.agent>;

  const unique = randomUUID().slice(0, 8);
  const email = `e2e-${unique}@example.com`;
  let userId: string;
  let csrf: string;
  let productId: string | undefined;

  /** Lee el valor de una cookie de una respuesta (Set-Cookie). */
  const cookieFrom = (res: request.Response, name: string) => {
    const header = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    return header
      .find((c) => c.startsWith(`${name}=`))
      ?.split(';')[0]
      .slice(name.length + 1);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    // El agente conserva las cookies entre peticiones, como un navegador.
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      // Los productos referencian al usuario: primero ellos, luego él.
      await dataSource.query(
        'DELETE FROM product_images WHERE "productId" IN (SELECT id FROM products WHERE "userId" IN (SELECT id FROM users WHERE email = $1))',
        [email],
      );
      await dataSource.query(
        'DELETE FROM products WHERE "userId" IN (SELECT id FROM users WHERE email = $1)',
        [email],
      );
      await dataSource.query('DELETE FROM users WHERE email = $1', [email]);
    }
    await app.close();
  });

  it('1. registro: 201, cookies de sesión y respuesta solo con { user }', async () => {
    const res = await agent
      .post('/api/auth/register')
      .send({ email, fullName: 'Usuario E2E', password: PASSWORD })
      .expect(201);

    const body = res.body as AuthBody;
    expect(Object.keys(body)).toEqual(['user']);
    expect(body.user).toMatchObject({ email, roles: ['user'] });
    expect(JSON.stringify(body)).not.toMatch(/password|token/i);
    expect(cookieFrom(res, 'access_token')).toBeTruthy();

    userId = body.user.id;
    csrf = cookieFrom(res, 'csrf_token')!;
    expect(csrf).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{64}$/);
  });

  it('2. registro duplicado: 400', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, fullName: 'Otra vez', password: PASSWORD })
      .expect(400);
  });

  it('3. login con contraseña incorrecta: 401 y mismo mensaje que con un correo inexistente', async () => {
    const wrong = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Incorrecta1' })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `nadie-${unique}@example.com`, password: PASSWORD })
      .expect(401);

    expect(wrong.body).toEqual(unknown.body);
  });

  it('4. login: 201 y nuevas cookies de sesión', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);

    expect((res.body as AuthBody).user.id).toBe(userId);
    expect(Object.keys(res.body as object)).toEqual(['user']);
    csrf = cookieFrom(res, 'csrf_token')!;
    expect(csrf).toBeTruthy();
  });

  it('5. check-status con la cookie: 200 y renueva la sesión', async () => {
    const res = await agent.get('/api/auth/check-status').expect(200);

    expect((res.body as AuthBody).user.email).toBe(email);
    expect(cookieFrom(res, 'access_token')).toBeTruthy();
    csrf = cookieFrom(res, 'csrf_token')!;
  });

  it('6. ruta protegida por rol: un usuario "user" recibe 403 aunque envíe el CSRF', async () => {
    const res = await agent
      .delete(`/api/products/${randomUUID()}`)
      .set('X-CSRF-Token', csrf)
      .expect(403);

    expect(JSON.stringify(res.body)).toMatch(/need a valid role/);
  });

  it('7. al convertirse en admin (rol cambiado en la base) accede a la ruta de admin', async () => {
    await dataSource.getRepository(User).update(
      { id: userId },
      {
        roles: ['admin'],
      },
    );

    // Sin el token CSRF, una mutación se rechaza incluso siendo admin.
    await agent
      .post('/api/products')
      .send({ title: `Producto E2E ${unique}`, sizes: ['M'], gender: 'unisex' })
      .expect(403);

    const created = await agent
      .post('/api/products')
      .set('X-CSRF-Token', csrf)
      .send({ title: `Producto E2E ${unique}`, sizes: ['M'], gender: 'unisex' })
      .expect(201);
    const createdId = (created.body as { id: string }).id;
    productId = createdId;
    expect(created.body).not.toHaveProperty('user');

    await agent
      .delete(`/api/products/${productId}`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    productId = undefined;

    await request(app.getHttpServer())
      .get(`/api/products/${createdId}`)
      .expect(404);
  });

  it('8. logout: sin CSRF 403; con CSRF 200 { ok: true } y cookies expiradas', async () => {
    await agent.post('/api/auth/logout').expect(403);

    const res = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', csrf)
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    const header = (res.headers['set-cookie'] as unknown as string[]).join('|');
    expect(header).toMatch(/access_token=;.*Expires=Thu, 01 Jan 1970/);
    expect(header).toMatch(/csrf_token=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('9. check-status después del logout: 401', async () => {
    await agent.get('/api/auth/check-status').expect(401);
  });

  it('10. el catálogo público no expone al propietario de los productos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products?limit=5')
      .expect(200);

    const products = (res.body as { products: Record<string, unknown>[] })
      .products;
    for (const product of products) expect(product).not.toHaveProperty('user');
  });
});
