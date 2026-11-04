import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

describe('SeedController (GET /api/seed)', () => {
  const runSeed = jest.fn();

  const buildController = async (env: Record<string, string>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SeedController],
      providers: [
        { provide: SeedService, useValue: { runSeed } },
        { provide: ConfigService, useValue: new ConfigService(env) },
      ],
    }).compile();

    return moduleRef.get(SeedController);
  };

  beforeEach(() => {
    jest.resetAllMocks();
    runSeed.mockResolvedValue('SEED EXECUTED');
  });

  it('con STAGE=prod responde 403 y NO ejecuta el seed', async () => {
    const controller = await buildController({ STAGE: 'prod' });

    expect(() => controller.executeSeed()).toThrow(ForbiddenException);
    expect(runSeed).not.toHaveBeenCalled();
  });

  it.each(['dev', 'test', ''])(
    'con STAGE="%s" ejecuta el seed',
    async (stage) => {
      const controller = await buildController({ STAGE: stage });

      await expect(controller.executeSeed()).resolves.toBe('SEED EXECUTED');
      expect(runSeed).toHaveBeenCalledTimes(1);
    },
  );

  it('sin STAGE definido ejecuta el seed (entorno local)', async () => {
    const controller = await buildController({});

    await expect(controller.executeSeed()).resolves.toBe('SEED EXECUTED');
  });
});
