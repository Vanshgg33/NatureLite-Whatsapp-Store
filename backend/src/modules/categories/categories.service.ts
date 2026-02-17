import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';
import { PaginatedResult, paginate } from '@/common/types/pagination.types';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug || this.generateSlug(dto.name);

    const existingCategory = await this.categoryModel.findOne({ slug });
    if (existingCategory) {
      throw new BadRequestException('Category with this slug already exists');
    }

    const category = new this.categoryModel({
      ...dto,
      slug,
      parent: dto.parent ? new Types.ObjectId(dto.parent) : undefined,
    });

    return category.save();
  }

  async findAll(query: CategoryQueryDto): Promise<PaginatedResult<Category>> {
    const { page = 1, limit = 50, isActive, parent, rootOnly } = query;

    const filter: Record<string, unknown> = {};

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    if (rootOnly) {
      filter.parent = { $exists: false };
    } else if (parent) {
      filter.parent = new Types.ObjectId(parent);
    }

    const skip = (page - 1) * limit;

    const [categories, total] = await Promise.all([
      this.categoryModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.categoryModel.countDocuments(filter),
    ]);

    return paginate(categories, total, { page, limit });
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categoryModel.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoryModel.findOne({ slug });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async findActiveCategories(): Promise<Category[]> {
    return this.categoryModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  async findSubcategories(parentId: string): Promise<Category[]> {
    return this.categoryModel
      .find({ parent: new Types.ObjectId(parentId), isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  async getCategoryTree(): Promise<Category[]> {
    const allCategories = await this.categoryModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();

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
    if (dto.slug) {
      const existingCategory = await this.categoryModel.findOne({
        slug: dto.slug,
        _id: { $ne: new Types.ObjectId(id) },
      });

      if (existingCategory) {
        throw new BadRequestException('Category with this slug already exists');
      }
    }

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.parent) {
      updateData.parent = new Types.ObjectId(dto.parent);
    }

    const category = await this.categoryModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true },
    );

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async delete(id: string): Promise<void> {
    const hasSubcategories = await this.categoryModel.exists({
      parent: new Types.ObjectId(id),
    });

    if (hasSubcategories) {
      throw new BadRequestException(
        'Cannot delete category with subcategories. Delete subcategories first.',
      );
    }

    const result = await this.categoryModel.deleteOne({
      _id: new Types.ObjectId(id),
    });

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
