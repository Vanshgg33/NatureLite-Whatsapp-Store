"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const product_schema_1 = require("./schemas/product.schema");
const pagination_types_1 = require("../../common/types/pagination.types");
let ProductsService = class ProductsService {
    constructor(productModel) {
        this.productModel = productModel;
    }
    async create(dto) {
        const slug = dto.slug || this.generateSlug(dto.name);
        const existingSku = await this.productModel.findOne({ sku: dto.sku });
        if (existingSku) {
            throw new common_1.BadRequestException('Product with this SKU already exists');
        }
        const existingSlug = await this.productModel.findOne({ slug });
        if (existingSlug) {
            throw new common_1.BadRequestException('Product with this slug already exists');
        }
        const product = new this.productModel({
            ...dto,
            slug,
            category: new mongoose_2.Types.ObjectId(dto.category),
        });
        return product.save();
    }
    async findAll(query) {
        const { page = 1, limit = 20, search, category, isActive, isFeatured, inStock, minPrice, maxPrice, tags, sortBy = 'createdAt', sortOrder = 'desc', } = query;
        const filter = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } },
            ];
        }
        if (category) {
            filter.category = new mongoose_2.Types.ObjectId(category);
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
            }
            else {
                filter.stock = { $lte: 0 };
            }
        }
        if (minPrice !== undefined || maxPrice !== undefined) {
            filter.price = {};
            if (minPrice !== undefined) {
                filter.price.$gte = minPrice;
            }
            if (maxPrice !== undefined) {
                filter.price.$lte = maxPrice;
            }
        }
        if (tags && tags.length > 0) {
            filter.tags = { $in: tags };
        }
        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
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
        return (0, pagination_types_1.paginate)(products, total, { page, limit });
    }
    async findById(id) {
        const product = await this.productModel
            .findById(id)
            .populate('category', 'name slug');
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    async findBySlug(slug) {
        const product = await this.productModel
            .findOne({ slug })
            .populate('category', 'name slug');
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    async findBySku(sku) {
        const product = await this.productModel
            .findOne({ sku })
            .populate('category', 'name slug');
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    async findByCategory(categoryId) {
        return this.productModel
            .find({ category: new mongoose_2.Types.ObjectId(categoryId), isActive: true })
            .sort({ createdAt: -1 })
            .exec();
    }
    async findFeatured(limit = 10) {
        return this.productModel
            .find({ isActive: true, isFeatured: true })
            .populate('category', 'name slug')
            .limit(limit)
            .exec();
    }
    async update(id, dto) {
        if (dto.sku) {
            const existingSku = await this.productModel.findOne({
                sku: dto.sku,
                _id: { $ne: new mongoose_2.Types.ObjectId(id) },
            });
            if (existingSku) {
                throw new common_1.BadRequestException('Product with this SKU already exists');
            }
        }
        if (dto.slug) {
            const existingSlug = await this.productModel.findOne({
                slug: dto.slug,
                _id: { $ne: new mongoose_2.Types.ObjectId(id) },
            });
            if (existingSlug) {
                throw new common_1.BadRequestException('Product with this slug already exists');
            }
        }
        const updateData = { ...dto };
        if (dto.category) {
            updateData.category = new mongoose_2.Types.ObjectId(dto.category);
        }
        const product = await this.productModel.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    async updateStock(id, dto) {
        const product = await this.productModel.findById(id);
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        if (dto.variantSku) {
            const variantIndex = product.variants.findIndex((v) => v.sku === dto.variantSku);
            if (variantIndex === -1) {
                throw new common_1.BadRequestException('Variant not found');
            }
            product.variants[variantIndex].stock = dto.stock;
        }
        else {
            product.stock = dto.stock;
        }
        return product.save();
    }
    async decrementStock(productId, quantity, variantSku) {
        if (variantSku) {
            const result = await this.productModel.updateOne({
                _id: new mongoose_2.Types.ObjectId(productId),
                'variants.sku': variantSku,
                'variants.stock': { $gte: quantity },
            }, {
                $inc: {
                    'variants.$.stock': -quantity,
                    totalSold: quantity,
                },
            });
            if (result.modifiedCount === 0) {
                throw new common_1.BadRequestException(`Insufficient stock for variant ${variantSku}`);
            }
        }
        else {
            const result = await this.productModel.updateOne({
                _id: new mongoose_2.Types.ObjectId(productId),
                stock: { $gte: quantity },
            }, {
                $inc: {
                    stock: -quantity,
                    totalSold: quantity,
                },
            });
            if (result.modifiedCount === 0) {
                throw new common_1.BadRequestException('Insufficient stock for this product');
            }
        }
    }
    async incrementViewCount(id) {
        await this.productModel.updateOne({ _id: new mongoose_2.Types.ObjectId(id) }, { $inc: { viewCount: 1 } });
    }
    async getLowStockProducts() {
        return this.productModel
            .find({
            isActive: true,
            trackStock: true,
            $expr: { $lte: ['$stock', '$lowStockThreshold'] },
        })
            .exec();
    }
    async searchProducts(searchTerm, limit = 20) {
        return this.productModel
            .find({
            isActive: true,
            $text: { $search: searchTerm },
        })
            .limit(limit)
            .exec();
    }
    async delete(id) {
        const result = await this.productModel.deleteOne({
            _id: new mongoose_2.Types.ObjectId(id),
        });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('Product not found');
        }
    }
    generateSlug(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(product_schema_1.Product.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ProductsService);
//# sourceMappingURL=products.service.js.map