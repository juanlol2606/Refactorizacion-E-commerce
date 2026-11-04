import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { SeedService } from './seed.service';
// import { Auth } from 'src/auth/decorators';
// import { ValidRoles } from 'src/auth/interfaces';

@ApiTags('Seed')
@Controller('seed')
export class SeedController {
  constructor(
    private readonly seedService: SeedService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Borra TODOS los usuarios y productos y carga los datos de ejemplo. No se
   * exige rol admin porque con la base vacía todavía no existe ninguno; por eso
   * se bloquea por completo cuando STAGE=prod.
   */
  @ApiResponse({
    status: 200,
    description: 'Seed executed',
  })
  @ApiResponse({ status: 403, description: 'Seed is disabled when STAGE=prod' })
  @Get()
  executeSeed() {
    if (this.configService.get<string>('STAGE') === 'prod')
      throw new ForbiddenException('Seed is disabled in production');

    return this.seedService.runSeed();
  }
}
