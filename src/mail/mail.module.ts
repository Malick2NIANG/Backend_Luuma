import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { OtpDeliveryService } from './otp-delivery.service';

/**
 * Global : auth, admin et notifications en dépendent. La configuration
 * better-auth y accède aussi hors du conteneur Nest (voir mail.singleton.ts).
 */
@Global()
@Module({
  providers: [MailService, OtpDeliveryService],
  exports: [MailService, OtpDeliveryService],
})
export class MailModule {}
