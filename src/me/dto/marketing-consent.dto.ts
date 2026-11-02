import { IsBoolean } from 'class-validator';

export class MarketingConsentDto {
  @IsBoolean()
  accepted!: boolean;
}
