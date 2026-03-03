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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const category_repository_1 = require("./repositories/category.repository");
const objectid_util_1 = require("../../common/utils/objectid.util");
let CategoriesService = class CategoriesService {
    constructor(categoryRepository) {
        this.categoryRepository = categoryRepository;
    }
    async create(dto) {
        const slug = dto.slug || this.generateSlug(dto.name);
        const existing = await this.categoryRepository.findOneBySlug(slug);
        if (existing) {
            throw new common_1.BadRequestException('Category with this slug already exists');
        }
        const parentId = (0, objectid_util_1.parseObjectIdOptional)(dto.parent, 'parent');
        return this.categoryRepository.createOne(dto, slug, parentId);
    }
    async findAll(query) {
        return this.categoryRepository.findAllPaginated(query);
    }
    async findById(id) {
        const category = await this.categoryRepository.findByIdString(id);
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return category;
    }
    async findBySlug(slug) {
        const category = await this.categoryRepository.findOneBySlug(slug);
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return category;
    }
    async findActiveCategories() {
        return this.categoryRepository.findActiveSorted();
    }
    async findSubcategories(parentId) {
        if (!(0, objectid_util_1.isValidObjectIdString)(parentId))
            return [];
        return this.categoryRepository.findSubcategoriesByParentId((0, objectid_util_1.parseObjectId)(parentId, 'parentId'));
    }
    async getCategoryTree() {
        const allCategories = await this.categoryRepository.findActiveLean();
        const categoryMap = new Map();
        const rootCategories = [];
        allCategories.forEach((cat) => {
            categoryMap.set(cat._id.toString(), { ...cat, children: [] });
        });
        allCategories.forEach((cat) => {
            const category = categoryMap.get(cat._id.toString());
            if (category) {
                if (cat.parent) {
                    const parent = categoryMap.get(cat.parent.toString());
                    if (parent && parent.children) {
                        parent.children.push(category);
                    }
                }
                else {
                    rootCategories.push(category);
                }
            }
        });
        return rootCategories;
    }
    async update(id, dto) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        if (dto.slug) {
            const existing = await this.categoryRepository.findOneBySlugExcludingId(dto.slug, idObj);
            if (existing) {
                throw new common_1.BadRequestException('Category with this slug already exists');
            }
        }
        const updateData = { ...dto };
        if (dto.parent !== undefined && dto.parent !== null && dto.parent !== '') {
            updateData.parent = (0, objectid_util_1.parseObjectId)(dto.parent, 'parent');
        }
        const category = await this.categoryRepository.findByIdAndUpdateDoc(idObj, updateData);
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return category;
    }
    async delete(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const hasSubcategories = await this.categoryRepository.existsByParentId(idObj);
        if (hasSubcategories) {
            throw new common_1.BadRequestException('Cannot delete category with subcategories. Delete subcategories first.');
        }
        const result = await this.categoryRepository.deleteOne({ _id: idObj });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('Category not found');
        }
    }
    generateSlug(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [category_repository_1.CategoryRepository])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map