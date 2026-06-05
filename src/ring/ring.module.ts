import { Module } from '@nestjs/common';
import { RingService } from './ring.service';

@Module({
  providers: [RingService],
  exports: [RingService],
})
export class RingModule {}
