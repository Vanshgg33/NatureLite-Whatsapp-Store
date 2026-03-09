import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { MediaService, UploadResult } from './media.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.mediaService.uploadImage(file, folder || 'products');
  }

  @Post('upload/multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('folder') folder?: string,
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    return this.mediaService.uploadMultiple(files, folder || 'products');
  }

  @Post('upload/url')
  async uploadFromUrl(
    @Body('url') url: string,
    @Body('folder') folder?: string,
  ): Promise<UploadResult> {
    if (!url) {
      throw new BadRequestException('No URL provided');
    }

    return this.mediaService.uploadFromUrl(url, folder || 'products');
  }

  @Delete(':publicId')
  async deleteImage(
    @Param('publicId') publicId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.mediaService.deleteImage(publicId);
    return { success };
  }

  @Post('delete/multiple')
  async deleteMultiple(
    @Body('publicIds') publicIds: string[],
  ): Promise<{ deleted: string[]; failed: string[] }> {
    return this.mediaService.deleteMultiple(publicIds);
  }
}
