import { ApiProperty } from '@nestjs/swagger';

import { Product } from '../entities';

/** Cuerpo de GET /api/products: una página del catálogo. */
export class ProductsResponseDto {
  @ApiProperty({
    example: 52,
    description: 'Total number of products that match the filters',
  })
  count: number;

  @ApiProperty({
    example: 6,
    description: 'Total number of pages for the requested limit',
  })
  pages: number;

  @ApiProperty({ type: () => [Product] })
  products: Product[];
}
