import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Category } from './schemas/category.schema';
import { CategoryRepository } from './repositories/category.repository';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
import { parseObjectId, parseObjectIdOptional, isValidObjectIdString } from '../../common/utils/objectid.util';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug || this.generateSlug(dto.name);
    const existing = await this.categoryRepository.findOneBySlug(slug);
    if (existing) {
      throw new BadRequestException('Category with this slug already exists');
    }
    const parentId = parseObjectIdOptional(dto.parent, 'parent');
    return this.categoryRepository.createOne(dto, slug, parentId);
  }

  async findAll(query: CategoryQueryDto): Promise<PaginatedResult<Category>> {
    return this.categoryRepository.findAllPaginated(query);
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categoryRepository.findByIdString(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoryRepository.findOneBySlug(slug);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async findActiveCategories(): Promise<Category[]> {
    return this.categoryRepository.findActiveSorted();
  }

  async findSubcategories(parentId: string): Promise<Category[]> {
    if (!isValidObjectIdString(parentId)) return [];
    return this.categoryRepository.findSubcategoriesByParentId(parseObjectId(parentId, 'parentId'));
  }

  async getCategoryTree(): Promise<Category[]> {
    const allCategories = await this.categoryRepository.findActiveLean();
    const categoryMap = new Map<string, Category & { children?: Category[] }>();
    const rootCategories: (Category & { children?: Category[] })[] = [];

    allCategories.forEach((cat) => {
      categoryMap.set(cat._id.toString(), { ...cat, children: [] });
    });

    allCategories.forEach((cat) => {
      const category = categoryMap.get(cat._id.toString());
      if (category) {
        if (cat.parent) {
          const parent = categoryMap.get(cat.parent.toString());
          if (parent && parent.children) {
            parent.children.push(category);
          }
        } else {
          rootCategories.push(category);
        }
      }
    });

    return rootCategories;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const idObj = parseObjectId(id, 'id');
    if (dto.slug) {
      const existing = await this.categoryRepository.findOneBySlugExcludingId(dto.slug, idObj);
      if (existing) {
        throw new BadRequestException('Category with this slug already exists');
      }
    }
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.parent !== undefined && dto.parent !== null && dto.parent !== '') {
      updateData.parent = parseObjectId(dto.parent, 'parent');
    }
    const category = await this.categoryRepository.findByIdAndUpdateDoc(idObj, updateData);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async delete(id: string): Promise<void> {
    const idObj = parseObjectId(id, 'id');
    const hasSubcategories = await this.categoryRepository.existsByParentId(idObj);
    if (hasSubcategories) {
      throw new BadRequestException(
        'Cannot delete category with subcategories. Delete subcategories first.',
      );
    }
    const result = await this.categoryRepository.deleteOne({ _id: idObj });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Category not found');
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
