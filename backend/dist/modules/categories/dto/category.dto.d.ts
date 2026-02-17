export declare class CreateCategoryDto {
    name: string;
    slug?: string;
    description?: string;
    image?: string;
    parent?: string;
    sortOrder?: number;
    isActive?: boolean;
}
export declare class UpdateCategoryDto {
    name?: string;
    slug?: string;
    description?: string;
    image?: string;
    parent?: string;
    sortOrder?: number;
    isActive?: boolean;
}
export declare class CategoryQueryDto {
    page?: number;
    limit?: number;
    isActive?: boolean;
    parent?: string;
    rootOnly?: boolean;
}
