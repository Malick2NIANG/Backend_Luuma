import { PartialType } from '@nestjs/swagger';
import { CreateMerchantDto } from './create-merchant.dto';

/**
 * Hérite de CreateMerchantDto, donc les champs système (isApproved,
 * isKycVerified, rating, ...) restent inaccessibles côté client.
 */
export class UpdateMerchantDto extends PartialType(CreateMerchantDto) {}
