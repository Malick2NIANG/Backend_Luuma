import { IsString, Length, Matches } from 'class-validator';

export class VerifyAdminCodeDto {
  /**
   * Six chiffres, exactement. La contrainte est posée ici plutôt que dans le
   * service : une saisie manifestement invalide ne doit pas consommer un des
   * trois essais.
   */
  @IsString()
  @Length(6, 6, { message: 'Le code comporte 6 chiffres.' })
  @Matches(/^\d{6}$/, { message: 'Le code ne contient que des chiffres.' })
  code!: string;
}
