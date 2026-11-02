import { Module } from '@nestjs/common';
import { FavoritesModule } from '../favorites/favorites.module';
import { FollowsModule } from '../follows/follows.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [FollowsModule, FavoritesModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
