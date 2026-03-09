import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';
import { Category } from './schemas/category.schema';
import { PaginatedResult } from '../../common/types/pagination.types';
export declare class CategoriesController {
    private readonly categoriesService;
    constructor(categoriesService: CategoriesService);
    create(dto: CreateCategoryDto): Promise<Category>;
    findAll(query: CategoryQueryDto): Promise<PaginatedResult<Category>>;
    getCategoryTree(): Promise<Category[]>;
    findActiveCategories(): Promise<Category[]>;
    findBySlug(slug: string): Promise<Category>;
    findSubcategories(id: string): Promise<Category[]>;
    findOne(id: string): Promise<Category>;
    update(id: string, dto: UpdateCategoryDto): Promise<Category>;
    delete(id: string): Promise<{
        message: string;
    }>;
}
