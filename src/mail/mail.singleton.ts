import { MailService } from './mail.service';
import { OtpDeliveryService } from './otp-delivery.service';

/**
 * Instances utilisables hors du conteneur Nest.
 *
 * `auth.config.ts` appelle `betterAuth({...})` au chargement du module, bien
 * avant que l'injection de dépendances n'existe : il ne peut donc pas recevoir
 * MailService par constructeur.
 *
 * Ces objets doublonnent ceux du conteneur, sans conséquence : les deux sont
 * sans état, ne portant qu'un transporteur SMTP construit depuis les variables
 * d'environnement.
 */
const mailService = new MailService();

export const mailSingleton = mailService;
export const otpDeliverySingleton = new OtpDeliveryService(mailService);
