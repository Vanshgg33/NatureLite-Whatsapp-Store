import { ConfigService } from '@nestjs/config';
export interface UploadResult {
    publicId: string;
    url: string;
    secureUrl: string;
    format: string;
    width: number;
    height: number;
    bytes: number;
}
export interface TransformOptions {
    width?: number;
    height?: number;
    crop?: 'fill' | 'fit' | 'scale' | 'thumb';
    quality?: number | 'auto';
    format?: 'auto' | 'webp' | 'jpg' | 'png';
}
export declare class MediaService {
    private readonly logger;
    constructor(configService: ConfigService);
    uploadImage(file: Express.Multer.File, folder?: string): Promise<UploadResult>;
    uploadFromUrl(url: string, folder?: string): Promise<UploadResult>;
    uploadMultiple(files: Express.Multer.File[], folder?: string): Promise<UploadResult[]>;
    deleteImage(publicId: string): Promise<boolean>;
    deleteMultiple(publicIds: string[]): Promise<{
        deleted: string[];
        failed: string[];
    }>;
    getTransformedUrl(publicId: string, options?: TransformOptions): string;
    getThumbnailUrl(publicId: string, size?: number): string;
    getOptimizedUrl(publicId: string, maxWidth?: number): string;
}
