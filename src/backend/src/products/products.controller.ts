import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from '../common/dtos/pagination.dto';

import { Auth, GetUser } from '../auth/decorators';
import { ValidRoles } from '../auth/interfaces';
import { User } from '../auth/entities/user.entity';
import { Product } from './entities';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Auth()
  @ApiResponse({
    status: 201,
    description: 'Product was created',
    type: Product,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden. Token related' })
  create(@Body() createProductDto: CreateProductDto, @GetUser() user: User) {
    return this.productsService.create(createProductDto, user);
  }

  @Get()
  @ApiResponse({
    status: 200,
    description: 'Got all products',
    type: [Product],
  })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.productsService.findAll(paginationDto);
  }

  @Get(':term')
  @ApiResponse({ status: 200, description: 'Got the product', type: Product })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('term') term: string) {
    return this.productsService.findOnePlain(term);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiResponse({
    status: 201,
    description: 'Product was updated',
    type: Product,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden. Token related' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
    @GetUser() user: User,
  ) {
    return this.productsService.update(id, updateProductDto, user);
  }

  @Auth(ValidRoles.admin)
  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Product deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }
}
