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
exports.AdminModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("@nestjs/mongoose");
const mongoose_3 = require("mongoose");
const admin_service_1 = require("./admin.service");
const admin_user_schema_1 = require("./schemas/admin-user.schema");
const admin_user_repository_1 = require("./repositories/admin-user.repository");
const admin_controller_1 = require("./admin.controller");
let AdminModule = class AdminModule {
    constructor(adminModel) {
        this.adminModel = adminModel;
    }
    async onModuleInit() {
        try {
            await this.adminModel.collection.dropIndex('phone_1');
        }
        catch {
        }
        await this.adminModel.syncIndexes();
    }
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: admin_user_schema_1.AdminUser.name, schema: admin_user_schema_1.AdminUserSchema }]),
        ],
        controllers: [admin_controller_1.AdminController],
        providers: [admin_user_repository_1.AdminUserRepository, admin_service_1.AdminService],
        exports: [admin_user_repository_1.AdminUserRepository, admin_service_1.AdminService],
    }),
    __param(0, (0, mongoose_2.InjectModel)(admin_user_schema_1.AdminUser.name)),
    __metadata("design:paramtypes", [mongoose_3.Model])
], AdminModule);
//# sourceMappingURL=admin.module.js.map