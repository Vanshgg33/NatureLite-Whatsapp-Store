"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginate = paginate;
function paginate(items, total, options) {
    const totalPages = Math.ceil(total / options.limit);
    return {
        items,
        total,
        page: options.page,
        limit: options.limit,
        totalPages,
        hasNext: options.page < totalPages,
        hasPrevious: options.page > 1,
    };
}
//# sourceMappingURL=pagination.types.js.map