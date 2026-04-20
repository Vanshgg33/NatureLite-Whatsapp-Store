import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { MetaCatalogService } from './meta-catalog.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Admin-only visibility into the Meta Commerce catalog sync. Kept minimal:
 *   GET  /meta-catalog/health  — token + catalog id smoke test
 *   GET  /meta-catalog/status  — retry-queue depth + readiness flag
 *   POST /meta-catalog/flush   — drain the retry queue on demand
 */
@Controller('meta-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetaCatalogController {
  constructor(private readonly metaCatalog: MetaCatalogService) {}

  @Get('health')
  @Roles('admin', 'superadmin')
  async health(): Promise<{
    ready: boolean;
    catalog: { id: string; name: string; product_count: number } | null;
    retryQueueSize: number;
  }> {
    const info = await this.metaCatalog.getCatalogInfo();
    return {
      ready: this.metaCatalog.isReady(),
      catalog: info,
      retryQueueSize: this.metaCatalog.getRetryQueueSize(),
    };
  }

  @Get('status')
  @Roles('admin', 'superadmin')
  status(): { ready: boolean; retryQueueSize: number } {
    return {
      ready: this.metaCatalog.isReady(),
      retryQueueSize: this.metaCatalog.getRetryQueueSize(),
    };
  }

  @Post('flush')
  @Roles('admin', 'superadmin')
  async flush(): Promise<{ flushed: true }> {
    await this.metaCatalog.flushRetryQueue();
    return { flushed: true };
  }
}
