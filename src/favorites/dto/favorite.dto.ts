import { IsString, MaxLength } from 'class-validator';

export class FavoriteDto {
  @IsString()
  @MaxLength(64)
  productId!: string;
}
