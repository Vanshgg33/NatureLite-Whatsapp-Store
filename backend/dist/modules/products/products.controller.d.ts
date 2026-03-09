import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, ProductQueryDto, UpdateStockDto } from './dto/product.dto';
import { Product } from './schemas/product.schema';
import { PaginatedResult } from '../../common/types/pagination.types';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    create(dto: CreateProductDto): Promise<Product>;
    findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>>;
    findFeatured(limit?: string): Promise<Product[]>;
    getLowStockProducts(): Promise<Product[]>;
    searchProducts(searchTerm: string, limit?: string): Promise<Product[]>;
    findByCategory(categoryId: string): Promise<Product[]>;
    findBySlug(slug: string): Promise<Product>;
    findBySku(sku: string): Promise<Product>;
    findOne(id: string): Promise<Product>;
    update(id: string, dto: UpdateProductDto): Promise<Product>;
    updateStock(id: string, dto: UpdateStockDto): Promise<Product>;
    delete(id: string): Promise<{
        message: string;
    }>;
}
