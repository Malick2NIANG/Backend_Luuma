import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  LEGAL_DOCUMENTS,
  TERMS_VERSION,
  type LegalDocumentId,
} from './legal.documents';

/**
 * Documents légaux, servis par l'API.
 *
 * Public, et volontairement : on doit pouvoir les lire AVANT de créer un
 * compte — c'est même tout l'intérêt, puisqu'on demande de les accepter à
 * l'inscription.
 *
 * Servis plutôt qu'embarqués dans l'application pour qu'une correction
 * juridique n'attende pas une mise à jour sur les magasins.
 */
@Controller('legal')
export class LegalController {
  /** Version courante, à enregistrer sur le compte à l'acceptation. */
  @Get('version')
  getVersion() {
    return { version: TERMS_VERSION };
  }

  @Get(':document')
  getDocument(@Param('document') document: string) {
    const found = LEGAL_DOCUMENTS[document as LegalDocumentId];

    if (!found) {
      throw new NotFoundException('Document introuvable.');
    }

    return found;
  }
}
