import { Injectable, Logger } from '@nestjs/common';
import { MailService } from './mail.service';
import {
  adminAccessCodeMail,
  resetPasswordCodeMail,
  verificationCodeMail,
} from './mail.templates';

export const OTP_CHANNELS = ['email', 'sms'] as const;
export type OtpChannel = (typeof OTP_CHANNELS)[number];

export type OtpPurpose = 'verification' | 'reset' | 'admin';

export interface OtpDelivery {
  channel: OtpChannel;
  purpose: OtpPurpose;
  code: string;
  email: string;
  phone?: string | null;
  name: string;
}

/** Durée de vie d'un code, en minutes. Doit rester alignée sur better-auth. */
export const OTP_EXPIRY_MINUTES = 20;

/**
 * Acheminement des codes à usage unique.
 *
 * L'aiguillage par canal existe dès maintenant alors que seul l'email est
 * opérationnel : au Sénégal le SMS est le canal réellement consulté, et il
 * finira par s'imposer. L'écrire ici coûte quelques lignes ; le rétro-ajouter
 * plus tard imposerait de reprendre tous les points d'appel.
 *
 * Brancher le SMS reviendra à implémenter `sendSms` — rien d'autre à toucher.
 */
@Injectable()
export class OtpDeliveryService {
  private readonly logger = new Logger(OtpDeliveryService.name);

  constructor(private readonly mail: MailService) {}

  /** Canaux réellement utilisables aujourd'hui. */
  availableChannels(): { channel: OtpChannel; enabled: boolean }[] {
    return [
      { channel: 'email', enabled: true },
      // Nécessite un fournisseur payant (Orange SMS API, Twilio).
      { channel: 'sms', enabled: this.isSmsConfigured() },
    ];
  }

  private isSmsConfigured(): boolean {
    return Boolean(process.env.SMS_PROVIDER_API_KEY);
  }

  async send(delivery: OtpDelivery): Promise<boolean> {
    // Repli silencieux sur l'email plutôt qu'une erreur : un utilisateur qui
    // demande un SMS non encore disponible doit recevoir son code, pas un
    // message d'échec.
    const channel =
      delivery.channel === 'sms' && !this.isSmsConfigured()
        ? 'email'
        : delivery.channel;

    if (channel === 'sms') {
      return this.sendSms(delivery);
    }
    return this.sendEmail(delivery);
  }

  private async sendEmail(delivery: OtpDelivery): Promise<boolean> {
    const params = {
      name: delivery.name,
      code: delivery.code,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    };

    const content =
      delivery.purpose === 'reset'
        ? resetPasswordCodeMail(params)
        : delivery.purpose === 'admin'
          ? adminAccessCodeMail(params)
          : verificationCodeMail(params);

    return this.mail.send(delivery.email, content);
  }

  private async sendSms(delivery: OtpDelivery): Promise<boolean> {
    // Point d'extension : brancher ici Orange SMS API ou Twilio.
    this.logger.warn(
      `Canal SMS non implémenté — code destiné à ${delivery.phone ?? 'inconnu'}.`,
    );
    return this.sendEmail(delivery);
  }
}
