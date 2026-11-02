import { Type } from 'class-transformer';
import { MessageType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Un message est soit du texte, soit un fichier déjà déposé sur le stockage.
 * Le client obtient d'abord une URL présignée via /api/storage/presign-upload,
 * envoie son fichier, puis transmet ici la `fileKey` retournée.
 *
 * La cohérence type/champs est vérifiée dans ChatService : class-validator ne
 * sait pas exprimer « content requis si type=TEXT, fileKey requis sinon ».
 */
export class SendMessageDto {
  @IsOptional()
  @IsEnum(MessageType, { message: 'Type de message invalide.' })
  type: MessageType = MessageType.TEXT;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Message vide.' })
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsString()
  fileKey?: string;

  /** Durée du vocal en secondes — affichée avant lecture. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;
}
