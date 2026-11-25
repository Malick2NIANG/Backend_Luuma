import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

export class SetPhoneDto {
  /** Format international : « + », indicatif, numéro — sans espaces. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value,
  )
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message:
      'Numéro invalide : indiquez-le au format international, ex. +221 77 123 45 67.',
  })
  phone!: string;
}
