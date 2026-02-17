import { Model } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { CreateProductDto, UpdateProductDto, ProductQueryDto, UpdateStockDto } from './dto/product.dto';
import { PaginatedResult } from '@/common/types/pagination.types';
export declare class ProductsService {
    private productModel;
    constructor(productModel: Model<ProductDocument>);
    create(dto: CreateProductDto): Promise<Product>;
    findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>>;
    findById(id: string): Promise<Product>;
    findBySlug(slug: string): Promise<Product>;
    findBySku(sku: string): Promise<Product>;
    findByCategory(categoryId: string): Promise<Product[]>;
    findFeatured(limit?: number): Promise<Product[]>;
    update(id: string, dto: UpdateProductDto): Promise<Product>;
    updateStock(id: string, dto: UpdateStockDto): Promise<Product>;
    decrementStock(productId: string, quantity: number, variantSku?: string): Promise<void>;
    incrementViewCount(id: string): Promise<void>;
    getLowStockProducts(): Promise<Product[]>;
    searchProducts(searchTerm: string, limit?: number): Promise<Product[]>;
    delete(id: string): Promise<void>;
    private generateSlug;
}
