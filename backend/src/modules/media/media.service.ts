import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as FormDataNode from 'form-data';
import axios from 'axios';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { CloudinaryConfig } from '../../config/configuration';

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

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(configService: ConfigService) {
    const config = configService.get<CloudinaryConfig>('cloudinary')!;
    this.cloudName = config.cloudName;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;

    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
    });
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'products',
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            transformation: [
              { width: 1200, height: 1200, crop: 'limit' },
              { quality: 'auto' },
              { fetch_format: 'auto' },
            ],
          },
          (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
            if (error) {
              this.logger.error('Upload failed', error);
              reject(new BadRequestException('Failed to upload image'));
              return;
            }

            if (!result) {
              reject(new BadRequestException('No upload result received'));
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
          },
        )
        .end(file.buffer);
    });
  }

  async uploadFromUrl(
    url: string,
    folder: string = 'products',
  ): Promise<UploadResult> {
    try {
      const result = await cloudinary.uploader.upload(url, {
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
    } catch (error) {
      this.logger.error('Failed to upload from URL', error);
      throw new BadRequestException('Failed to upload image from URL');
    }
  }

  // Fetches the image ourselves (as a buffer) then uploads to Cloudinary.
  // Use this instead of uploadFromUrl when the source is a Facebook/Instagram CDN
  // URL — Cloudinary's remote-fetch can be blocked by those CDNs, whereas a
  // plain axios GET from our server usually succeeds.
  async uploadFromUrlViaBuffer(url: string, folder: string = 'products'): Promise<UploadResult> {
    let buffer: Buffer;
    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StoreMediaFetcher/1.0)' },
      });
      buffer = Buffer.from(response.data);
    } catch (err) {
      throw new BadRequestException(`Failed to fetch image from URL: ${err instanceof Error ? err.message : String(err)}`);
    }

    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            resource_type: 'image',
            transformation: [
              { width: 1200, height: 1200, crop: 'limit' },
              { quality: 'auto' },
              { fetch_format: 'auto' },
            ],
          },
          (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
            if (error || !result) {
              reject(new BadRequestException('Failed to upload image to Cloudinary'));
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
          },
        )
        .end(buffer);
    });
  }

  async uploadVideo(
    file: Express.Multer.File,
    folder: string = 'banners',
  ): Promise<UploadResult> {
    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + this.apiSecret)
      .digest('hex');

    const form = new FormDataNode();
    form.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);

    try {
      const response = await axios.post<{
        public_id: string; url: string; secure_url: string;
        format: string; width: number; height: number; bytes: number;
      }>(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/raw/upload`,
        form,
        { headers: form.getHeaders(), maxBodyLength: Infinity, maxContentLength: Infinity },
      );
      return {
        publicId: response.data.public_id,
        url: response.data.url,
        secureUrl: response.data.secure_url,
        format: response.data.format,
        width: response.data.width || 0,
        height: response.data.height || 0,
        bytes: response.data.bytes,
      };
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      this.logger.error('Video upload failed', msg || err);
      throw new BadRequestException(msg || 'Failed to upload video');
    }
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    folder: string = 'products',
  ): Promise<UploadResult[]> {
    const uploads = files.map((file) => this.uploadImage(file, folder));
    return Promise.all(uploads);
  }

  async deleteImage(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      this.logger.error('Failed to delete image', error);
      return false;
    }
  }

  async deleteMultiple(publicIds: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];

    for (const publicId of publicIds) {
      const success = await this.deleteImage(publicId);
      if (success) {
        deleted.push(publicId);
      } else {
        failed.push(publicId);
      }
    }

    return { deleted, failed };
  }

  getTransformedUrl(publicId: string, options: TransformOptions = {}): string {
    const transformations: string[] = [];

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

    return cloudinary.url(publicId, {
      secure: true,
      transformation: transformation || undefined,
    });
  }

  getThumbnailUrl(publicId: string, size: number = 150): string {
    return this.getTransformedUrl(publicId, {
      width: size,
      height: size,
      crop: 'thumb',
      quality: 'auto',
      format: 'auto',
    });
  }

  getOptimizedUrl(publicId: string, maxWidth: number = 800): string {
    return this.getTransformedUrl(publicId, {
      width: maxWidth,
      crop: 'scale',
      quality: 'auto',
      format: 'auto',
    });
  }
}
