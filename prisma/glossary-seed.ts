/**
 * Amorce du glossaire du commerce sénégalais.
 *
 * À RELIRE PAR QUELQU'UN QUI CONNAÎT LE MARCHÉ. Ces définitions viennent d'une
 * connaissance générale, pas du terrain : les orthographes, les nuances et les
 * usages régionaux demandent une vérification. Mieux vaut une liste courte et
 * juste qu'une liste longue et approximative — un glossaire qui se trompe est
 * pire qu'une absence de glossaire, parce qu'on lui fait confiance.
 *
 * Les alias comptent autant que les termes : le wolof commercial s'écrit
 * indifféremment à la française (« thiouraye ») ou dans l'orthographe
 * officielle (« cuuraay »), et les deux se croiseront dans les descriptions.
 */
export interface GlossarySeedEntry {
  slug: string;
  term: string;
  aliases: string[];
  category: string;
  translations: { fr: string; en: string };
}

export const GLOSSARY_SEED: GlossarySeedEntry[] = [
  // --- Tissus et vêtements ---
  {
    slug: 'bazin',
    term: 'Bazin',
    aliases: ['bazin riche', 'basin'],
    category: 'tissu',
    translations: {
      fr: "Coton damassé teint et lustré, très prisé pour les tenues de cérémonie. Le « bazin riche » désigne les qualités les plus épaisses.",
      en: 'Damask cotton, dyed and glazed, the fabric of choice for ceremonial outfits. "Bazin riche" refers to the heavier grades.',
    },
  },
  {
    slug: 'getzner',
    term: 'Getzner',
    aliases: ['guetzner'],
    category: 'tissu',
    translations: {
      fr: "Marque autrichienne de bazin haut de gamme, référence de prestige en Afrique de l'Ouest.",
      en: 'Austrian brand of premium bazin, a prestige benchmark across West Africa.',
    },
  },
  {
    slug: 'wax',
    term: 'Wax',
    aliases: ['pagne wax', 'ankara'],
    category: 'tissu',
    translations: {
      fr: 'Coton imprimé à la cire, aux motifs colorés. Chaque motif porte souvent un nom et un message.',
      en: 'Wax-printed cotton with bold patterns. Each design often carries its own name and meaning.',
    },
  },
  {
    slug: 'boubou',
    term: 'Boubou',
    aliases: ['grand boubou', 'mbubb'],
    category: 'vetement',
    translations: {
      fr: 'Ample tunique longue portée par les hommes comme par les femmes, tenue de cérémonie par excellence.',
      en: 'A flowing full-length robe worn by men and women alike, the ceremonial garment par excellence.',
    },
  },
  {
    slug: 'taille-basse',
    term: 'Taille-basse',
    aliases: ['taille basse', 'tailleur basse'],
    category: 'vetement',
    translations: {
      fr: 'Ensemble féminin en deux pièces : haut ajusté et pagne assorti noué à la taille.',
      en: "Two-piece women's outfit: a fitted top with a matching wrapper tied at the waist.",
    },
  },
  {
    slug: 'kaftan',
    term: 'Kaftan',
    aliases: ['caftan'],
    category: 'vetement',
    translations: {
      fr: 'Tunique longue, souvent brodée à l’encolure, plus ajustée que le boubou.',
      en: 'A long tunic, usually embroidered at the neckline, more fitted than the boubou.',
    },
  },
  {
    slug: 'ndiaxass',
    term: 'Ndiaxass',
    aliases: ['ndiakhass', 'njaxas'],
    category: 'tissu',
    translations: {
      fr: 'Assemblage de chutes de tissus contrastés cousues ensemble, technique traditionnelle devenue un style à part entière.',
      en: 'Contrasting fabric offcuts sewn together — a traditional technique that became a style in its own right.',
    },
  },

  // --- Parfums et cosmétiques ---
  {
    slug: 'thiouraye',
    term: 'Thiouraye',
    aliases: ['tiouraye', 'churai', 'cuuraay', 'thiuraye'],
    category: 'cosmetique',
    translations: {
      fr: "Encens sénégalais fait de bois, résines et huiles parfumées, brûlé sur des braises pour parfumer la maison et les vêtements.",
      en: 'Senegalese incense of scented woods, resins and oils, burned over coals to perfume the home and clothing.',
    },
  },
  {
    slug: 'gongo',
    term: 'Gongo',
    aliases: ['gongoli'],
    category: 'cosmetique',
    translations: {
      fr: 'Poudre parfumée traditionnelle, portée à même la peau ou dans les vêtements.',
      en: 'Traditional scented powder, worn on the skin or among clothes.',
    },
  },
  {
    slug: 'karite',
    term: 'Karité',
    aliases: ['beurre de karite', 'shea'],
    category: 'cosmetique',
    translations: {
      fr: "Beurre végétal extrait des noix de l'arbre à karité, utilisé pour la peau et les cheveux.",
      en: 'Plant butter pressed from shea tree nuts, used on skin and hair.',
    },
  },
  {
    slug: 'chebe',
    term: 'Chébé',
    aliases: ['chebe', 'sabe'],
    category: 'cosmetique',
    translations: {
      fr: 'Poudre tchadienne appliquée sur les cheveux pour limiter la casse et favoriser la longueur.',
      en: 'Chadian powder applied to hair to reduce breakage and encourage length.',
    },
  },

  // --- Alimentaire ---
  {
    slug: 'bissap',
    term: 'Bissap',
    aliases: ['hibiscus'],
    category: 'alimentaire',
    translations: {
      fr: "Fleurs d'hibiscus séchées, infusées en boisson rouge acidulée, servie glacée et sucrée.",
      en: 'Dried hibiscus flowers, brewed into a tart red drink served cold and sweetened.',
    },
  },
  {
    slug: 'netetou',
    term: 'Netetou',
    aliases: ['nététou', 'soumbala', 'sumbala'],
    category: 'alimentaire',
    translations: {
      fr: "Graines de néré fermentées, condiment à l'odeur puissante qui donne sa profondeur au thiéboudiène.",
      en: 'Fermented néré seeds — a pungent condiment that gives thieboudienne its depth.',
    },
  },
  {
    slug: 'thieboudienne',
    term: 'Thiéboudiène',
    aliases: ['ceebu jen', 'tieboudienne', 'thiep', 'ceebu jën'],
    category: 'alimentaire',
    translations: {
      fr: 'Riz au poisson et aux légumes, plat national sénégalais.',
      en: 'Rice with fish and vegetables — the national dish of Senegal.',
    },
  },
  {
    slug: 'cafe-touba',
    term: 'Café Touba',
    aliases: ['touba', 'kafe touba'],
    category: 'alimentaire',
    translations: {
      fr: 'Café parfumé au poivre de Guinée (djar), préparation emblématique du Sénégal.',
      en: 'Coffee spiced with Guinea pepper (djar), an emblematic Senegalese preparation.',
    },
  },
  {
    slug: 'ngalax',
    term: 'Ngalax',
    aliases: ['ngalakh', 'ngalah'],
    category: 'alimentaire',
    translations: {
      fr: "Dessert à base de couscous de mil, pâte d'arachide et pain de singe, traditionnellement partagé le Vendredi saint.",
      en: 'Dessert of millet couscous, peanut paste and baobab fruit, traditionally shared on Good Friday.',
    },
  },
  {
    slug: 'bouye',
    term: 'Bouye',
    aliases: ['bouyé', 'pain de singe', 'baobab'],
    category: 'alimentaire',
    translations: {
      fr: 'Fruit du baobab, consommé en jus crémeux ou en poudre.',
      en: 'Baobab fruit, drunk as a creamy juice or used as a powder.',
    },
  },
  {
    slug: 'kinkeliba',
    term: 'Kinkéliba',
    aliases: ['kinkeliba', 'quinquéliba'],
    category: 'alimentaire',
    translations: {
      fr: 'Feuilles séchées infusées en tisane, réputée digestive.',
      en: 'Dried leaves brewed as a herbal tea, valued as a digestive.',
    },
  },
  {
    slug: 'yet',
    term: 'Yet',
    aliases: ['yeet'],
    category: 'alimentaire',
    translations: {
      fr: 'Mollusque marin fermenté et séché, condiment très odorant du thiéboudiène.',
      en: 'Fermented dried sea snail, a strongly aromatic condiment in thieboudienne.',
    },
  },

  // --- Artisanat ---
  {
    slug: 'cauris',
    term: 'Cauris',
    aliases: ['cauri', 'cowrie'],
    category: 'artisanat',
    translations: {
      fr: 'Petits coquillages autrefois utilisés comme monnaie, aujourd’hui montés en bijoux et en décoration.',
      en: 'Small shells once used as currency, now set into jewellery and decoration.',
    },
  },
  {
    slug: 'thiaya',
    term: 'Thiaya',
    aliases: ['tiaya', 'bin bin', 'binbin'],
    category: 'artisanat',
    translations: {
      fr: 'Ceinture de perles portée à la taille sous les vêtements, parure féminine traditionnelle.',
      en: 'Beaded belt worn at the waist under clothing — a traditional feminine adornment.',
    },
  },
  {
    slug: 'sompe',
    term: 'Sompé',
    aliases: ['sompe'],
    category: 'artisanat',
    translations: {
      fr: 'Brasero en terre cuite ou en métal, utilisé pour brûler le thiouraye ou préparer le thé.',
      en: 'Clay or metal brazier, used to burn thiouraye or brew tea.',
    },
  },
  {
    slug: 'ataya',
    term: 'Ataya',
    aliases: ['attaya', 'warga'],
    category: 'artisanat',
    translations: {
      fr: 'Thé vert à la menthe très sucré, servi en trois tours successifs — un rituel social autant qu’une boisson.',
      en: 'Heavily sweetened green tea with mint, served in three successive rounds — as much a social ritual as a drink.',
    },
  },
];
