/**
 * Gabarits d'emails Luuma.
 *
 * HTML en ligne, sans moteur de rendu : quatre emails ne justifient pas une
 * dépendance de plus, et les clients mail ignorent de toute façon la plupart
 * du CSS externe. Chaque gabarit fournit aussi une version texte — certains
 * clients la préfèrent, et son absence pénalise la délivrabilité.
 */

const PRIMARY = '#0B5C38';
const ACCENT = '#35C27A';

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

function layout(body: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:${PRIMARY};padding:24px;text-align:center;">
                <span style="color:#FFFFFF;font-size:24px;font-weight:700;letter-spacing:0.5px;">Luuma</span>
                <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:4px;">
                  Le marché du Sénégal, porté par les GP
                </div>
              </td>
            </tr>
            <tr><td style="padding:28px 24px;color:#1A1A1A;font-size:15px;line-height:22px;">${body}</td></tr>
            <tr>
              <td style="padding:16px 24px 24px;color:#9CA3AF;font-size:12px;line-height:18px;text-align:center;border-top:1px solid #F0F0F0;">
                Cet email vous a été envoyé automatiquement par Luuma.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

function codeBlock(code: string): string {
  return `
<div style="margin:24px 0;text-align:center;">
  <div style="display:inline-block;background:#F5F5F5;border-radius:12px;padding:16px 24px;">
    <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:${PRIMARY};font-family:monospace;">${code}</span>
  </div>
</div>`.trim();
}

/** Code de vérification à l'inscription. */
export function verificationCodeMail(params: {
  name: string;
  code: string;
  expiresInMinutes: number;
}): MailContent {
  return {
    subject: `${params.code} — votre code de vérification Luuma`,
    html: layout(`
      <p style="margin:0 0 8px;">Bonjour ${params.name},</p>
      <p style="margin:0;">Voici votre code de vérification :</p>
      ${codeBlock(params.code)}
      <p style="margin:0;color:#6B7280;font-size:13px;">
        Ce code expire dans ${params.expiresInMinutes} minutes. Si vous n'avez pas
        créé de compte Luuma, ignorez simplement cet email.
      </p>
    `),
    text: `Bonjour ${params.name},\n\nVotre code de vérification Luuma : ${params.code}\n\nIl expire dans ${params.expiresInMinutes} minutes.\nSi vous n'avez pas créé de compte, ignorez cet email.`,
  };
}

/** Code de réinitialisation du mot de passe. */
export function resetPasswordCodeMail(params: {
  name: string;
  code: string;
  expiresInMinutes: number;
}): MailContent {
  return {
    subject: `${params.code} — réinitialisation de votre mot de passe Luuma`,
    html: layout(`
      <p style="margin:0 0 8px;">Bonjour ${params.name},</p>
      <p style="margin:0;">
        Vous avez demandé à réinitialiser votre mot de passe. Voici votre code :
      </p>
      ${codeBlock(params.code)}
      <p style="margin:0;color:#6B7280;font-size:13px;">
        Ce code expire dans ${params.expiresInMinutes} minutes.
        <strong>Si vous n'êtes pas à l'origine de cette demande</strong>, ignorez cet
        email : votre mot de passe reste inchangé.
      </p>
    `),
    text: `Bonjour ${params.name},\n\nCode de réinitialisation Luuma : ${params.code}\n\nIl expire dans ${params.expiresInMinutes} minutes.\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.`,
  };
}

/**
 * Code d'accès à l'espace d'administration.
 *
 * Distinct des deux précédents par son ton : celui-ci est une ALERTE autant
 * qu'un code. Un administrateur reçoit ce message quand quelqu'un — lui ou
 * un autre — tente d'ouvrir l'espace d'administration avec sa session. Si ce
 * n'est pas lui, le mot de passe ne suffit plus à expliquer la tentative :
 * la session elle-même est compromise, et il faut la fermer.
 */
export function adminAccessCodeMail(params: {
  name: string;
  code: string;
  expiresInMinutes: number;
}): MailContent {
  return {
    subject: `${params.code} — accès à l'administration Luuma`,
    html: layout(`
      <p style="margin:0 0 8px;">Bonjour ${params.name},</p>
      <p style="margin:0;">
        Une demande d'accès à l'espace d'administration vient d'être faite
        depuis votre compte. Voici votre code :
      </p>
      ${codeBlock(params.code)}
      <p style="margin:0;color:#6B7280;font-size:13px;">
        Ce code expire dans ${params.expiresInMinutes} minutes.
        <strong>Si ce n'est pas vous</strong>, quelqu'un utilise votre session :
        changez votre mot de passe immédiatement — cela déconnectera tous les
        autres appareils.
      </p>
    `),
    text: `Bonjour ${params.name},\n\nCode d'accès à l'administration Luuma : ${params.code}\n\nIl expire dans ${params.expiresInMinutes} minutes.\nSi ce n'est pas vous, quelqu'un utilise votre session : changez votre mot de passe immédiatement, cela déconnectera tous les autres appareils.`,
  };
}

/**
 * Alerte après changement de mot de passe.
 *
 * Envoyée systématiquement, y compris quand le changement est légitime :
 * c'est le seul signal qu'a l'utilisateur si quelqu'un d'autre a pris la main
 * sur son compte.
 */
export function passwordChangedMail(params: {
  name: string;
  changedAt: Date;
}): MailContent {
  const when = params.changedAt.toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return {
    subject: 'Votre mot de passe Luuma a été modifié',
    html: layout(`
      <p style="margin:0 0 8px;">Bonjour ${params.name},</p>
      <p style="margin:0 0 16px;">
        Le mot de passe de votre compte Luuma a été modifié le ${when}.
      </p>
      <div style="background:#FEF2F2;border-left:3px solid #DC2626;padding:12px 16px;border-radius:8px;">
        <p style="margin:0;color:#991B1B;font-size:13px;">
          <strong>Ce n'était pas vous ?</strong> Réinitialisez immédiatement votre
          mot de passe depuis l'application et déconnectez vos autres appareils
          dans Profil → Sécurité.
        </p>
      </div>
    `),
    text: `Bonjour ${params.name},\n\nLe mot de passe de votre compte Luuma a été modifié le ${when}.\n\nSi ce n'était pas vous, réinitialisez votre mot de passe immédiatement et déconnectez vos autres appareils dans Profil > Sécurité.`,
  };
}

/** Identifiants d'un compte créé par un administrateur. */
export function accountCreatedMail(params: {
  name: string;
  email: string;
  temporaryPassword: string;
}): MailContent {
  return {
    subject: 'Votre compte Luuma a été créé',
    html: layout(`
      <p style="margin:0 0 8px;">Bonjour ${params.name},</p>
      <p style="margin:0 0 16px;">
        Un compte Luuma a été créé pour vous. Voici vos identifiants :
      </p>
      <div style="background:#F5F5F5;border-radius:12px;padding:16px;">
        <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">Email</p>
        <p style="margin:0 0 12px;font-weight:600;">${params.email}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">Mot de passe temporaire</p>
        <p style="margin:0;font-weight:600;font-family:monospace;color:${PRIMARY};">${params.temporaryPassword}</p>
      </div>
      <p style="margin:16px 0 0;color:#6B7280;font-size:13px;">
        Il vous sera demandé de choisir votre propre mot de passe à la première
        connexion.
      </p>
    `),
    text: `Bonjour ${params.name},\n\nUn compte Luuma a été créé pour vous.\n\nEmail : ${params.email}\nMot de passe temporaire : ${params.temporaryPassword}\n\nIl vous sera demandé de choisir votre propre mot de passe à la première connexion.`,
  };
}

export { ACCENT };
