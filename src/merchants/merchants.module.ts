import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  controllers: [MerchantsController],
  providers: [MerchantsService],
  // ProductsService s'appuie sur getOwnMerchantOrThrow() : un dossier en
  // attente prépare son catalogue, invisible jusqu'à validation.
  exports: [MerchantsService],
})
export class MerchantsModule {}
