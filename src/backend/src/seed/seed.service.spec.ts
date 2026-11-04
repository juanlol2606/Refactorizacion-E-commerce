import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { User } from '../auth/entities/user.entity';
import { ValidRoles } from '../auth/interfaces';
import { ProductsService } from '../products/products.service';
import { initialData } from './data/seed-data';
import { SeedService } from './seed.service';

describe('SeedService', () => {
  let service: SeedService;
  const calls: string[] = [];

  const usersDelete = { where: jest.fn(), execute: jest.fn() };
  const userRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const productsService = {
    deleteAllProducts: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    calls.length = 0;

    usersDelete.execute.mockImplementation(() => {
      calls.push('users.delete');
      return Promise.resolve();
    });
    userRepository.createQueryBuilder.mockReturnValue({
      delete: () => usersDelete,
    });
    userRepository.save.mockImplementation((users: Partial<User>[]) =>
      Promise.resolve(users.map((u, i) => ({ ...u, id: `u-${i}` }))),
    );
    productsService.deleteAllProducts.mockImplementation(() => {
      calls.push('products.delete');
      return Promise.resolve();
    });
    productsService.create.mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        SeedService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: ProductsService, useValue: productsService },
      ],
    }).compile();

    service = moduleRef.get(SeedService);
  });

  it('borra todas las filas SIN criterios vacíos (TypeORM 0.3.31 rechaza where({}))', async () => {
    await service.runSeed();

    expect(usersDelete.where).not.toHaveBeenCalled();
    expect(usersDelete.execute).toHaveBeenCalledTimes(1);
  });

  it('borra primero los productos y luego los usuarios (clave foránea)', async () => {
    await service.runSeed();

    expect(calls.slice(0, 2)).toEqual(['products.delete', 'users.delete']);
  });

  it('inserta los usuarios y los productos de la semilla y confirma', async () => {
    const result = await service.runSeed();

    expect(result).toBe('SEED EXECUTED');
    expect(userRepository.save).toHaveBeenCalledWith(initialData.users);
    expect(productsService.create).toHaveBeenCalledTimes(
      initialData.products.length,
    );
  });

  it('todos los roles de la semilla son roles válidos (no existe el rol "super")', () => {
    const valid = Object.values(ValidRoles) as string[];

    for (const seedUser of initialData.users) {
      for (const role of seedUser.roles) expect(valid).toContain(role);
    }
    expect(initialData.users.some((u) => u.roles.includes('super-user'))).toBe(
      true,
    );
  });

  it('asigna los productos al primer usuario de la semilla', async () => {
    await service.runSeed();

    const [, owner] = productsService.create.mock.calls[0] as [unknown, User];
    expect(owner.id).toBe('u-0');
  });
});
