import { Module } from '@nestjs/common';
import { InterestsService } from './interests.service';

@Module({
  providers: [InterestsService],
  exports: [InterestsService],
})
export class InterestsModule {}
