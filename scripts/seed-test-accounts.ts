/**
 * Trois comptes de test, un par combinaison de casquettes.
 *
 *   npm run seed:accounts
 *
 * L'API doit tourner : la création passe par `/api/auth/sign-up/email` et non
 * par Prisma. C'est délibéré — better-auth hache les mots de passe avec son
 * propre schéma (scrypt), et un compte inséré à la main en base aurait un hash
 * que le serveur ne saurait pas relire. On aurait trois comptes impossibles à
 * connecter, ce qui est exactement l'inverse du but.
 *
 * Ce qui vient ensuite (email vérifié, profils approuvés) passe par Prisma :
 * ce sont précisément les états qu'aucune route publique ne permet d'atteindre,
 * puisque la vérification d'email et l'approbation administrateur n'ont pas
 * encore d'écran.
 *
 * Idempotent : relancer le script ne crée pas de doublon et ne casse rien.
 */
import 'dotenv/config';
import { PrismaClient, RoleType } from '@prisma/client';
import { TERMS_VERSION } from '../src/legal/legal.documents';

const prisma = new PrismaClient();

const API_URL = process.env.APP_URL ?? 'http://localhost:3001';
// better-auth rejette toute requête sans Origin (protection CSRF) — un script
// serveur n'en envoie pas par défaut, contrairement à un navigateur.
const ORIGIN = process.env.FRONTEND_URL ?? 'http://localhost:8082';

/** Mot de passe commun aux trois comptes — environnement de test uniquement. */
const PASSWORD = 'Luum2026!';

type Hat = 'merchant' | 'gp' | 'admin';

interface TestAccount {
  email: string;
  name: string;
  phone: string;
  /**
   * Casquettes AJOUTÉES au rôle CLIENT.
   *
   * Aucun compte n'est « seulement commerçant » : better-auth attribue CLIENT
   * à la création, et rien ne le retire. Les rôles s'additionnent — c'est le
   * principe même du modèle, pas un effet de bord du script.
   */
  hats: Hat[];
  shopName?: string;
}

const ACCOUNTS: TestAccount[] = [
  {
    email: 'client@luum.test',
    name: 'Awa Diop',
    phone: '+221770000001',
    hats: [],
  },
  {
    email: 'vendeur@luum.test',
    name: 'Fatou Ndiaye',
    phone: '+221770000002',
    hats: ['merchant'],
    shopName: 'Fatou Créations',
  },
  {
    email: 'gp@luum.test',
    name: 'Moussa Fall',
    phone: '+221770000003',
    hats: ['gp'],
  },
  {
    email: 'admin@luum.test',
    name: 'Admin Luuma',
    phone: '+221770000004',
    hats: ['admin'],
  },
];

async function main(): Promise<void> {
  console.log(`API : ${API_URL}`);
  console.log(
    `Version des CGU en vigueur : ${TERMS_VERSION} — à accepter dans l'application.\n`,
  );

  for (const account of ACCOUNTS) {
    await seedAccount(account);
  }

  console.log('\n--- Récapitulatif ---');
  console.log(`Mot de passe commun : ${PASSWORD}\n`);
  for (const account of ACCOUNTS) {
    const hats =
      account.hats.length === 0
        ? 'CLIENT'
        : `CLIENT + ${account.hats.map((h) => h.toUpperCase()).join(' + ')}`;
    console.log(`  ${account.email.padEnd(22)} ${hats}`);
  }
  console.log(
    '\nTous ont l\'email vérifié : sans cela, ni boutique, ni GP, ni paiement.',
  );
}

async function seedAccount(account: TestAccount): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: account.email },
    select: { id: true },
  });

  const userId = existing ? existing.id : await signUp(account);

  if (existing) {
    console.log(`${account.email} — déjà présent, mise à jour de son état.`);
  } else {
    console.log(`${account.email} — compte créé.`);
  }

  // L'email vérifié n'est pas un détail de confort : `VerifiedEmailGuard` en
  // fait la condition d'ouverture d'une boutique, du statut GP et du paiement.
  // Tant que l'écran de saisie du code n'existe pas, c'est ici qu'on le pose.
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  });

  if (account.hats.includes('merchant')) {
    await seedMerchant(userId, account.shopName ?? 'Boutique de test');
  }

  if (account.hats.includes('gp')) {
    await seedGp(userId);
  }

  if (account.hats.includes('admin')) {
    await seedAdmin(userId);
  }
}

/**
 * ADMIN est le SEUL rôle réellement décisif du système.
 *
 * Il n'a pas de profil associé, contrairement à MERCHANT et GP : il n'existe
 * que comme ligne dans `user_roles`, et c'est `RolesGuard` qui le lit pour
 * ouvrir `/api/admin`. Il ne s'obtient jamais depuis l'application — seulement
 * ici ou par `scripts/promote-admin.ts`.
 */
async function seedAdmin(userId: string): Promise<void> {
  await prisma.userRole.upsert({
    where: { userId_role: { userId, role: RoleType.ADMIN } },
    update: {},
    create: { userId, role: RoleType.ADMIN },
  });

  console.log('   → rôle administrateur accordé.');
}

async function signUp(account: TestAccount): Promise<string> {
  const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      email: account.email,
      password: PASSWORD,
      name: account.name,
      phone: account.phone,
      // `termsVersion` n'est PLUS envoyée ici. L'acceptation se fait sur
      // l'écran bloquant à la première ouverture : l'envoyer à l'inscription
      // marquerait les comptes comme à jour sans qu'aucune acceptation ait eu
      // lieu, et l'écran ne s'afficherait jamais.
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Inscription refusée pour ${account.email} (${response.status}) : ${body}\n` +
        "L'API tourne-t-elle bien sur " + API_URL + ' ?',
    );
  }

  const created = await prisma.user.findUnique({
    where: { email: account.email },
    select: { id: true },
  });

  if (!created) {
    throw new Error(
      `${account.email} : l'API a répondu 200 mais aucun compte n'est en base.`,
    );
  }

  return created.id;
}

/**
 * Boutique approuvée.
 *
 * `isApproved: true` court-circuite la validation administrateur, qui n'a pas
 * encore d'écran. Sans cela la boutique existerait mais resterait invisible :
 * le fil, la recherche, la fiche produit et la commande filtrent tous dessus.
 */
async function seedMerchant(userId: string, shopName: string): Promise<void> {
  await prisma.merchant.upsert({
    where: { userId },
    update: { isApproved: true, isKycVerified: true, rejectionNote: null },
    create: {
      userId,
      shopName,
      description: 'Boutique de test — couture et accessoires.',
      address: 'Marché HLM, Dakar',
      city: 'Dakar',
      country: 'SN',
      isApproved: true,
      isKycVerified: true,
      payoutMethod: 'wave',
      payoutAccount: '+221770000002',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_role: { userId, role: RoleType.MERCHANT } },
    update: {},
    create: { userId, role: RoleType.MERCHANT },
  });

  console.log('   → boutique approuvée.');
}

async function seedGp(userId: string): Promise<void> {
  await prisma.gP.upsert({
    where: { userId },
    update: { isApproved: true, isKycVerified: true, rejectionNote: null },
    create: {
      userId,
      isApproved: true,
      isKycVerified: true,
      // Palier de départ : 5 kg tant que 5 voyages ne sont pas validés.
      maxWeightPerTrip: 5,
      payoutMethod: 'wave',
      payoutAccount: '+221770000003',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_role: { userId, role: RoleType.GP } },
    update: {},
    create: { userId, role: RoleType.GP },
  });

  console.log('   → profil GP approuvé, capacité 5 kg.');
}

main()
  .catch((error: unknown) => {
    console.error(
      '\nÉchec :',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
