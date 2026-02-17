import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  UpdateStockDto,
} from './dto/product.dto';
import { Product } from './schemas/product.schema';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { PaginatedResult } from '@/common/types/pagination.types';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.productsService.create(dto);
  }

  @Public()
  @Get()
  async findAll(@Query() query: ProductQueryDto): Promise<PaginatedResult<Product>> {
    return this.productsService.findAll(query);
  }

  @Public()
  @Get('featured')
  async findFeatured(@Query('limit') limit?: string): Promise<Product[]> {
    return this.productsService.findFeatured(limit ? parseInt(limit, 10) : 10);
  }

  @Get('low-stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async getLowStockProducts(): Promise<Product[]> {
    return this.productsService.getLowStockProducts();
  }

  @Public()
  @Get('search')
  async searchProducts(
    @Query('q') searchTerm: string,
    @Query('limit') limit?: string,
  ): Promise<Product[]> {
    return this.productsService.searchProducts(
      searchTerm,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Public()
  @Get('category/:categoryId')
  async findByCategory(@Param('categoryId') categoryId: string): Promise<Product[]> {
    return this.productsService.findByCategory(categoryId);
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Product> {
    await this.productsService.incrementViewCount(id);
    return this.productsService.findById(id);
  }

  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<Product> {
    return this.productsService.findBySlug(slug);
  }

  @Public()
  @Get('sku/:sku')
  async findBySku(@Param('sku') sku: string): Promise<Product> {
    return this.productsService.findBySku(sku);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(id, dto);
  }

  @Put(':id/stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async updateStock(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
  ): Promise<Product> {
    return this.productsService.updateStock(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.productsService.delete(id);
    return { message: 'Product deleted successfully' };
  }
}
