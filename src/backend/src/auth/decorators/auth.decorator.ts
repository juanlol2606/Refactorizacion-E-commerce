import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiCookieAuth, ApiSecurity } from '@nestjs/swagger';

import { ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { CsrfGuard } from '../guards/csrf.guard';
import { UserRoleGuard } from '../guards/user-role.guard';
import { ValidRoles } from '../interfaces';
import { RoleProtected } from './role-protected.decorator';

/**
 * Protege una ruta: autentica con el JWT de la cookie (AuthGuard), autoriza por
 * rol (UserRoleGuard) y, en POST, PUT, PATCH y DELETE, exige el token CSRF
 * (CsrfGuard). El orden importa: CsrfGuard necesita `req.user`.
 */
export function Auth(...roles: ValidRoles[]) {
  return applyDecorators(
    RoleProtected(...roles),
    UseGuards(AuthGuard(), UserRoleGuard, CsrfGuard),
    ApiCookieAuth(ACCESS_TOKEN_COOKIE),
    ApiSecurity('csrf'),
  );
}
