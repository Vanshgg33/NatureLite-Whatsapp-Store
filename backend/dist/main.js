"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const helmet_1 = require("helmet");
const cookie_parser_1 = require("cookie-parser");
const express_mongo_sanitize_1 = require("express-mongo-sanitize");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        rawBody: true,
    });
    const configService = app.get(config_1.ConfigService);
    app.use((0, helmet_1.default)());
    app.use((0, cookie_parser_1.default)());
    app.use((0, express_mongo_sanitize_1.default)());
    const configuredOrigin = configService.get('frontendUrl');
    const allowedOrigin = configuredOrigin && configuredOrigin.length > 0
        ? configuredOrigin
        : undefined;
    app.use((req, res, next) => {
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const origin = req.headers.origin || req.headers.referer;
            if (allowedOrigin && origin && !origin.startsWith(allowedOrigin)) {
                return res.status(403).json({ message: 'CSRF validation failed' });
            }
        }
        next();
    });
    app.enableCors({
        origin: allowedOrigin || true,
        credentials: true,
    });
    app.setGlobalPrefix(configService.get('app.apiPrefix') || 'api/v1');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    const port = configService.get('app.port') || 3000;
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
    console.log(`API Prefix: ${configService.get('app.apiPrefix')}`);
}
bootstrap();
//# sourceMappingURL=main.js.map