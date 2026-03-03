"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const products_service_1 = require("./products.service");
const products_controller_1 = require("./products.controller");
const product_schema_1 = require("./schemas/product.schema");
const product_repository_1 = require("./repositories/product.repository");
const store_stock_module_1 = require("../store-stock/store-stock.module");
const stores_module_1 = require("../stores/stores.module");
let ProductsModule = class ProductsModule {
};
exports.ProductsModule = ProductsModule;
exports.ProductsModule = ProductsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: product_schema_1.Product.name, schema: product_schema_1.ProductSchema }]),
            store_stock_module_1.StoreStockModule,
            (0, common_1.forwardRef)(() => stores_module_1.StoresModule),
        ],
        controllers: [products_controller_1.ProductsController],
        providers: [product_repository_1.ProductRepository, products_service_1.ProductsService],
        exports: [products_service_1.ProductsService, product_repository_1.ProductRepository],
    })
], ProductsModule);
//# sourceMappingURL=products.module.js.map