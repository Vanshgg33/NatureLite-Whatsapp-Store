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
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const category_schema_1 = require("./schemas/category.schema");
const pagination_types_1 = require("../../common/types/pagination.types");
let CategoriesService = class CategoriesService {
    constructor(categoryModel) {
        this.categoryModel = categoryModel;
    }
    async create(dto) {
        const slug = dto.slug || this.generateSlug(dto.name);
        const existingCategory = await this.categoryModel.findOne({ slug });
        if (existingCategory) {
            throw new common_1.BadRequestException('Category with this slug already exists');
        }
        const category = new this.categoryModel({
            ...dto,
            slug,
            parent: dto.parent ? new mongoose_2.Types.ObjectId(dto.parent) : undefined,
        });
        return category.save();
    }
    async findAll(query) {
        const { page = 1, limit = 50, isActive, parent, rootOnly } = query;
        const filter = {};
        if (isActive !== undefined) {
            filter.isActive = isActive;
        }
        if (rootOnly) {
            filter.parent = { $exists: false };
        }
        else if (parent) {
            filter.parent = new mongoose_2.Types.ObjectId(parent);
        }
        const skip = (page - 1) * limit;
        const [categories, total] = await Promise.all([
            this.categoryModel
                .find(filter)
                .sort({ sortOrder: 1, name: 1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.categoryModel.countDocuments(filter),
        ]);
        return (0, pagination_types_1.paginate)(categories, total, { page, limit });
    }
    async findById(id) {
        const category = await this.categoryModel.findById(id);
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return category;
    }
    async findBySlug(slug) {
        const category = await this.categoryModel.findOne({ slug });
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return category;
    }
    async findActiveCategories() {
        return this.categoryModel
            .find({ isActive: true })
            .sort({ sortOrder: 1, name: 1 })
            .exec();
    }
    async findSubcategories(parentId) {
        return this.categoryModel
            .find({ parent: new mongoose_2.Types.ObjectId(parentId), isActive: true })
            .sort({ sortOrder: 1, name: 1 })
            .exec();
    }
    async getCategoryTree() {
        const allCategories = await this.categoryModel
            .find({ isActive: true })
            .sort({ sortOrder: 1, name: 1 })
            .lean()
            .exec();
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
        if (dto.slug) {
            const existingCategory = await this.categoryModel.findOne({
                slug: dto.slug,
                _id: { $ne: new mongoose_2.Types.ObjectId(id) },
            });
            if (existingCategory) {
                throw new common_1.BadRequestException('Category with this slug already exists');
            }
        }
        const updateData = { ...dto };
        if (dto.parent) {
            updateData.parent = new mongoose_2.Types.ObjectId(dto.parent);
        }
        const category = await this.categoryModel.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return category;
    }
    async delete(id) {
        const hasSubcategories = await this.categoryModel.exists({
            parent: new mongoose_2.Types.ObjectId(id),
        });
        if (hasSubcategories) {
            throw new common_1.BadRequestException('Cannot delete category with subcategories. Delete subcategories first.');
        }
        const result = await this.categoryModel.deleteOne({
            _id: new mongoose_2.Types.ObjectId(id),
        });
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
    __param(0, (0, mongoose_1.InjectModel)(category_schema_1.Category.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map