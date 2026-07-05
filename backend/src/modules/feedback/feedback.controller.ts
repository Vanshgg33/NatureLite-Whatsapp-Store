import {
  Controller, Get, Post, Put, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { FeedbackService } from './feedback.service';
import { MediaService } from '../media/media.service';
import {
  CreateFeedbackDto,
  AdminCreateReviewDto,
  RespondToFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto/feedback.dto';

@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly mediaService: MediaService,
  ) {}

  @Post('upload-media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadReviewMedia(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('No file provided');
    const isVideo = file.mimetype.startsWith('video/');
    const result = isVideo
      ? await this.mediaService.uploadVideoStream(file, 'reviews')
      : await this.mediaService.uploadImage(file, 'reviews');
    return { url: result.secureUrl };
  }

  @Post('admin-create')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async adminCreate(@Body() dto: AdminCreateReviewDto) {
    return this.feedbackService.adminCreate(dto);
  }

  @Post()
  async create(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.feedbackService.create(user.sub, dto);
  }

  @Get('my')
  async getMyFeedback(@CurrentUser() user: JwtPayload) {
    return this.feedbackService.findUserFeedback(user.sub);
  }

  @Public()
  @Get('product/:productId')
  async getProductReviews(@Param('productId') productId: string) {
    return this.feedbackService.getPublicReviews(productId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async findAll(@Query() query: FeedbackQueryDto) {
    return this.feedbackService.findAll(query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async findById(@Param('id') id: string) {
    return this.feedbackService.findById(id);
  }

  @Put(':id/respond')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async respond(
    @Param('id') id: string,
    @Body() dto: RespondToFeedbackDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.feedbackService.respond(id, dto, user.sub);
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    return this.feedbackService.updateStatus(id, dto);
  }
}
