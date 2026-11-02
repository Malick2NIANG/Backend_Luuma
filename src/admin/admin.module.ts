import { Module } from '@nestjs/common';
import { AdminAccessController } from './admin-access.controller';
import { AdminAccessService } from './admin-access.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * MailModule et PrismaModule ne sont pas importés : ils sont déclarés
 * @Global.
 */
@Module({
  controllers: [AdminController, AdminAccessController],
  // AdminAccessService est aussi consommé par AdminElevationGuard, instancié
  // par Nest au sein de ce module : il doit donc y être fourni.
  providers: [AdminService, AdminAccessService],
})
export class AdminModule {}
