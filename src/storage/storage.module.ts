import { Global, Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

/**
 * Global : produits, KYC, colis et chat en dépendent tous. Les faire
 * importer ce module un par un n'apporterait rien.
 */
@Global()
@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
