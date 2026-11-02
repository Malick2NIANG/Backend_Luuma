import 'dotenv/config';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { PrismaClient, RoleType } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { emailOTP } from 'better-auth/plugins';
import { mailSingleton, otpDeliverySingleton } from '../mail/mail.singleton';
import { passwordChangedMail } from '../mail/mail.templates';
import { OTP_EXPIRY_MINUTES } from '../mail/otp-delivery.service';

const prisma = new PrismaClient();

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 jours

/**
 * Session glissante : prolongée dès qu'elle date de plus d'un jour.
 *
 * Quelqu'un qui commande une fois par mois ne doit pas se reconnecter à chaque
 * fois. Le vrai garde-fou n'est pas une session courte mais la révocation des
 * autres appareils, exposée dans Profil → Sécurité.
 */
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24; // 1 jour

const OTP_LENGTH = 6;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,

    /**
     * Toutes les autres sessions tombent à la réinitialisation.
     *
     * On réinitialise rarement un mot de passe par oubli seul : c'est aussi le
     * geste de quelqu'un qui soupçonne un accès indésirable. Sans cette
     * option, l'intrus reste connecté — sa session ne dépend pas du mot de
     * passe — et le changement ne l'a dérangé en rien. Vérifié à la main : la
     * session ouverte dans un autre navigateur survivait au reset.
     *
     * La révocation précède la reconnexion : l'endpoint OTP de
     * réinitialisation ne renvoie pas de session, c'est le client qui se
     * reconnecte ensuite. La nouvelle session n'est donc pas emportée.
     *
     * Effet de bord assumé : les autres appareils légitimes devront se
     * reconnecter. C'est le bon prix.
     */
    revokeSessionsOnPasswordReset: true,
    // Alerte systématique après un changement, y compris légitime : c'est le
    // seul signal dont dispose l'utilisateur si quelqu'un a pris son compte.
    onPasswordReset: async ({ user }) => {
      await mailSingleton.send(
        user.email,
        passwordChangedMail({ name: user.name, changedAt: new Date() }),
      );
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  // Le repli désigne le FRONTEND (Expo, 8082), pas l'API. Il valait 3001 — le
  // port de l'API elle-même — ce qui n'aurait fait autoriser aucune origine
  // réelle : better-auth aurait rejeté l'inscription en « origine non fiable »
  // le jour où FRONTEND_URL manquerait, avec une erreur qui n'aurait rien
  // désigné du problème.
  trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:8082'],
  user: {
    fields: {
      // schema.prisma uses `avatar`, better-auth's canonical field is `image`
      image: 'avatar',
    },
    // schema.prisma declares `phone` as required + unique, so it must be
    // accepted as sign-up input or user creation fails the NOT NULL constraint.
    additionalFields: {
      phone: {
        type: 'string',
        required: true,
      },

      /**
       * Prénom et nom, séparés — les colonnes existaient déjà dans le schéma
       * sans jamais être remplies.
       *
       * `name` reste écrit en plus, et reste ce qu'affiche l'application :
       * better-auth l'exige, et tout l'affichage existant s'appuie dessus.
       * Ces deux champs servent à ce qu'un nom concaténé ne permet pas —
       * l'étiquette d'un colis, une facture, et s'adresser à quelqu'un par
       * son prénom seul.
       *
       * Facultatifs, parce que les comptes créés avant ce découpage ne les
       * ont pas : on ne devine pas où couper un nom complet.
       */
      firstName: {
        type: 'string',
        required: false,
      },
      lastName: {
        type: 'string',
        required: false,
      },
      // Version des conditions acceptée.
      //
      // FACULTATIVE à l'inscription, et c'est un choix assumé : l'acceptation
      // ne se fait plus dans le formulaire mais sur un écran bloquant à la
      // première ouverture, où le texte est réellement affiché. Une case
      // cochée à côté d'un lien qu'on n'ouvre jamais ne vaut pas un
      // consentement éclairé.
      //
      // Le compte existe donc quelques secondes sans acceptation — l'écran de
      // garde le rattrape avant toute action, et l'inscription porte une
      // mention passive qui informe à la collecte.
      termsVersion: {
        type: 'string',
        required: false,
      },
    },
  },
  account: {
    fields: {
      // schema.prisma names these the other way around
      providerId: 'provider',
      accountId: 'providerId',
    },
  },
  // Allows mobile/native clients to send `Authorization: Bearer <token>`
  // instead of relying on cookies.
  plugins: [
    bearer(),
    /**
     * Code à 6 chiffres pour la vérification d'email et la réinitialisation
     * de mot de passe.
     *
     * Un code plutôt qu'un lien : sur mobile, un lien cliqué depuis une appli
     * mail ouvre le navigateur et perd la session de l'application. Un code se
     * recopie, quel que soit l'endroit où on l'a lu.
     */
    emailOTP({
      otpLength: OTP_LENGTH,
      expiresIn: OTP_EXPIRY_MINUTES * 60,
      /**
       * Envoie le code dès l'inscription.
       *
       * Sans cette option (`false` par défaut), aucun code ne part : le
       * plugin n'expose alors que des endpoints à déclencher manuellement.
       *
       * Elle est incompatible avec `overrideDefaultEmailVerification` — le
       * crochet d'inscription du plugin ne se déclenche que lorsque cette
       * dernière est fausse. On garde donc celle-ci désactivée : le compte
       * doit rester utilisable sans vérification, seules les actions
       * sensibles étant protégées par VerifiedEmailGuard.
       */
      sendVerificationOnSignUp: true,
      // 3 essais puis le code est invalidé, contre la force brute.
      allowedAttempts: 3,
      async sendVerificationOTP({ email, otp, type }) {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { name: true, phone: true },
        });

        await otpDeliverySingleton.send({
          channel: 'email',
          purpose: type === 'forget-password' ? 'reset' : 'verification',
          code: otp,
          email,
          phone: user?.phone,
          // L'email de réinitialisation part avant toute session : l'utilisateur
          // peut être inconnu si l'adresse n'existe pas. On reste neutre.
          name: user?.name ?? 'à vous',
        });
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Every new user starts as a CLIENT; other roles (MERCHANT, GP,
          // ADMIN) are granted explicitly later. Upsert keeps this
          // idempotent if the hook is ever re-run for the same user.
          await prisma.userRole.upsert({
            where: { userId_role: { userId: user.id, role: RoleType.CLIENT } },
            update: {},
            create: { userId: user.id, role: RoleType.CLIENT },
          });
        },
      },
    },
  },
});

export type Auth = typeof auth;
export type SessionUser = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>['user'];

/** La session elle-même — son `id` identifie l'appareil connecté. */
export type SessionRecord = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>['session'];
