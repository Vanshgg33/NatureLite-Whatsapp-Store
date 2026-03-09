import { Category } from './schemas/category.schema';
import { CategoryRepository } from './repositories/category.repository';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
export declare class CategoriesService {
    private readonly categoryRepository;
    constructor(categoryRepository: CategoryRepository);
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
