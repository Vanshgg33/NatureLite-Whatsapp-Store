import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  UpdateStockDto,
} from './dto/product.dto';
import { PaginatedResult, paginate } from '@/common/types/pagination.types';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = dto.slug || this.generateSlug(dto.name);

    const existingSku = await this.productModel.findOne({ sku: dto.sku });
    if (existingSku) {
      throw new BadRequestException('Product with this SKU already exists');
    }

    const existingSlug = await this.productModel.findOne({ slug });
    if (existingSlug) {
      throw new BadRequestException('Product with this slug already exists');
    }

    const product = new this.productModel({
      ...dto,
      slug,
      category: new Types.ObjectId(dto.category),
    });

    return product.save();
  }

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>> {
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

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) {
      filter.category = new Types.ObjectId(category);
    }

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    if (isFeatured !== undefined) {
      filter.isFeatured = isFeatured;
    }

    if (inStock !== undefined) {
      if (inStock) {
        filter.stock = { $gt: 0 };
      } else {
        filter.stock = { $lte: 0 };
      }
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) {
        (filter.price as Record<string, number>).$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        (filter.price as Record<string, number>).$lte = maxPrice;
      }
    }

    if (tags && tags.length > 0) {
      filter.tags = { $in: tags };
    }

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [products, total] = await Promise.all([
      this.productModel
        .find(filter)
        .populate('category', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments(filter),
    ]);

    return paginate(products, total, { page, limit });
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productModel
      .findById(id)
      .populate('category', 'name slug');

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productModel
      .findOne({ slug })
      .populate('category', 'name slug');

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async findBySku(sku: string): Promise<Product> {
    const product = await this.productModel
      .findOne({ sku })
      .populate('category', 'name slug');

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async findByCategory(categoryId: string): Promise<Product[]> {
    return this.productModel
      .find({ category: new Types.ObjectId(categoryId), isActive: true })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findFeatured(limit: number = 10): Promise<Product[]> {
    return this.productModel
      .find({ isActive: true, isFeatured: true })
      .populate('category', 'name slug')
      .limit(limit)
      .exec();
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    if (dto.sku) {
      const existingSku = await this.productModel.findOne({
        sku: dto.sku,
        _id: { $ne: new Types.ObjectId(id) },
      });

      if (existingSku) {
        throw new BadRequestException('Product with this SKU already exists');
      }
    }

    if (dto.slug) {
      const existingSlug = await this.productModel.findOne({
        slug: dto.slug,
        _id: { $ne: new Types.ObjectId(id) },
      });

      if (existingSlug) {
        throw new BadRequestException('Product with this slug already exists');
      }
    }

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.category) {
      updateData.category = new Types.ObjectId(dto.category);
    }

    const product = await this.productModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true },
    );

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async updateStock(id: string, dto: UpdateStockDto): Promise<Product> {
    const product = await this.productModel.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.variantSku) {
      const variantIndex = product.variants.findIndex(
        (v) => v.sku === dto.variantSku,
      );

      if (variantIndex === -1) {
        throw new BadRequestException('Variant not found');
      }

      product.variants[variantIndex].stock = dto.stock;
    } else {
      product.stock = dto.stock;
    }

    return product.save();
  }

  async decrementStock(
    productId: string,
    quantity: number,
    variantSku?: string,
  ): Promise<void> {
    if (variantSku) {
      // Atomic decrement for variant stock - only succeeds if sufficient stock
      const result = await this.productModel.updateOne(
        {
          _id: new Types.ObjectId(productId),
          'variants.sku': variantSku,
          'variants.stock': { $gte: quantity },
        },
        {
          $inc: {
            'variants.$.stock': -quantity,
            totalSold: quantity,
          },
        },
      );

      if (result.modifiedCount === 0) {
        throw new BadRequestException(
          `Insufficient stock for variant ${variantSku}`,
        );
      }
    } else {
      // Atomic decrement for main stock - only succeeds if sufficient stock
      const result = await this.productModel.updateOne(
        {
          _id: new Types.ObjectId(productId),
          stock: { $gte: quantity },
        },
        {
          $inc: {
            stock: -quantity,
            totalSold: quantity,
          },
        },
      );

      if (result.modifiedCount === 0) {
        throw new BadRequestException(
          'Insufficient stock for this product',
        );
      }
    }
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.productModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { viewCount: 1 } },
    );
  }

  async getLowStockProducts(): Promise<Product[]> {
    return this.productModel
      .find({
        isActive: true,
        trackStock: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      })
      .exec();
  }

  async searchProducts(searchTerm: string, limit: number = 20): Promise<Product[]> {
    return this.productModel
      .find({
        isActive: true,
        $text: { $search: searchTerm },
      })
      .limit(limit)
      .exec();
  }

  async delete(id: string): Promise<void> {
    const result = await this.productModel.deleteOne({
      _id: new Types.ObjectId(id),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Product not found');
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
