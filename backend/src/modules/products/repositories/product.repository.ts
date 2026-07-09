import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../schemas/product.schema';
import { BaseRepository } from '../../../common/repository/base.repository';
import { ProductQueryDto } from '../dto/product.dto';
import { paginate, PaginationOptions } from '../../../common/types/pagination.types';
import { buildSearchOrFilter } from '../../../common/utils/query.util';
import { isValidObjectIdString, parseObjectId } from '../../../common/utils/objectid.util';

@Injectable()
export class ProductRepository extends BaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name) model: Model<ProductDocument>,
  ) {
    super(model);
  }

  async findIdsAndStock(): Promise<
    Array<{
      _id: Types.ObjectId;
      stock: number;
      variants?: Array<{ sku: string; stock: number }>;
    }>
  > {
    return this.model
      .find()
      .select('_id stock variants.sku variants.stock')
      .lean()
      .exec() as unknown as Promise<
      Array<{
        _id: Types.ObjectId;
        stock: number;
        variants?: Array<{ sku: string; stock: number }>;
      }>
    >;
  }

  async findAllForSync(): Promise<ProductDocument[]> {
    // Filter out products with invalid (empty or non-ObjectId) category refs to avoid CastError during populate
    return this.model
      .find({ category: { $type: 'objectId' } })
      .populate('category', 'name slug')
      .sort({ createdAt: 1 })
      .exec();
  }

  async findOneBySku(sku: string): Promise<ProductDocument | null> {
    return this.model.findOne({ sku }).exec();
  }

  async findOneByRemoteRetailerId(retailerId: string): Promise<ProductDocument | null> {
    return this.model.findOne({ 'metadata.remoteCatalogRetailerId': retailerId }).exec();
  }

  async findOneBySlug(slug: string): Promise<ProductDocument | null> {
    return this.model.findOne({ slug }).exec();
  }

  async findAllPaginated(query: ProductQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      isActive,
      isFeatured,
      inStock,
      minPrice,
      maxPrice,
      tags,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const filter: Record<string, unknown> = {};

    const searchOr = buildSearchOrFilter(search, ['name', 'description', 'sku']);
    if (searchOr.length) filter.$or = searchOr;

    if (isValidObjectIdString(category)) {
      filter.category = parseObjectId(category, 'category');
    } else if (!category) {
      filter.category = { $type: 'objectId' };
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === true ? { $ne: false } : false;
    }
    if (isFeatured !== undefined) filter.isFeatured = isFeatured;

    if (inStock !== undefined) {
      if (inStock) filter.stock = { $gt: 0 };
      else filter.stock = { $lte: 0 };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) (filter.price as Record<string, number>).$gte = minPrice;
      if (maxPrice !== undefined) (filter.price as Record<string, number>).$lte = maxPrice;
    }

    if (tags?.length) filter.tags = { $in: tags };

    const skip = (page - 1) * limit;
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortDir, _id: sortDir };

    const [products, total] = await Promise.all([
      this.model
        .find(filter)
        .populate('category', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter),
    ]);

    return paginate(products, total, { page, limit });
  }

  async findByIdWithCategory(id: Types.ObjectId): Promise<ProductDocument | null> {
    return this.model.findById(id).populate('category', 'gstPercentage').exec();
  }

  async findOneBySlugWithCategory(slug: string): Promise<ProductDocument | null> {
    return this.model.findOne({ slug }).populate('category', 'gstPercentage').exec();
  }

  async findOneBySkuWithCategory(sku: string): Promise<ProductDocument | null> {
    return this.model.findOne({ sku }).populate('category', 'gstPercentage').exec();
  }

  async findByCategoryId(categoryId: Types.ObjectId, limit = 100): Promise<ProductDocument[]> {
    return this.model
      .find({ category: categoryId, isActive: true })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .exec();
  }

  async findFeatured(limit: number = 10): Promise<ProductDocument[]> {
    return this.model
      .find({
        isActive: true,
        isFeatured: true,
        category: { $type: 'objectId' },
      })
      .populate('category', 'name slug')
      .limit(limit)
      .exec();
  }

  async findOneBySkuExcludingId(sku: string, excludeId: Types.ObjectId): Promise<ProductDocument | null> {
    return this.model.findOne({ sku, _id: { $ne: excludeId } }).exec();
  }

  async findOneBySlugExcludingId(slug: string, excludeId: Types.ObjectId): Promise<ProductDocument | null> {
    return this.model.findOne({ slug, _id: { $ne: excludeId } }).exec();
  }

  async findByIdAndUpdateDoc(
    id: string,
    update: Record<string, unknown>,
  ): Promise<ProductDocument | null> {
    return this.model.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
  }

  async decrementVariantStock(productId: Types.ObjectId, variantSku: string, quantity: number) {
    const result = await this.model.updateOne(
      {
        _id: productId,
        'variants.sku': variantSku,
        'variants.stock': { $gte: quantity },
      },
      { $inc: { 'variants.$.stock': -quantity, totalSold: quantity } },
    );
    return result.modifiedCount;
  }

  async decrementMainStock(productId: Types.ObjectId, quantity: number) {
    const result = await this.model.updateOne(
      { _id: productId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity, totalSold: quantity } },
    );
    return result.modifiedCount;
  }

  async incrementTotalSold(productId: Types.ObjectId, quantity: number): Promise<void> {
    await this.model.updateOne(
      { _id: productId },
      { $inc: { totalSold: quantity } },
    ).exec();
  }

  async incrementViewCount(id: Types.ObjectId): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      { $inc: { viewCount: 1 } },
    ).exec();
  }

  async findLowStock(limit = 20): Promise<ProductDocument[]> {
    return this.model
      .aggregate([
        { $addFields: { totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] } } },
        {
          $match: {
            isActive: true,
            trackStock: true,
            $expr: { $lte: ['$totalStock', '$lowStockThreshold'] },
          },
        },
        { $sort: { totalStock: 1 } },
        { $limit: limit },
      ])
      .exec() as unknown as Promise<ProductDocument[]>;
  }

  async countLowStock(): Promise<number> {
    const result = await this.model
      .aggregate([
        { $addFields: { totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] } } },
        {
          $match: {
            isActive: true,
            trackStock: true,
            $expr: { $lte: ['$totalStock', '$lowStockThreshold'] },
          },
        },
        { $count: 'n' },
      ])
      .exec();
    return result[0]?.n ?? 0;
  }

  async searchByText(searchTerm: string, limit: number = 20): Promise<ProductDocument[]> {
    const textResults = await this.model
      .find({ isActive: true, $text: { $search: searchTerm } })
      .limit(limit)
      .exec();

    if (textResults.length > 0) return textResults;

    // Fallback: regex on name handles partial words (e.g. "bilon" → "Bilona Ghee A2")
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.model
      .find({ isActive: true, name: { $regex: escaped, $options: 'i' } })
      .limit(limit)
      .exec();
  }

  async deleteById(id: Types.ObjectId): Promise<number> {
    const result = await this.model.deleteOne({ _id: id }).exec();
    return result.deletedCount ?? 0;
  }
}
