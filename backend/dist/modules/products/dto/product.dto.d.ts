export declare class ProductVariantDto {
    name: string;
    sku: string;
    price: number;
    compareAtPrice?: number;
    stock?: number;
    attributes?: Record<string, string>;
    isActive?: boolean;
}
export declare class ProductDimensionsDto {
    length: number;
    width: number;
    height: number;
}
export declare class CreateProductDto {
    name: string;
    slug?: string;
    description?: string;
    shortDescription?: string;
    category: string;
    images?: string[];
    price: number;
    compareAtPrice?: number;
    sku: string;
    stock?: number;
    trackStock?: boolean;
    lowStockThreshold?: number;
    variants?: ProductVariantDto[];
    isActive?: boolean;
    isFeatured?: boolean;
    tags?: string[];
    weight?: number;
    dimensions?: ProductDimensionsDto;
    gstPercentage?: number;
    hsnCode?: string;
}
export declare class UpdateProductDto {
    name?: string;
    slug?: string;
    description?: string;
    shortDescription?: string;
    category?: string;
    images?: string[];
    price?: number;
    compareAtPrice?: number;
    sku?: string;
    stock?: number;
    trackStock?: boolean;
    lowStockThreshold?: number;
    variants?: ProductVariantDto[];
    isActive?: boolean;
    isFeatured?: boolean;
    tags?: string[];
    weight?: number;
    dimensions?: ProductDimensionsDto;
    gstPercentage?: number;
    hsnCode?: string;
}
export declare class ProductQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    isActive?: boolean;
    isFeatured?: boolean;
    inStock?: boolean;
    minPrice?: number;
    maxPrice?: number;
    tags?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export declare class UpdateStockDto {
    stock: number;
    variantSku?: string;
}
