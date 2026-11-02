import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/** Le commerçant dépose le colis : photo de préparation attendue. */
export class DropOffPackageDto {
  @IsOptional()
  @IsUrl({}, { message: 'La photo doit être une URL valide.' })
  prepPhotoUrl?: string;
}

/** Le GP accuse réception : la photo fait foi en cas de litige. */
export class ReceivePackageDto {
  @IsOptional()
  @IsUrl({}, { message: 'La photo doit être une URL valide.' })
  receptionPhotoUrl?: string;
}

/** Le GP livre au client : photo de remise. */
export class DeliverPackageDto {
  @IsOptional()
  @IsUrl({}, { message: 'La photo doit être une URL valide.' })
  deliveryPhotoUrl?: string;
}

/**
 * Le GP refuse un colis. Le motif est obligatoire : il est transmis au client
 * et au commerçant, et sert de preuve si un litige est ouvert ensuite.
 */
export class RefusePackageDto {
  @IsString()
  @IsNotEmpty({ message: 'Le motif du refus est obligatoire.' })
  @MaxLength(500)
  refusalReason!: string;
}
