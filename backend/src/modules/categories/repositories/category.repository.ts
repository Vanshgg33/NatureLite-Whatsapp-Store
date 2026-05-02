import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { BaseRepository } from '../../../common/repository/base.repository';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from '../dto/category.dto';
import { paginate } from '../../../common/types/pagination.types';
import { parseObjectId, parseObjectIdOptional, isValidObjectIdString } from '../../../common/utils/objectid.util';

@Injectable()
export class CategoryRepository extends BaseRepository<CategoryDocument> {
  constructor(
    @InjectModel(Category.name) model: Model<CategoryDocument>,
  ) {
    super(model);
  }

  async findOneBySlug(slug: string): Promise<CategoryDocument | null> {
    return this.model.findOne({ slug }).exec();
  }

  async findOrCreateBySlug(name: string, slug: string, description?: string): Promise<CategoryDocument> {
    const existing = await this.findOneBySlug(slug);
    if (existing) {
      return existing;
    }

    return this.create({
      name,
      slug,
      description,
      isActive: true,
      sortOrder: 0,
      metadata: {},
    } as Partial<CategoryDocument>);
  }

  async findAllPaginated(query: CategoryQueryDto) {
    const { page = 1, limit = 50, isActive, parent, rootOnly } = query;
    const filter: Record<string, unknown> = {};
    if (isActive !== undefined) filter.isActive = isActive;
    if (rootOnly) {
      filter.parent = { $exists: false };
    } else if (isValidObjectIdString(parent)) {
      filter.parent = parseObjectId(parent, 'parent');
    }
    const skip = (page - 1) * limit;
    const [categories, total] = await Promise.all([
      this.model.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter),
    ]);
    return paginate(categories, total, { page, limit });
  }

  async createOne(dto: CreateCategoryDto, slug: string, parentId?: Types.ObjectId): Promise<CategoryDocument> {
    const doc = new this.model({
      ...dto,
      slug,
      parent: parentId,
    });
    return doc.save();
  }

  async findActiveSorted(): Promise<CategoryDocument[]> {
    return this.model.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).exec();
  }

  async findActiveLean(): Promise<(Category & { _id: Types.ObjectId; parent?: Types.ObjectId })[]> {
    return this.model.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean().exec();
  }

  async findSubcategoriesByParentId(parentId: Types.ObjectId): Promise<CategoryDocument[]> {
    return this.model
      .find({ parent: parentId, isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  async findOneBySlugExcludingId(slug: string, excludeId: Types.ObjectId): Promise<CategoryDocument | null> {
    return this.model.findOne({ slug, _id: { $ne: excludeId } }).exec();
  }

  async existsByParentId(parentId: Types.ObjectId): Promise<boolean> {
    const count = await this.model.exists({ parent: parentId }).exec();
    return !!count;
  }

  async findByIdAndUpdateDoc(
    id: Types.ObjectId,
    update: Record<string, unknown>,
  ): Promise<CategoryDocument | null> {
    return this.model.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
  }
}
