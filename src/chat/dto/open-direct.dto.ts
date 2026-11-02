import { IsString, MaxLength } from 'class-validator';

export class OpenDirectDto {
  /**
   * Identifiant de l'UTILISATEUR visé, pas du profil GP ou boutique.
   *
   * Un même compte peut porter les deux casquettes : viser le profil ferait
   * naître deux conversations avec la même personne selon l'écran d'où l'on
   * vient.
   */
  @IsString()
  @MaxLength(64)
  userId!: string;
}
