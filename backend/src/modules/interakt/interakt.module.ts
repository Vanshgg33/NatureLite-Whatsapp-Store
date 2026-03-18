import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InteraktService } from './interakt.service';

@Module({
  imports: [ConfigModule],
  providers: [InteraktService],
  exports: [InteraktService],
})
export class InteraktModule {}

