import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Filtre du catalogue vu par le commerçant lui-même.
 *
 * `availability` distingue ce que le public voit de ce qui est retiré de la
 * vente. Le commerçant a besoin des deux : « pourquoi mon produit n'apparaît
 * pas » est la première question qu'il se pose, et une liste qui masquerait
 * les indisponibles ne lui donnerait aucune réponse.
 */
export class ListOwnProductsDto {
  @IsOptional()
  @IsIn(['all', 'available', 'unavailable'])
  availability: 'all' | 'available' | 'unavailable' = 'all';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
