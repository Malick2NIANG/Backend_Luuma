/**
 * Génère les énumérations partagées du frontend depuis schema.prisma.
 *
 * Pourquoi ce script existe : les types du frontend étaient recopiés à la
 * main, et rien ne pouvait détecter leur dérive. Une valeur d'énumération
 * traverse le réseau comme une chaîne de caractères — `category: string`
 * accepte donc n'importe quel texte, y compris une valeur supprimée du
 * schéma la veille. TypeScript ne voit rien, l'erreur n'apparaît qu'à
 * l'exécution, chez l'utilisateur.
 *
 * Portée volontairement limitée aux énumérations : ce sont elles qui
 * dérivent en silence. Les formes de réponse composées restent écrites à la
 * main dans api.types.ts — un `include` Prisma ne se traduit pas
 * mécaniquement, et prétendre le contraire produirait des types faux.
 *
 *   npm run types:generate
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = join(__dirname, '..', 'prisma', 'schema.prisma');
const OUTPUT = join(
  __dirname,
  '..',
  '..',
  'Frontend',
  'types',
  'generated.ts',
);

/**
 * Énumérations exposées à l'application mobile.
 *
 * Liste explicite plutôt que « tout exporter » : une énumération publiée
 * devient de fait une promesse d'API. Y ajouter une entrée est donc une
 * décision, pas un effet de bord.
 */
const EXPOSED = [
  'RoleType',
  'ProductCategory',
  // La forme de vente d'un produit et ses tailles : le client en a besoin pour
  // savoir quoi demander avant l'ajout au panier — une taille, des mesures,
  // une longueur, ou rien.
  'ProductKind',
  'ProductSize',
  'TripStatus',
  'OrderStatus',
  'ItemStatus',
  'PackageStatus',
  'PaymentType',
  'PaymentStatus',
  'MessageType',
  'ChatKind',
  'StoryMediaType',
  'ReviewType',
  'NotifType',
  'DisputeStatus',
] as const;

interface ParsedEnum {
  name: string;
  values: string[];
}

function parseEnums(schema: string): ParsedEnum[] {
  const enums: ParsedEnum[] = [];
  // `[\s\S]` plutôt que le drapeau `s` : compatible avec toutes les cibles.
  const blockPattern = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(schema)) !== null) {
    const [, name, body] = match;

    const values = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));

    if (values.length > 0) {
      enums.push({ name, values });
    }
  }

  return enums;
}

function render(enums: ParsedEnum[]): string {
  const blocks = enums.map(({ name, values }) => {
    const union = values.map((v) => `  | '${v}'`).join('\n');
    return `export type ${name} =\n${union};\n\n// Valeurs, pour itérer dans un menu ou un filtre.\nexport const ${toConstName(name)}: readonly ${name}[] = [\n${values
      .map((v) => `  '${v}',`)
      .join('\n')}\n] as const;`;
  });

  return `// ⚠️  FICHIER GÉNÉRÉ — NE PAS MODIFIER À LA MAIN
//
// Produit par Backend/scripts/generate-shared-types.ts depuis schema.prisma.
// Relancer après toute modification d'une énumération :
//
//     cd Backend && npm run types:generate
//
// Les libellés affichés ne sont PAS ici : ils relèvent de l'interface, pas du
// contrat de données. Voir api.types.ts.

${blocks.join('\n\n')}
`;
}

/** ProductCategory → PRODUCT_CATEGORIES, RoleType → ROLE_TYPES */
function toConstName(name: string): string {
  const screaming = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

  // Déjà au pluriel : un suffixe éviterait une collision de nom.
  if (screaming.endsWith('S')) return `${screaming}_VALUES`;
  // Les mots en -Y font -IES : CATEGORY → CATEGORIES, pas CATEGORYS.
  if (screaming.endsWith('Y')) return `${screaming.slice(0, -1)}IES`;

  return `${screaming}S`;
}

function main(): void {
  const schema = readFileSync(SCHEMA, 'utf-8');
  const all = parseEnums(schema);

  const exposed = all.filter((e) =>
    (EXPOSED as readonly string[]).includes(e.name),
  );

  // Une énumération listée mais absente du schéma signale une faute de frappe
  // ou une suppression : mieux vaut échouer bruyamment que produire un fichier
  // incomplet dont personne ne remarquera le manque.
  const missing = EXPOSED.filter(
    (name) => !all.some((e) => e.name === name),
  );
  if (missing.length > 0) {
    console.error(
      `Énumérations introuvables dans schema.prisma : ${missing.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  writeFileSync(OUTPUT, render(exposed), 'utf-8');

  console.log(`${exposed.length} énumérations écrites dans ${OUTPUT}`);
  for (const e of exposed) {
    console.log(`  · ${e.name} (${e.values.length} valeurs)`);
  }
}

main();
