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
var MediaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const cloudinary_1 = require("cloudinary");
let MediaService = MediaService_1 = class MediaService {
    constructor(configService) {
        this.logger = new common_1.Logger(MediaService_1.name);
        const config = configService.get('cloudinary');
        cloudinary_1.v2.config({
            cloud_name: config.cloudName,
            api_key: config.apiKey,
            api_secret: config.apiSecret,
        });
    }
    async uploadImage(file, folder = 'products') {
        return new Promise((resolve, reject) => {
            cloudinary_1.v2.uploader
                .upload_stream({
                folder,
                resource_type: 'image',
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                transformation: [
                    { width: 1200, height: 1200, crop: 'limit' },
                    { quality: 'auto' },
                    { fetch_format: 'auto' },
                ],
            }, (error, result) => {
                if (error) {
                    this.logger.error('Upload failed', error);
                    reject(new common_1.BadRequestException('Failed to upload image'));
                    return;
                }
                if (!result) {
                    reject(new common_1.BadRequestException('No upload result received'));
                    return;
                }
                resolve({
                    publicId: result.public_id,
                    url: result.url,
                    secureUrl: result.secure_url,
                    format: result.format,
                    width: result.width,
                    height: result.height,
                    bytes: result.bytes,
                });
            })
                .end(file.buffer);
        });
    }
    async uploadFromUrl(url, folder = 'products') {
        try {
            const result = await cloudinary_1.v2.uploader.upload(url, {
                folder,
                resource_type: 'image',
                transformation: [
                    { width: 1200, height: 1200, crop: 'limit' },
                    { quality: 'auto' },
                    { fetch_format: 'auto' },
                ],
            });
            return {
                publicId: result.public_id,
                url: result.url,
                secureUrl: result.secure_url,
                format: result.format,
                width: result.width,
                height: result.height,
                bytes: result.bytes,
            };
        }
        catch (error) {
            this.logger.error('Failed to upload from URL', error);
            throw new common_1.BadRequestException('Failed to upload image from URL');
        }
    }
    async uploadMultiple(files, folder = 'products') {
        const uploads = files.map((file) => this.uploadImage(file, folder));
        return Promise.all(uploads);
    }
    async deleteImage(publicId) {
        try {
            const result = await cloudinary_1.v2.uploader.destroy(publicId);
            return result.result === 'ok';
        }
        catch (error) {
            this.logger.error('Failed to delete image', error);
            return false;
        }
    }
    async deleteMultiple(publicIds) {
        const deleted = [];
        const failed = [];
        for (const publicId of publicIds) {
            const success = await this.deleteImage(publicId);
            if (success) {
                deleted.push(publicId);
            }
            else {
                failed.push(publicId);
            }
        }
        return { deleted, failed };
    }
    getTransformedUrl(publicId, options = {}) {
        const transformations = [];
        if (options.width) {
            transformations.push(`w_${options.width}`);
        }
        if (options.height) {
            transformations.push(`h_${options.height}`);
        }
        if (options.crop) {
            transformations.push(`c_${options.crop}`);
        }
        if (options.quality) {
            transformations.push(`q_${options.quality}`);
        }
        if (options.format) {
            transformations.push(`f_${options.format}`);
        }
        const transformation = transformations.length > 0 ? transformations.join(',') + '/' : '';
        return cloudinary_1.v2.url(publicId, {
            secure: true,
            transformation: transformation || undefined,
        });
    }
    getThumbnailUrl(publicId, size = 150) {
        return this.getTransformedUrl(publicId, {
            width: size,
            height: size,
            crop: 'thumb',
            quality: 'auto',
            format: 'auto',
        });
    }
    getOptimizedUrl(publicId, maxWidth = 800) {
        return this.getTransformedUrl(publicId, {
            width: maxWidth,
            crop: 'scale',
            quality: 'auto',
            format: 'auto',
        });
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = MediaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MediaService);
//# sourceMappingURL=media.service.js.map