export interface JwtPayload {
    sub: string;
    phone: string;
    role: 'customer' | 'admin' | 'superadmin';
    iat?: number;
    exp?: number;
}
export declare const CurrentUser: (...dataOrPipes: (keyof JwtPayload | import("@nestjs/common").PipeTransform<any, any> | import("@nestjs/common").Type<import("@nestjs/common").PipeTransform<any, any>>)[]) => ParameterDecorator;
