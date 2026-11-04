/**
 * Données de test pour les déclinaisons produit.
 *
 * Idempotent : cherche « Chez Awa Couture » par son nom plutôt que d'en
 * recréer un, crée les produits manquants et actualise uniquement les photos
 * et descriptions de ces trois produits. Les autres données ne sont pas modifiées.
 *
 *   npm run db:seed
 */
import 'dotenv/config';
import {
  PrismaClient,
  ProductCategory,
  ProductKind,
  ProductSize,
} from '@prisma/client';
import { xofToEur } from '../src/common/currency';

const prisma = new PrismaClient();

const productImages = {
  boubou:
    'https://images.pexels.com/photos/31485660/pexels-photo-31485660.jpeg?auto=compress&w=1200',
  bazin:
    'https://images.pexels.com/photos/30452332/pexels-photo-30452332/free-photo-of-man-in-traditional-african-attire-standing-indoors.jpeg?auto=compress&w=1200',
  wax: 'https://images.pexels.com/photos/8655023/pexels-photo-8655023.jpeg?auto=compress&w=1200',
} as const;

async function main(): Promise<void> {
  const merchant = await prisma.merchant.findFirst({
    where: { shopName: 'Chez Awa Couture' },
    select: { id: true },
  });

  if (!merchant) {
    console.error(
      'Commerçant « Chez Awa Couture » introuvable — le seed de base ' +
        "n'a pas été exécuté. Rien n'a été créé.",
    );
    process.exitCode = 1;
    return;
  }

  await seedVariantProduct(merchant.id);
  await seedMadeToOrderProduct(merchant.id);
  await seedByLengthProduct(merchant.id);

  console.log('Seed « déclinaisons produit » terminé.');
}

/**
 * Boubou à 6 déclinaisons (S/M/L × 2 coloris). Poids CROISSANT avec la
 * taille — c'est ce qui doit se répercuter sur le colis et la capacité du
 * trajet, pas le poids du produit parent.
 */
async function seedVariantProduct(merchantId: string): Promise<void> {
  const name = 'Boubou wax élégance';

  const existing = await prisma.product.findFirst({
    where: { merchantId, name },
    select: { id: true },
  });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        images: [productImages.boubou],
        description:
          "Photo d'illustration. Boubou brodé en tissu wax, coupe traditionnelle.",
      },
    });
    console.log(`Photo d'illustration actualisée : « ${name} ».`);
    return;
  }

  const price = 35000; // XOF, prix de référence
  const product = await prisma.product.create({
    data: {
      merchantId,
      kind: ProductKind.VARIANT,
      name,
      description:
        "Photo d'illustration. Boubou brodé en tissu wax, coupe traditionnelle.",
      price,
      priceEur: xofToEur(price),
      weight: 1.0, // repli si une variante ne précise rien
      images: [productImages.boubou],
      category: ProductCategory.VETEMENTS,
      subCategory: 'boubou',
      variants: {
        create: [
          {
            size: ProductSize.S,
            colorName: 'Bleu indigo',
            colorHex: '#1B3A6B',
            weight: 0.9,
            stock: 5,
          },
          {
            size: ProductSize.S,
            colorName: 'Blanc écru',
            colorHex: '#F5F1E8',
            weight: 0.9,
            stock: 5,
          },
          {
            size: ProductSize.M,
            colorName: 'Bleu indigo',
            colorHex: '#1B3A6B',
            weight: 1.0,
            // Stock non suivi : l'artisan refait cette taille à la demande.
            stock: null,
          },
          {
            size: ProductSize.M,
            colorName: 'Blanc écru',
            colorHex: '#F5F1E8',
            weight: 1.0,
            stock: 5,
          },
          {
            size: ProductSize.L,
            colorName: 'Bleu indigo',
            colorHex: '#1B3A6B',
            weight: 1.15,
            // Épuisé : sert à tester le rejet de commande à stock 0.
            stock: 0,
          },
          {
            size: ProductSize.L,
            colorName: 'Blanc écru',
            colorHex: '#F5F1E8',
            weight: 1.15,
            stock: 5,
          },
        ],
      },
    },
  });

  console.log(`Créé : « ${name} » (${product.id}) avec 6 déclinaisons.`);
}

/** Ensemble sur-mesure : mesures obligatoires, délai de confection de 30 jours. */
async function seedMadeToOrderProduct(merchantId: string): Promise<void> {
  const name = 'Ensemble bazin sur-mesure';

  const existing = await prisma.product.findFirst({
    where: { merchantId, name },
    select: { id: true },
  });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        images: [productImages.bazin],
        description:
          "Photo d'illustration. Ensemble bazin cousu sur mesure selon vos dimensions.",
      },
    });
    console.log(`Photo d'illustration actualisée : « ${name} ».`);
    return;
  }

  const price = 60000;
  const product = await prisma.product.create({
    data: {
      merchantId,
      kind: ProductKind.MADE_TO_ORDER,
      name,
      description:
        "Photo d'illustration. Ensemble bazin cousu sur mesure selon vos dimensions.",
      price,
      priceEur: xofToEur(price),
      weight: 1.2,
      images: [productImages.bazin],
      category: ProductCategory.VETEMENTS,
      subCategory: 'bazin homme',
      productionDays: 30,
      requiredMeasurements: ['tour_poitrine', 'tour_taille', 'longueur_dos'],
    },
  });

  console.log(`Créé : « ${name} » (${product.id}), 30 jours de confection.`);
}

/** Tissu vendu au mètre. Prix et poids déclarés PAR MÈTRE. */
async function seedByLengthProduct(merchantId: string): Promise<void> {
  const name = 'Tissu wax premium';

  const existing = await prisma.product.findFirst({
    where: { merchantId, name },
    select: { id: true },
  });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        images: [productImages.wax],
        description:
          "Photo d'illustration. Tissu wax haute densité, vendu au mètre.",
      },
    });
    console.log(`Photo d'illustration actualisée : « ${name} ».`);
    return;
  }

  const pricePerMeter = 4000;
  const product = await prisma.product.create({
    data: {
      merchantId,
      kind: ProductKind.BY_LENGTH,
      name,
      description:
        "Photo d'illustration. Tissu wax haute densité, vendu au mètre.",
      price: pricePerMeter,
      priceEur: xofToEur(pricePerMeter),
      weight: 0.18, // kg par mètre
      images: [productImages.wax],
      category: ProductCategory.VETEMENTS,
      subCategory: 'tissu',
      unitLabel: 'mètre',
      minQuantity: 0.5,
    },
  });

  console.log(
    `Créé : « ${name} » (${product.id}), ${pricePerMeter} FCFA/mètre.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Échec du seed :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
