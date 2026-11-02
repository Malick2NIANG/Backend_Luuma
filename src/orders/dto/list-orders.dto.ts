import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListOrdersDto {
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Statut de commande invalide.' })
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
