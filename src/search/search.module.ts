import { Module } from '@nestjs/common';
import { InterestsModule } from '../interests/interests.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [InterestsModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
