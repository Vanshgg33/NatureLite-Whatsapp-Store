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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';
import { Category } from './schemas/category.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginatedResult } from '../../common/types/pagination.types';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  @Public()
  @Get()
  async findAll(@Query() query: CategoryQueryDto): Promise<PaginatedResult<Category>> {
    return this.categoriesService.findAll(query);
  }

  @Public()
  @Get('tree')
  async getCategoryTree(): Promise<Category[]> {
    return this.categoriesService.getCategoryTree();
  }

  @Public()
  @Get('active')
  async findActiveCategories(): Promise<Category[]> {
    return this.categoriesService.findActiveCategories();
  }

  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<Category> {
    return this.categoriesService.findBySlug(slug);
  }

  @Public()
  @Get(':id/subcategories')
  async findSubcategories(@Param('id') id: string): Promise<Category[]> {
    return this.categoriesService.findSubcategories(id);
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.findById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.categoriesService.delete(id);
    return { message: 'Category deleted successfully' };
  }
}
