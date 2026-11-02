import { PrismaClient } from '@prisma/client';
import { GLOSSARY_SEED } from '../prisma/glossary-seed';

const prisma = new PrismaClient();

/**
 * Charge le glossaire d'amorçage.
 *
 * Idempotent par `upsert` sur le slug : relancer le script met à jour les
 * définitions sans créer de doublons, et sans toucher aux termes ajoutés
 * ailleurs. C'est ce qui permet de corriger une définition dans le fichier
 * source puis de relancer, plutôt que de vider la table.
 */
async function main() {
  let created = 0;
  let updated = 0;

  for (const entry of GLOSSARY_SEED) {
    const existing = await prisma.glossaryTerm.findUnique({
      where: { slug: entry.slug },
      select: { id: true },
    });

    await prisma.glossaryTerm.upsert({
      where: { slug: entry.slug },
      update: {
        term: entry.term,
        aliases: entry.aliases,
        category: entry.category,
        translations: entry.translations,
      },
      create: {
        slug: entry.slug,
        term: entry.term,
        aliases: entry.aliases,
        category: entry.category,
        translations: entry.translations,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  console.log(
    `Glossaire : ${created} terme(s) ajouté(s), ${updated} mis à jour, ` +
      `${GLOSSARY_SEED.length} au total.`,
  );
  console.log(
    'Rappel : ces définitions demandent une relecture par quelqu’un qui ' +
      'connaît le marché sénégalais.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
