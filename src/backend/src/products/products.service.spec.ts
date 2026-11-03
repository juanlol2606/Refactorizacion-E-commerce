import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Product, ProductImage } from './entities';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;

  const deleteBuilder = { where: jest.fn(), execute: jest.fn() };
  const productRepository = { createQueryBuilder: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    deleteBuilder.execute.mockResolvedValue({ affected: 3 });
    productRepository.createQueryBuilder.mockReturnValue({
      delete: () => deleteBuilder,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepository },
        { provide: getRepositoryToken(ProductImage), useValue: {} },
        { provide: DataSource, useValue: {} },
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
});
