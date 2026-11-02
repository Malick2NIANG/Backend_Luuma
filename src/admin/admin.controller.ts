import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminElevationGuard } from '../common/guards/admin-elevation.guard';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';
import {
  ApproveDto,
  ListPendingDto,
  RejectDto,
  SetGpCapacityDto,
} from './dto/admin-actions.dto';

/**
 * Trois verrous, dans cet ordre, et chacun protège d'autre chose :
 *
 * 1. `AuthGuard` — une session valide existe, et renseigne request.user
 *    ainsi que request.session.
 * 2. `RolesGuard` — ce compte porte le rôle ADMIN.
 * 3. `AdminElevationGuard` — CETTE session a validé un code reçu par email.
 *
 * Le troisième est le seul qui résiste à une session volée : un jeton recopié
 * ou un navigateur laissé ouvert donne le compte et le rôle, jamais la boîte
 * mail. Les deux premiers, eux, ne verraient aucune différence avec le
 * titulaire légitime.
 *
 * Le décorateur porte sur la CLASSE : aucune route ne peut être exposée par
 * oubli. Les routes qui permettent d'obtenir l'élévation vivent dans
 * `AdminAccessController`, à part — elles ne peuvent pas exiger ce qu'elles
 * servent à obtenir.
 */
@UseGuards(AuthGuard, RolesGuard, AdminElevationGuard)
@Roles(RoleType.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  getStats() {
    return this.admin.getStats();
  }

  // --- Commerçants ---------------------------------------------------------

  @Get('merchants/pending')
  listPendingMerchants(@Query() dto: ListPendingDto) {
    return this.admin.listPendingMerchants(dto);
  }

  @Patch('merchants/:id/approve')
  approveMerchant(@Param('id') id: string, @Body() dto: ApproveDto) {
    return this.admin.approveMerchant(id, dto);
  }

  @Patch('merchants/:id/reject')
  rejectMerchant(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.admin.rejectMerchant(id, dto);
  }

  // --- GP ------------------------------------------------------------------

  @Get('gps/pending')
  listPendingGps(@Query() dto: ListPendingDto) {
    return this.admin.listPendingGps(dto);
  }

  @Patch('gps/:id/approve')
  approveGp(@Param('id') id: string, @Body() dto: ApproveDto) {
    return this.admin.approveGp(id, dto);
  }

  @Patch('gps/:id/reject')
  rejectGp(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.admin.rejectGp(id, dto);
  }

  @Patch('gps/:id/capacity')
  setGpCapacity(@Param('id') id: string, @Body() dto: SetGpCapacityDto) {
    return this.admin.setGpCapacity(id, dto);
  }

  // --- KYC -----------------------------------------------------------------

  /** Consultation de la pièce d'identité d'un postulant. */
  @Get(':profileType/:id/kyc-document')
  getKycDocument(
    @Param('profileType') profileType: string,
    @Param('id') id: string,
  ) {
    if (profileType !== 'merchant' && profileType !== 'gp') {
      throw new BadRequestException(
        'Type de profil invalide (merchant ou gp).',
      );
    }

    return this.admin.getKycDocumentUrl(profileType, id);
  }
}
