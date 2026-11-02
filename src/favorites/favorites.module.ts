import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  controllers: [FavoritesController],
  providers: [FavoritesService],
  // Le fil et la fiche produit s'en servent pour marquer les cœurs déjà pris.
  exports: [FavoritesService],
})
export class FavoritesModule {}
