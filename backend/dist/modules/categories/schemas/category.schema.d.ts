import { Document, Types } from 'mongoose';
export type CategoryDocument = Category & Document;
export declare class Category {
    _id: Types.ObjectId;
    name: string;
    slug: string;
    description?: string;
    image?: string;
    parent?: Types.ObjectId;
    sortOrder: number;
    isActive: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const CategorySchema: import("mongoose").Schema<Category, import("mongoose").Model<Category, any, any, any, Document<unknown, any, Category, any, {}> & Category & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Category, Document<unknown, {}, import("mongoose").FlatRecord<Category>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Category> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
