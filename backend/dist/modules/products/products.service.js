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
var ProductsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const objectid_util_1 = require("../../common/utils/objectid.util");
const store_stock_service_1 = require("../store-stock/store-stock.service");
const stores_service_1 = require("../stores/stores.service");
const product_repository_1 = require("./repositories/product.repository");
let ProductsService = ProductsService_1 = class ProductsService {
    constructor(productRepository, storeStockService, storesService) {
        this.productRepository = productRepository;
        this.storeStockService = storeStockService;
        this.storesService = storesService;
        this.logger = new common_1.Logger(ProductsService_1.name);
    }
    async onModuleInit() {
        await this.backfillStoreStock();
    }
    async backfillStoreStock() {
        const stores = await this.storesService.findAll();
        if (stores.length === 0)
            return;
        const storeIds = stores.map((s) => s._id.toString());
        const products = await this.productRepository.findIdsAndStock();
        for (const product of products) {
            await this.storeStockService.initializeStockForProduct(product._id.toString(), storeIds);
        }
        if (products.length > 0) {
            this.logger.log(`Backfilled StoreStock for ${products.length} product(s) across ${stores.length} store(s)`);
        }
    }
    async create(dto) {
        const categoryId = (0, objectid_util_1.parseObjectId)(dto.category, 'category');
        const slug = dto.slug || this.generateSlug(dto.name);
        const existingSku = await this.productRepository.findOneBySku(dto.sku);
        if (existingSku) {
            throw new common_1.BadRequestException('Product with this SKU already exists');
        }
        const existingSlug = await this.productRepository.findOneBySlug(slug);
        if (existingSlug) {
            throw new common_1.BadRequestException('Product with this slug already exists');
        }
        const saved = await this.productRepository.create({
            ...dto,
            slug,
            category: categoryId,
        });
        try {
            const stores = await this.storesService.findAll();
            const storeIds = stores.map((s) => s._id.toString());
            if (storeIds.length > 0) {
                await this.storeStockService.initializeStockForProduct(saved._id.toString(), storeIds);
                this.logger.log(`Initialized StoreStock for product ${saved.name} across ${storeIds.length} store(s)`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to initialize StoreStock for product ${saved.name}: ${error.message}`);
        }
        return saved;
    }
    async findAll(query) {
        return this.productRepository.findAllPaginated(query);
    }
    async findById(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const product = await this.productRepository.findByIdWithCategory(idObj);
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        const catId = product.category?.toString?.() ?? product.category;
        if ((0, objectid_util_1.isValidObjectIdString)(catId)) {
            await product.populate('category', 'name slug');
        }
        return product;
    }
    async findBySlug(slug) {
        const product = await this.productRepository.findOneBySlugWithCategory(slug);
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        const catId = product.category?.toString?.() ?? product.category;
        if ((0, objectid_util_1.isValidObjectIdString)(catId)) {
            await product.populate('category', 'name slug');
        }
        return product;
    }
    async findBySku(sku) {
        const product = await this.productRepository.findOneBySkuWithCategory(sku);
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        const catId = product.category?.toString?.() ?? product.category;
        if ((0, objectid_util_1.isValidObjectIdString)(catId)) {
            await product.populate('category', 'name slug');
        }
        return product;
    }
    async findByCategory(categoryId) {
        if (!(0, objectid_util_1.isValidObjectIdString)(categoryId)) {
            return [];
        }
        return this.productRepository.findByCategoryId((0, objectid_util_1.parseObjectId)(categoryId, 'categoryId'));
    }
    async findFeatured(limit = 10) {
        return this.productRepository.findFeatured(limit);
    }
    async update(id, dto) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        if (dto.sku) {
            const existingSku = await this.productRepository.findOneBySkuExcludingId(dto.sku, idObj);
            if (existingSku) {
                throw new common_1.BadRequestException('Product with this SKU already exists');
            }
        }
        if (dto.slug) {
            const existingSlug = await this.productRepository.findOneBySlugExcludingId(dto.slug, idObj);
            if (existingSlug) {
                throw new common_1.BadRequestException('Product with this slug already exists');
            }
        }
        const updateData = { ...dto };
        if (dto.category !== undefined) {
            updateData.category = (0, objectid_util_1.parseObjectId)(dto.category, 'category');
        }
        const product = await this.productRepository.findByIdAndUpdateDoc(id, updateData);
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    async updateStock(id, dto) {
        const product = await this.productRepository.findByIdString(id);
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
        const productObjId = (0, objectid_util_1.parseObjectId)(productId, 'productId');
        if (variantSku) {
            const modified = await this.productRepository.decrementVariantStock(productObjId, variantSku, quantity);
            if (modified === 0) {
                throw new common_1.BadRequestException(`Insufficient stock for variant ${variantSku}`);
            }
        }
        else {
            const modified = await this.productRepository.decrementMainStock(productObjId, quantity);
            if (modified === 0) {
                throw new common_1.BadRequestException('Insufficient stock for this product');
            }
        }
    }
    async incrementTotalSold(productId, quantity) {
        await this.productRepository.incrementTotalSold((0, objectid_util_1.parseObjectId)(productId, 'productId'), quantity);
    }
    async incrementViewCount(id) {
        await this.productRepository.incrementViewCount((0, objectid_util_1.parseObjectId)(id, 'id'));
    }
    async getLowStockProducts() {
        return this.productRepository.findLowStock();
    }
    async searchProducts(searchTerm, limit = 20) {
        return this.productRepository.searchByText(searchTerm, limit);
    }
    async delete(id) {
        const deleted = await this.productRepository.deleteById((0, objectid_util_1.parseObjectId)(id, 'id'));
        if (deleted === 0) {
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
exports.ProductsService = ProductsService = ProductsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [product_repository_1.ProductRepository,
        store_stock_service_1.StoreStockService,
        stores_service_1.StoresService])
], ProductsService);
//# sourceMappingURL=products.service.js.map