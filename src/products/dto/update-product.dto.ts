import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  /**
   * Seul champ système modifiable ici : permet de remettre en vente un
   * produit précédemment retiré, sans passer par un endpoint dédié.
   */
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
