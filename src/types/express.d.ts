import type { SessionRecord, SessionUser } from '../auth/auth.config';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      /**
       * La session elle-même, et pas seulement son porteur.
       *
       * L'élévation vers l'administration est accordée à UNE session, pas à un
       * compte : c'est ce qui empêche un second appareil déjà connecté d'en
       * profiter. Son identifiant doit donc être lisible par les gardes.
       */
      session?: SessionRecord;
    }
  }
}

export {};
