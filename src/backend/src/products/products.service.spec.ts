import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { Product, ProductImage } from './entities';
import { ProductsService } from './products.service';

const OWNER = {
  id: 'u-1',
  email: 'test1@google.com',
  fullName: 'Test One',
  isActive: true,
  roles: ['admin'],
} as User;

const PRODUCT_ID = '5f0e1c8e-9d2a-4f3a-8b4e-6a1f2c3d4e5f';

/** Producto tal como lo devuelve TypeORM: con sus imágenes y su propietario (eager). */
const storedProduct = () => ({
  id: PRODUCT_ID,
  title: 'Camiseta',
  slug: 'camiseta',
  price: 35,
  stock: 3,
  sizes: ['M'],
  gender: 'unisex',
  tags: [],
  images: [{ id: 1, url: 'a.jpg' }],
  user: OWNER,
});

describe('ProductsService', () => {
  let service: ProductsService;

  const deleteBuilder = { where: jest.fn(), execute: jest.fn() };
  const productRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    findOneBy: jest.fn(),
    preload: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const productImageRepository = { create: jest.fn() };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { delete: jest.fn(), save: jest.fn() },
  };
  const dataSource = { createQueryRunner: jest.fn() };

  /** Ninguna respuesta de Products expone al propietario ni sus datos. */
  const expectNoOwner = (result: unknown) => {
    expect(result).not.toHaveProperty('user');
    expect(JSON.stringify(result)).not.toContain(OWNER.email);
    expect(JSON.stringify(result)).not.toContain(OWNER.fullName);
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    deleteBuilder.execute.mockResolvedValue({ affected: 3 });
    productRepository.createQueryBuilder.mockReturnValue({
      delete: () => deleteBuilder,
    });
    productImageRepository.create.mockImplementation(
      (data: { url: string }) => data,
    );
    dataSource.createQueryRunner.mockReturnValue(queryRunner);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepository },
        {
          provide: getRepositoryToken(ProductImage),
          useValue: productImageRepository,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('deleteAllProducts', () => {
    it('borra todas las filas SIN criterios vacíos (TypeORM 0.3.31 rechaza where({}))', async () => {
      const result = await service.deleteAllProducts();

      expect(deleteBuilder.where).not.toHaveBeenCalled();
      expect(deleteBuilder.execute).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ affected: 3 });
    });
  });

  describe('el propietario (user) no se expone en las respuestas', () => {
    it('create: devuelve el producto con sus imágenes y sin user', async () => {
      productRepository.create.mockImplementation(
        (data: Record<string, unknown>) => ({ ...data, id: PRODUCT_ID }),
      );
      productRepository.save.mockResolvedValue(undefined);

      const result = await service.create(
        {
          title: 'Camiseta',
          sizes: ['M'],
          gender: 'unisex',
          images: ['a.jpg'],
        },
        OWNER,
      );

      expect(result).toMatchObject({ id: PRODUCT_ID, images: ['a.jpg'] });
      expectNoOwner(result);
      // El propietario sí se guarda en la base: solo se oculta en la respuesta.
      expect(productRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ user: OWNER }),
      );
    });

    it('findAll: no carga las relaciones eager (user) y no lo devuelve', async () => {
      productRepository.find.mockResolvedValue([
        { ...storedProduct(), user: undefined },
      ]);
      productRepository.count.mockResolvedValue(1);

      const result = await service.findAll({ limit: 10, offset: 0 });

      expect(productRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          loadEagerRelations: false,
          relations: { images: true },
        }),
      );
      expect(result.products[0].images).toEqual(['a.jpg']);
      expect(result).toMatchObject({ count: 1, pages: 1 });
      result.products.forEach(expectNoOwner);
    });

    it('findAll: aunque la base devolviera user, no sale en la respuesta', async () => {
      productRepository.find.mockResolvedValue([storedProduct()]);
      productRepository.count.mockResolvedValue(1);

      const result = await service.findAll({ limit: 10, offset: 0 });

      expect(result.products[0].images).toEqual(['a.jpg']);
      expect(result.products[0]).toHaveProperty('title', 'Camiseta');
      result.products.forEach(expectNoOwner);
    });

    it('findOnePlain (por id): sin user y con las imágenes como URL', async () => {
      productRepository.findOneBy.mockResolvedValue(storedProduct());

      const result = await service.findOnePlain(PRODUCT_ID);

      expect(result.images).toEqual(['a.jpg']);
      expect(result).toHaveProperty('slug', 'camiseta');
      expectNoOwner(result);
    });

    it('update: devuelve el producto actualizado sin user', async () => {
      productRepository.preload.mockResolvedValue(storedProduct());
      productRepository.findOneBy.mockResolvedValue(storedProduct());

      const result = await service.update(PRODUCT_ID, { price: 50 }, OWNER);

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ user: OWNER }),
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expectNoOwner(result);
    });
  });
});
