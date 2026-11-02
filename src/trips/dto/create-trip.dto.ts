import {
  IsISO31661Alpha2,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
} from 'class-validator';
import { IsFutureDate } from '../../common/validators/is-future-date.validator';

export class CreateTripDto {
  @IsString()
  @IsNotEmpty()
  originCity!: string;

  @IsString()
  @IsNotEmpty()
  destCity!: string;

  @IsISO31661Alpha2()
  destCountry!: string;

  @IsISO8601()
  @IsFutureDate()
  departureDate!: string;

  @IsOptional()
  @IsISO8601()
  arrivalDate?: string;

  @IsNumber()
  @IsPositive()
  pricePerKg!: number;

  @IsNumber()
  @IsPositive()
  maxWeight!: number;

  @IsOptional()
  @IsUrl()
  flightTicketUrl?: string;
}
