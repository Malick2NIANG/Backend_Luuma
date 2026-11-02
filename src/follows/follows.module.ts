import { Module } from '@nestjs/common';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

@Module({
  controllers: [FollowsController],
  providers: [FollowsService],
  // FeedService s'en sert pour remonter les comptes suivis.
  exports: [FollowsService],
})
export class FollowsModule {}
