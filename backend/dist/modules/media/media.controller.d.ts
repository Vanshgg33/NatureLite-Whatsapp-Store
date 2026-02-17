import { MediaService, UploadResult } from './media.service';
export declare class MediaController {
    private readonly mediaService;
    constructor(mediaService: MediaService);
    uploadImage(file: Express.Multer.File, folder?: string): Promise<UploadResult>;
    uploadMultiple(files: Express.Multer.File[], folder?: string): Promise<UploadResult[]>;
    uploadFromUrl(url: string, folder?: string): Promise<UploadResult>;
    deleteImage(publicId: string): Promise<{
        success: boolean;
    }>;
    deleteMultiple(publicIds: string[]): Promise<{
        deleted: string[];
        failed: string[];
    }>;
}
