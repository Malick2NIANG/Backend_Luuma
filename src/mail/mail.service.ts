import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailContent } from './mail.templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    this.from = process.env.EMAIL_FROM ?? 'Luuma <no-reply@luum.app>';

    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();

    /**
     * Les espaces sont retirés, et ce n'est pas de la coquetterie.
     *
     * Google présente ses mots de passe d'application en quatre groupes de
     * quatre caractères séparés par des espaces — mais le secret, ce sont les
     * seize caractères. Un copier-coller emporte les espaces, parfois un
     * insécable, et Gmail répond alors `535-5.7.8 Username and Password not
     * accepted` : un message qui accuse les identifiants et ne dit rien de la
     * mise en forme. On a perdu une soirée dessus.
     *
     * Aucun serveur SMTP n'accepte d'espace dans un mot de passe AUTH PLAIN,
     * donc ce nettoyage ne peut casser aucun cas légitime.
     */
    const pass = process.env.SMTP_PASS?.replace(/\s+/g, '');

    // Sans SMTP configuré, on n'échoue pas : en développement, exiger un vrai
    // serveur mail pour tester une inscription serait absurde. Les emails sont
    // alors écrits dans les logs, code compris.
    if (!host || !user || !pass || user.startsWith('your@')) {
      this.transporter = null;
      this.logger.warn(
        'SMTP non configuré — les emails seront affichés dans la console.',
      );
      return;
    }

    this.transporter = createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      // 465 impose TLS implicite ; 587 passe par STARTTLS.
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user, pass },
    });
  }

  /**
   * Envoie un email.
   *
   * Ne lève jamais : un envoi raté ne doit pas faire échouer l'inscription ni
   * le changement de mot de passe. L'utilisateur peut redemander un code ;
   * perdre son compte parce que le serveur mail hoquette serait bien pire.
   */
  async send(to: string, content: MailContent): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(
        `\n──────── EMAIL (mode console) ────────\n` +
          `À      : ${to}\n` +
          `Objet  : ${content.subject}\n\n` +
          `${content.text}\n` +
          `──────────────────────────────────────`,
      );
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      return true;
    } catch (error) {
      this.logger.error(`Envoi échoué vers ${to}: ${String(error)}`);
      return false;
    }
  }
}
