import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Min } from 'class-validator';
import { STORAGE_CATEGORIES, StorageCategory } from '../storage.constants';

export class PresignUploadDto {
  @IsIn(STORAGE_CATEGORIES, { message: 'Catégorie de fichier invalide.' })
  category!: StorageCategory;

  @IsString()
  contentType!: string;

  /**
   * Taille annoncée par le client. Elle est vérifiée avant signature, et de
   * nouveau par S3 à l'upload via la condition `content-length-range` : un
   * client qui mentirait ici verrait son upload rejeté par le stockage.
   */
  @Type(() => Number)
  @IsInt({ message: 'La taille du fichier doit être un nombre entier.' })
  @Min(1, { message: 'Fichier vide.' })
  contentLength!: number;
}
