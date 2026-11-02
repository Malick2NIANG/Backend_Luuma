import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AcceptTermsDto {
  /**
   * Version que l'utilisateur déclare accepter.
   *
   * Transmise par le client et VÉRIFIÉE par le serveur contre la version en
   * vigueur. Sans cette vérification, une application restée ouverte pendant
   * une mise à jour des conditions enregistrerait l'acceptation d'un texte
   * périmé — et l'acceptation de la version courante n'aurait jamais lieu.
   */
  @IsString()
  @IsNotEmpty()
  version!: string;

  /** Accord commercial, facultatif et indépendant. */
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
