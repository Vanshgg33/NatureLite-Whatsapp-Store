import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { FeedbackService } from './feedback.service';
import {
  CreateFeedbackDto,
  RespondToFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto/feedback.dto';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

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
