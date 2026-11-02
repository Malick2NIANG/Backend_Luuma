/**
 * Suppression d'un compte, par adresse email.
 *
 *   npm run account:delete -- nmalick166@gmail.com
 *
 * Outil de DÉVELOPPEMENT : il sert à retester une inscription avec la même
 * adresse, puisque l'email est unique en base. Ce n'est PAS la suppression de
 * compte exigée par le RGPD — celle-là devra vivre dans l'application, et
 * devra décider quoi faire des commandes en cours et des fonds entiercés.
 *
 * Six relations n'ont PAS de suppression en cascade dans le schéma : commandes,
 * messages envoyés, avis donnés, avis reçus, litiges, paiements reçus. Ce n'est
 * pas un oubli — ces lignes appartiennent aussi à quelqu'un d'autre. Effacer un
 * compte effacerait l'avis qu'il a laissé à un commerçant, ou sa moitié d'une
 * conversation. Le script s'arrête donc et dit précisément ce qui bloque,
 * plutôt que de laisser remonter une violation de clé étrangère illisible.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error(
      'Usage : npm run account:delete -- <email>\n' +
        'Exemple : npm run account:delete -- nmalick166@gmail.com',
    );
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      merchant: { select: { id: true, shopName: true } },
      gp: { select: { id: true } },
      _count: {
        select: {
          orders: true,
          sentMessages: true,
          reviewsGiven: true,
          reviewsReceived: true,
          disputes: true,
          payments: true,
        },
      },
    },
  });

  if (!user) {
    console.log(`Aucun compte avec l'adresse ${email}. Rien à supprimer.`);
    return;
  }

  console.log('Compte trouvé :');
  console.log(`  ${user.name} — ${user.email} — ${user.phone ?? 'sans téléphone'}`);
  console.log(`  créé le ${user.createdAt.toLocaleDateString('fr-FR')}`);
  if (user.merchant) console.log(`  boutique : ${user.merchant.shopName}`);
  if (user.gp) console.log('  profil GP');

  const blockers = [
    ['commande(s)', user._count.orders],
    ['message(s) envoyé(s)', user._count.sentMessages],
    ['avis donné(s)', user._count.reviewsGiven],
    ['avis reçu(s)', user._count.reviewsReceived],
    ['litige(s)', user._count.disputes],
    ['paiement(s) reçu(s)', user._count.payments],
  ].filter(([, count]) => (count as number) > 0);

  if (blockers.length > 0) {
    console.error('\nRefus : ce compte laisse des traces chez d’autres personnes.');
    for (const [label, count] of blockers) {
      console.error(`  ${count as number} ${label as string}`);
    }
    console.error(
      "\nCes lignes n'ont pas de suppression en cascade, et c'est voulu : elles\n" +
        "appartiennent aussi à un commerçant, un GP ou un acheteur. Effacez-les\n" +
        'délibérément si vous y tenez, ou testez avec une autre adresse.',
    );
    process.exitCode = 1;
    return;
  }

  // Rôles, boutique, profil GP, sessions, jetons, abonnements, favoris et
  // stories partent en cascade — la suppression est déclarée sur chacune de
  // ces relations dans le schéma.
  await prisma.user.delete({ where: { id: user.id } });

  console.log(`\nSupprimé. L'adresse ${email} est de nouveau libre.`);
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
