/**
 * Catalogue de démonstration — pour tester Luuma dans de vraies conditions.
 *
 *   docker compose exec api node scripts/seed-demo-catalog.cjs
 *
 * Crée 7 boutiques et une vingtaine de produits répartis dans toutes les
 * catégories, avec 2 à 3 photos par produit et une vidéo pour plusieurs
 * d'entre eux. Les dates de publication s'étalent sur trois semaines, pour
 * que le fil ait de la profondeur (pagination, suggestions « Pour vous »).
 *
 * Médias : Pexels (licence libre, usage commercial autorisé, sans
 * attribution obligatoire). Ce sont des ILLUSTRATIONS : chaque description
 * le précise. À remplacer par les vraies photos des commerçants.
 *
 * Idempotent : les boutiques sont retrouvées par leur e-mail de démo
 * (@demo.luuma.test), les produits par leur nom dans la boutique. Relancer le
 * script met à jour photos, prix et textes sans rien dupliquer.
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const EUR_TO_XOF = Number(process.env.EUR_TO_XOF_RATE) || 655.957;
const eur = (xof) => Math.round((xof / EUR_TO_XOF) * 100) / 100;

const photo = (id) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;

// Définition SD : le fil lit les vidéos en boucle, inutile de faire
// télécharger de la HD à quelqu'un qui fait défiler sur son forfait.
const video = {
  wax: 'https://videos.pexels.com/video-files/9690685/9690685-sd_360_640_30fps.mp4',
  cuir: 'https://videos.pexels.com/video-files/34740034/14727140_540_960_30fps.mp4',
  perles: 'https://videos.pexels.com/video-files/7102536/7102536-sd_360_640_30fps.mp4',
  vannerie: 'https://videos.pexels.com/video-files/8459506/8459506-sd_640_360_30fps.mp4',
  poterie: 'https://videos.pexels.com/video-files/35487051/15033825_540_960_30fps.mp4',
  couture: 'https://videos.pexels.com/video-files/6460176/6460176-sd_640_360_25fps.mp4',
  savon: 'https://videos.pexels.com/video-files/13161560/13161560-sd_640_360_30fps.mp4',
  ataya: 'https://videos.pexels.com/video-files/35368956/14985811_640_360_50fps.mp4',
};

const ILLUSTRATION = '\n\nPhoto d’illustration — visuel de démonstration.';

const boutiques = [
  {
    key: 'awa',
    shopName: 'Chez Awa Couture',
    owner: 'Awa Diop',
    city: 'Dakar',
    description: 'Couture sur mesure et prêt-à-porter en wax et bazin, depuis la Médina.',
    rating: 4.8,
    totalReviews: 64,
  },
  {
    key: 'fatou',
    shopName: 'Fatou Créations',
    owner: 'Fatou Sarr',
    city: 'Dakar',
    description: 'Bijoux en perles et accessoires faits main.',
    rating: 4.6,
    totalReviews: 38,
  },
  {
    key: 'ngaye',
    shopName: 'Atelier Ngaye Cuir',
    owner: 'Moussa Ndiaye',
    city: 'Thiès',
    description: 'Maroquinerie et chaussures en cuir, savoir-faire de Ngaye Mékhé.',
    rating: 4.7,
    totalReviews: 51,
  },
  {
    key: 'saveurs',
    shopName: 'Saveurs de Casamance',
    owner: 'Ibrahima Diatta',
    city: 'Dakar',
    description: 'Produits du terroir : bissap, cajou, épices et thé pour l’ataya.',
    rating: 4.9,
    totalReviews: 112,
  },
  {
    key: 'karite',
    shopName: 'Karité & Co',
    owner: 'Aminata Ba',
    city: 'Dakar',
    description: 'Cosmétiques naturels : karité, savon noir, huiles végétales.',
    rating: 4.5,
    totalReviews: 29,
  },
  {
    key: 'baobab',
    shopName: 'L’Atelier du Baobab',
    owner: 'Cheikh Faye',
    city: 'Saint-Louis',
    description: 'Vannerie, poterie et sculpture : l’artisanat sénégalais pour la maison.',
    rating: 4.7,
    totalReviews: 22,
  },
  {
    key: 'teranga',
    shopName: 'Librairie & Bébé Teranga',
    owner: 'Khady Mbaye',
    city: 'Touba',
    description: 'Livres, culture et petits vêtements pour enfants.',
    rating: 4.4,
    totalReviews: 17,
  },
];

/** `jours` : il y a combien de jours le produit a été publié. */
const produits = [
  // ── Vêtements ─────────────────────────────────────────────────────────
  {
    boutique: 'awa', jours: 0.2, category: 'VETEMENTS', subCategory: 'tissu wax',
    name: 'Pagne wax hollandais — 6 yards', price: 18000, weight: 0.9,
    media: [photo(35633192), video.wax, photo(40315326), photo(8655018)],
    description: 'Wax 100 % coton, motifs vifs, couleurs grand teint. Pièce de 6 yards (environ 5,5 m), idéale pour un ensemble complet ou une robe longue.',
  },
  {
    boutique: 'awa', jours: 2, category: 'VETEMENTS', subCategory: 'tenue traditionnelle',
    name: 'Tenue traditionnelle brodée femme', price: 45000, weight: 1.2,
    media: [photo(17273200), photo(31602730), photo(33420835)],
    description: 'Ensemble deux pièces brodé à la main, avec foulard assorti. Plusieurs coloris disponibles : précisez le vôtre par message.',
  },
  {
    boutique: 'awa', jours: 5, category: 'VETEMENTS', subCategory: 'chemise homme',
    name: 'Chemise dashiki homme', price: 15000, weight: 0.35,
    media: [photo(3986133), video.couture, photo(18330807)],
    description: 'Coupe droite, manches courtes, broderie au col. Taillée dans notre atelier de la Médina.',
  },
  {
    boutique: 'awa', jours: 9, category: 'VETEMENTS', subCategory: 'foulard',
    name: 'Foulard de tête en wax', price: 5000, weight: 0.1,
    media: [photo(5500453), photo(38487457)],
    description: 'Grand foulard (2 m × 50 cm) à nouer en turban ou en headwrap. Léger, il voyage facilement.',
  },

  // ── Chaussures et cuir ────────────────────────────────────────────────
  {
    boutique: 'ngaye', jours: 0.6, category: 'CHAUSSURES', subCategory: 'sandales',
    name: 'Sandales en cuir de Ngaye Mékhé', price: 12000, weight: 0.6,
    media: [photo(40978791), video.cuir],
    description: 'Sandales cousues main, semelle cuir, du 36 au 45. Le cuir se patine avec le temps.',
  },
  {
    boutique: 'ngaye', jours: 6, category: 'CHAUSSURES', subCategory: 'mocassins',
    name: 'Mocassins en cuir camel', price: 28000, weight: 0.9,
    media: [photo(12210270), photo(40978791)],
    description: 'Mocassins en cuir pleine fleur, doublure cuir, finition cirée.',
  },
  {
    boutique: 'ngaye', jours: 12, category: 'BIJOUX_ACCESSOIRES', subCategory: 'sac',
    name: 'Sac besace en cuir', price: 35000, weight: 0.8,
    media: [photo(6650001), video.cuir, photo(35753872), photo(5243552)],
    description: 'Besace en cuir de vachette, bandoulière réglable, poche intérieure zippée.',
  },

  // ── Bijoux ────────────────────────────────────────────────────────────
  {
    boutique: 'fatou', jours: 1, category: 'BIJOUX_ACCESSOIRES', subCategory: 'bracelets',
    name: 'Bracelets en perles faits main — lot de 5', price: 6500, weight: 0.1,
    media: [photo(28521274), video.perles, photo(36738994)],
    description: 'Cinq bracelets élastiques en perles de verre, assortis à la main. Taille unique.',
  },
  {
    boutique: 'fatou', jours: 8, category: 'BIJOUX_ACCESSOIRES', subCategory: 'collier',
    name: 'Collier pendentif en argent', price: 22000, weight: 0.05,
    media: [photo(7700270), photo(34549909)],
    description: 'Chaîne et pendentif en argent 925, travaillés par un bijoutier de Dakar. Livré dans son écrin.',
  },

  // ── Alimentaire ───────────────────────────────────────────────────────
  {
    boutique: 'saveurs', jours: 0.4, category: 'ALIMENTAIRE', subCategory: 'thé',
    name: 'Kit ataya — thé vert, théière et verres', price: 14000, weight: 1.2,
    media: [photo(1493080), video.ataya, photo(34344554)],
    description: 'Tout pour préparer l’ataya : 250 g de thé vert de Chine, une théière en métal et six petits verres.',
  },
  {
    boutique: 'saveurs', jours: 3, category: 'ALIMENTAIRE', subCategory: 'bissap',
    name: 'Bissap séché premium — 500 g', price: 3500, weight: 0.5,
    media: [photo(9136977), photo(37126311)],
    description: 'Fleurs d’hibiscus séchées, triées à la main. Pour le jus de bissap, chaud ou glacé.',
  },
  {
    boutique: 'saveurs', jours: 7, category: 'ALIMENTAIRE', subCategory: 'noix de cajou',
    name: 'Noix de cajou grillées de Casamance — 1 kg', price: 9000, weight: 1,
    media: [photo(6803749), photo(36631827), photo(9615877)],
    description: 'Cajou de Ziguinchor, grillé et légèrement salé. Sachet refermable.',
  },
  {
    boutique: 'saveurs', jours: 15, category: 'ALIMENTAIRE', subCategory: 'épices',
    name: 'Mélange d’épices pour thiéboudienne', price: 4500, weight: 0.3,
    media: [photo(16819820), photo(17952748), photo(28411491)],
    description: 'Le mélange de la maison : poivre, piment, laurier, ail séché et nététou. Pour quatre à six plats.',
  },

  // ── Cosmétiques ───────────────────────────────────────────────────────
  {
    boutique: 'karite', jours: 1.5, category: 'COSMETIQUES', subCategory: 'karité',
    name: 'Beurre de karité pur — 250 g', price: 4000, weight: 0.3,
    media: [photo(7966386), photo(11284698)],
    description: 'Karité brut non raffiné, pressé à froid. Peau, cheveux, lèvres.',
  },
  {
    boutique: 'karite', jours: 4, category: 'COSMETIQUES', subCategory: 'savon noir',
    name: 'Savon noir traditionnel', price: 2500, weight: 0.2,
    media: [photo(6621471), video.savon, photo(7055158)],
    description: 'Savon noir artisanal à base d’huiles végétales et de cendres de plantes.',
  },
  {
    boutique: 'karite', jours: 11, category: 'COSMETIQUES', subCategory: 'huile',
    name: 'Huile de baobab bio — 100 ml', price: 6000, weight: 0.2,
    media: [photo(20689447), photo(40557468)],
    description: 'Huile vierge de graines de baobab, riche en oméga. Visage et cheveux secs.',
  },

  // ── Artisanat et maison ───────────────────────────────────────────────
  {
    boutique: 'baobab', jours: 0.8, category: 'ARTISANAT_DECO', subCategory: 'vannerie',
    name: 'Panier tressé en paille', price: 9500, weight: 0.7,
    media: [photo(13833730), video.vannerie],
    description: 'Panier tressé à la main, anses en cuir. Pour le marché ou en décoration.',
  },
  {
    boutique: 'baobab', jours: 5.5, category: 'MAISON', subCategory: 'poterie',
    name: 'Jarre canari en terre cuite', price: 15000, weight: 4,
    media: [photo(20208728), video.poterie, photo(13575092)],
    description: 'Canari façonné et cuit au four traditionnel. Garde l’eau fraîche naturellement.',
  },
  {
    boutique: 'baobab', jours: 14, category: 'ARTISANAT_DECO', subCategory: 'sculpture',
    name: 'Statuette en bois sculpté', price: 30000, weight: 1.5,
    media: [photo(36766618), photo(11098241)],
    description: 'Pièce unique sculptée dans un seul bloc de bois. Hauteur environ 40 cm.',
  },

  // ── Enfants et culture ────────────────────────────────────────────────
  {
    boutique: 'teranga', jours: 2.5, category: 'ENFANT_BEBE', subCategory: 'ensemble enfant',
    name: 'Ensemble wax mère-enfant', price: 25000, weight: 0.8,
    media: [photo(30110240), photo(35811603)],
    description: 'Deux tenues assorties dans le même wax : une pour maman, une pour l’enfant (2 à 8 ans).',
  },
  {
    boutique: 'teranga', jours: 10, category: 'LIVRES_CULTURE', subCategory: 'cuisine',
    name: 'Livre de cuisine sénégalaise', price: 12000, weight: 0.6,
    media: [photo(17952748), photo(40101556)],
    description: 'Thiéboudienne, yassa, mafé, pastels… 80 recettes expliquées pas à pas.',
  },
];

async function boutiqueDemo(b) {
  const email = `${b.key}@demo.luuma.test`;
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: b.owner },
    create: { email, name: b.owner, emailVerified: true },
  });
  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: 'MERCHANT' } },
    update: {},
    create: { userId: user.id, role: 'MERCHANT' },
  });

  // Les deux boutiques du seed de base sont reprises si elles existent :
  // pas de doublon « Chez Awa Couture » dans le fil.
  const existante = await prisma.merchant.findFirst({
    where: { OR: [{ userId: user.id }, { shopName: b.shopName }] },
  });
  const data = {
    shopName: b.shopName,
    description: b.description,
    city: b.city,
    address: `${b.city}, Sénégal`,
    isApproved: true,
    isKycVerified: true,
    rating: b.rating,
    totalReviews: b.totalReviews,
  };
  if (existante) {
    return prisma.merchant.update({ where: { id: existante.id }, data });
  }
  return prisma.merchant.create({ data: { ...data, userId: user.id } });
}

async function main() {
  const ids = {};
  for (const b of boutiques) {
    const m = await boutiqueDemo(b);
    ids[b.key] = m.id;
    console.log(`Boutique  ${b.shopName}`);
  }

  const maintenant = Date.now();
  for (const p of produits) {
    const merchantId = ids[p.boutique];
    const createdAt = new Date(maintenant - p.jours * 24 * 60 * 60 * 1000);
    const data = {
      name: p.name,
      description: p.description + ILLUSTRATION,
      price: p.price,
      priceEur: eur(p.price),
      weight: p.weight,
      images: p.media,
      category: p.category,
      subCategory: p.subCategory,
      isAvailable: true,
      createdAt,
    };
    const existant = await prisma.product.findFirst({
      where: { merchantId, name: p.name },
      select: { id: true },
    });
    if (existant) {
      await prisma.product.update({ where: { id: existant.id }, data });
    } else {
      await prisma.product.create({ data: { ...data, merchantId } });
    }
    const videos = p.media.filter((m) => m.endsWith('.mp4')).length;
    console.log(`  Produit ${p.name}  (${p.media.length - videos} photo(s)${videos ? `, ${videos} vidéo` : ''})`);
  }

  console.log(`\n${boutiques.length} boutiques, ${produits.length} produits prêts.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
