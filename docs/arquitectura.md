> **Documento de la Semana 13 — desactualizado.** Es la tabla de componentes y responsabilidades entregada en la Semana 13 y describe el diseño *planeado* (por eso está redactada en futuro: "Nuevo", "No existe"). No refleja el estado final del código. La arquitectura vigente está en [Descripción final](Descripcion%20final.pdf). Se conserva como evidencia de esa entrega.

## 1. Backend (NestJS)

| Componente | Responsabilidad | Dependencias | Archivo / paquete actual | Estado | Cambio con las actualizaciones |
| --- | --- | --- | --- | --- | --- |
| AuthModule | Ensambla el módulo: controlador, proveedores, Passport (jwt por defecto) y JWT (secret desde JWT_SECRET, expiración 2h). Exporta TypeOrmModule, JwtStrategy, PassportModule y JwtModule. | ConfigModule/ConfigService, TypeOrmModule.forFeature([User]), PassportModule, JwtModule.registerAsync, AuthController, AuthService, JwtStrategy | auth.module.ts |   | Modificado Ajuste de expiración/renovación de tokens. Limpieza de código comentado. |
| AuthController | Capa HTTP: POST /auth/register, POST /auth/login, GET /auth/check-status y rutas de prueba /private, /private2, /private3. Documenta con Swagger. | AuthService, AuthGuard, UserRoleGuard, decoradores (Auth, GetUser, RawHeaders, RoleProtected), ValidRoles, User, DTOs, @nestjs/swagger | auth.controller.ts |   | Modificado Emite el JWT como cookie httpOnly/Secure/SameSite en register y login, agrega logout. Retira o aísla /private* (con su console.log y rawHeaders). |
| AuthService | Lógica de negocio: create() (hash con bcrypt), login(), checkAuthStatus(), getJwtToken() y handleDBErrors() (23505 → 400). Excluye password con delete user.password. | Repository<User>, JwtService, bcrypt, CreateUserDto, LoginUserDto, JwtPayload, excepciones de NestJS | auth.service.ts |   | Modificado Elimina delete user.password (exclusión declarativa). Implementa la estrategia de renovación desde checkAuthStatus(). |
| JwtStrategy | Valida firma y expiración del JWT; busca al usuario por id y rechaza si no existe o está inactivo. | PassportStrategy, passport-jwt, ConfigService, Repository<User>, JwtPayload | strategies/jwt.strategy.ts | Modificado Cambia | fromAuthHeaderAsBearerToken() por un extractor que lee la cookie. |
| Entidad User | Modelo persistente: id, email, password (select: false), fullName, isActive, roles. Normaliza el email en @BeforeInsert/@BeforeUpdate. | TypeORM, @nestjs/swagger, Product | entities/user.entity.ts |   | Modificado Agrega @Exclude() sobre password. Revisar el @ApiProperty de password, que hoy aparece en la documentación del modelo. |
|   | DTOs de entrada CreateUserDto (email, password, fullName) y LoginUserDto (email, password), con validación de formato y longitud. | class-validator, @nestjs/swagger | dto/create-user.dto.ts, dto/login-user.dto.ts | Se mantiene | Sin cambios. Duplican la validación de password; se puede unificar. |
| UserRoleGuard | Lee los roles de la metadata y autoriza si el usuario tiene alguno. Lanza ForbiddenException si no. | Reflector, META_ROLES, entidad User | guards/user-role.guard.ts | Se mantiene | Cubierto por pruebas. Cambiar los imports src/auth/... por rutas relativas facilita probarlo. |
| Decorador @Auth() | Compone RoleProtected + AuthGuard() + UserRoleGuard en un solo decorador. | applyDecorators, AuthGuard, UserRoleGuard, ValidRoles | decorators/auth.decorator.ts Se | mantiene | Sin cambios. Pasa a ser el único mecanismo de protección. |
| Decorador @RoleProtected() | Guarda los roles permitidos como metadata (META_ROLES). | SetMetadata, ValidRoles | decorators/role- protected.decorator.ts | Se mantiene | Sin cambios. |


| Componente | Responsabilidad | Dependencias | Archivo / paquete actual | Estado | Cambio con las actualizaciones |
| --- | --- | --- | --- | --- | --- |
| Decorador @GetUser() | Extrae req.user (o una propiedad) y falla si no existe. | createParamDecorator, ExecutionContext | decorators/get- user.decorator.ts | Se mantiene | Sin cambios. |
| Decorador @RawHeaders() | Devuelve req.rawHeaders. Solo lo usa /private. | createParamDecorator, ExecutionContext | decorators/raw- headers.decorator.ts | Eliminado / solo dev | Se retira junto con /private. |
| Interfaces | JwtPayload (id) y ValidRoles (admin, super-user, user). | n/a | interfaces/jwt- payload.interface.ts, valid- roles.interface.ts, index.ts | Se mantiene | Sin cambios. |
| Gestión de cookie httpOnly | Emitir y limpiar el JWT como cookie httpOnly, Secure, SameSite. | AuthController, cookie-parser, Response de Express | No existe (afecta auth.controller.ts, jwt.strategy.ts y main.ts) | Nuevo | Atiende el Escenario 1 (Seguridad). |
|   | Protección CSRF Exigir token CSRF en solicitudes de mutación, porque las cookies exponen a ese riesgo. | Middleware CSRF, frontend (eShopApi.ts) | No existe | Nuevo | Meta: 100% de las mutaciones exigen token CSRF. |
| Exclusión declarativa de password | Garantizar que el hash no salga en el JSON de respuesta. | class-transformer, ClassSerializerInterceptor, entidad User | No existe (afecta user.entity.ts y auth.service.ts) | Nuevo | Atiende el Escenario 2 (Mantenibilidad). |
| Aislamiento de rutas de prueba | Retirar /private* de producción o moverlas a un controlador solo para desarrollo. | AuthController, ConfigService (entorno) | No existe (afecta auth.controller.ts) | Nuevo | Reduce la superficie de ataque. |

## 2. Frontend (React + Zustand)

| Componente | Responsabilidad | Dependencias | Archivo / paquete actual | Estado | Cambio con las actualizaciones |
| --- | --- | --- | --- | --- | --- |
| Auth store | Estado de sesión (user, token, authStatus), isAdmin(), login, register, logout y checkAuthStatus. Guarda y borra el token con localStorage. | zustand, las tres actions, interfaz User | auth/store/auth.store.ts | Modificado Elimina | localStorage.setItem/removeItem y el campo token. El estado depende solo del usuario y authStatus. |
| Login action | POST /auth/login con email y password. | eShopApi, AuthResponse | auth/actions/login.action.ts |   | Se mantiene Sin cambios de lógica; el token deja de viajar en el body. |
| Register action | POST /auth/register con fullName, email y password. | eShopApi, AuthResponse | auth/actions/register.action.ts |   | Se mantiene Igual que login. |
|   | Check-auth action GET /auth/check-status. Hoy exige un token en localStorage antes de llamar. | eShopApi, AuthResponse | auth/actions/check- auth.action.ts |   | Modificado Elimina la verificación de localStorage; la cookie viaja sola. |
| AuthResponse (interfaz) | Tipo de respuesta: user y token. | Interfaz User |   | auth/interfaces/auth.response.ts Modificado Elimina token: el backend ya no lo | devuelve en el body. |


| Componente | Responsabilidad | Dependencias | Archivo / paquete actual | Estado | Cambio con las actualizaciones |
| --- | --- | --- | --- | --- | --- |
| LoginPage / RegisterPage | Formularios de acceso. Llaman a login/register del store, navegan a / o muestran un toast de error. | react-router, sonner, useAuthStore, componentes UI (shadcn) | auth/pages/LoginPage.tsx, RegisterPage.tsx |   | Se mantiene Sin cambios; solo dependen de la API del store. |
| AuthLayout | Contenedor visual de las páginas de auth (Outlet). | react-router | auth/layouts/AuthLayout.tsx |   | Se mantiene Sin cambios. |
| Cliente HTTP (eShopApi) | Instancia Axios que envía el token en cada solicitud. | axios, localStorage | api/eShopApi.ts (no subido) |   | Modificado Activar withCredentials, quitar el header manual e incluir el token CSRFm |
