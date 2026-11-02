import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { StorageService } from './storage.service';

@UseGuards(AuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign-upload')
  presignUpload(
    @CurrentUser() user: SessionUser,
    @Body() dto: PresignUploadDto,
  ) {
    return this.storage.presignUpload({
      userId: user.id,
      category: dto.category,
      contentType: dto.contentType,
      contentLength: dto.contentLength,
    });
  }

  /**
   * Lecture d'un fichier privé.
   *
   * Limité au propriétaire pour l'instant. Les vocaux du chat passent par
   * ChatService, qui vérifie l'appartenance à la conversation — un
   * destinataire doit pouvoir écouter un message qu'il n'a pas envoyé.
   */
  @Get('presign-download')
  async presignDownload(
    @CurrentUser() user: SessionUser,
    @Query('key') key: string,
  ) {
    if (!this.storage.isOwnedBy(key, user.id)) {
      throw new ForbiddenException("Ce fichier ne vous appartient pas.");
    }

    return { url: await this.storage.presignDownload(key) };
  }
}
