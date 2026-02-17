import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';
import { PaginatedResult } from '@/common/types/pagination.types';
export declare class CategoriesService {
    private categoryModel;
    constructor(categoryModel: Model<CategoryDocument>);
    create(dto: CreateCategoryDto): Promise<Category>;
    findAll(query: CategoryQueryDto): Promise<PaginatedResult<Category>>;
    findById(id: string): Promise<Category>;
    findBySlug(slug: string): Promise<Category>;
    findActiveCategories(): Promise<Category[]>;
    findSubcategories(parentId: string): Promise<Category[]>;
    getCategoryTree(): Promise<Category[]>;
    update(id: string, dto: UpdateCategoryDto): Promise<Category>;
    delete(id: string): Promise<void>;
    private generateSlug;
}
