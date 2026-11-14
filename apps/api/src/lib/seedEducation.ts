/**
 * Seed de contenido educativo sobre alimentación (RF-18, NK-40): 5 artículos en español por
 * cada tramo de edad (12-23, 24-35, 36-47 y 48-60 meses, el rango de los patrones OMS).
 *
 * Es contenido de referencia (no datos de niños), así que se siembra en todos los entornos.
 * Idempotente: cada artículo tiene un id fijo y se inserta o actualiza (`upsert`), de modo que
 * volver a correr el seed no duplica y corregir un texto aquí lo corrige en la base.
 * El contenido es orientativo y en lenguaje sencillo; no reemplaza la consulta con el profesional.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

export interface EducationSeedArticle {
  id: string;
  title: string;
  body: string;
  minAgeMonths: number;
  maxAgeMonths: number;
  language: string;
}

/** Tramos de edad en meses (inclusivos) cubiertos por el seed. */
export const EDUCATION_AGE_BANDS = [
  { min: 12, max: 23 },
  { min: 24, max: 35 },
  { min: 36, max: 47 },
  { min: 48, max: 60 },
] as const;

/** Id fijo y válido (UUID v4) del artículo `n` (1-20); permite el upsert idempotente. */
const articleId = (n: number): string =>
  `e0000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

type Draft = readonly [title: string, body: string];

/** Cinco artículos por tramo, en el mismo orden que `EDUCATION_AGE_BANDS`. */
const DRAFTS: readonly (readonly Draft[])[] = [
  // 12 a 23 meses
  [
    [
      'Cuántas comidas necesita tu hijo',
      'A esta edad tu hijo come cinco veces al día: desayuno, almuerzo y cena, más una o dos colaciones. Su estómago es pequeño, por eso necesita comer poco y seguido. Ofrece porciones pequeñas y deja que pida más si quiere.',
    ],
    [
      'La leche materna sigue siendo valiosa',
      'Si todavía toma pecho, puedes seguir dándolo hasta los dos años o más, además de las comidas. Dale el pecho después de comer, para que primero coma sus alimentos. La leche materna le aporta defensas y energía.',
    ],
    [
      'Alimentos con hierro para crecer fuerte',
      'El hierro ayuda a que tu hijo crezca y piense bien. Lo encuentras en hígado, carne, pollo, pescado, huevo, lentejas, fréjol y verduras de hoja verde. Combínalos con frutas como naranja o mandarina para que el cuerpo aproveche mejor el hierro.',
    ],
    [
      'Textura y tamaño seguros para evitar atragantamientos',
      'Corta los alimentos en trozos pequeños y blandos. Evita dar enteros: uvas, nueces, maní, caramelos duros, salchichas en rodajas y trozos de manzana crudos. Tu hijo debe comer sentado y acompañado por un adulto.',
    ],
    [
      'Sin azúcar ni sal de más',
      'No es necesario agregar azúcar ni mucha sal a las comidas de tu hijo. Evita las gaseosas, los jugos de caja y las golosinas: llenan la barriga sin alimentar. Para tomar, ofrece agua segura y leche.',
    ],
  ],
  // 24 a 35 meses
  [
    [
      'Un plato variado cada día',
      'Trata de que el plato de tu hijo tenga colores: algo de cereal o tubérculo (arroz, papa, yuca), una proteína (huevo, pescado, pollo, menestra), verduras y una fruta. Cuantos más colores, más vitaminas recibe.',
    ],
    [
      'Cuando tu hijo no quiere comer',
      'Es normal que a esta edad coma menos o rechace alimentos nuevos. No lo obligues ni lo castigues. Ofrece el alimento varias veces, en porciones pequeñas y de formas distintas. A veces necesita probarlo más de diez veces.',
    ],
    [
      'Frutas y verduras todos los días',
      'Ofrece al menos una fruta y una verdura cada día; mejor si son de la temporada y de tu zona, porque son más baratas y frescas. Lava bien las frutas y verduras antes de servirlas.',
    ],
    [
      'Lavarse las manos antes de comer',
      'Lava las manos de tu hijo y las tuyas con agua y jabón antes de preparar y de servir los alimentos, y después de ir al baño. Así evitas diarreas, que le quitan el apetito y el peso que ha ganado.',
    ],
    [
      'Agua segura para tomar',
      'El agua es la mejor bebida. Dale agua hervida o tratada durante el día. Las bebidas azucaradas, como gaseosas y jugos industriales, dañan los dientes y aumentan el riesgo de sobrepeso.',
    ],
  ],
  // 36 a 47 meses
  [
    [
      'Las tres comidas y dos colaciones',
      'A esta edad tu hijo sigue necesitando desayuno, almuerzo, cena y dos colaciones. Una buena colación es una fruta, un pedazo de queso, un huevo duro o un puñado de tostado. Evita las papas fritas y los dulces de paquete.',
    ],
    [
      'Que coma en familia',
      'Comer juntos, sin televisión ni celular, ayuda a que tu hijo aprenda a comer bien. Los niños copian lo que ven: si ven a su familia comer verduras, es más fácil que las acepten.',
    ],
    [
      'Menestras y granos: proteína económica',
      'Las lentejas, el fréjol, el garbanzo y las habas dan proteína y hierro a bajo costo. Mézclalos con arroz o con maíz y, si puedes, agrega un poco de carne, huevo o pescado. Cocínalos bien y sírvelos molidos o bien blandos.',
    ],
    [
      'No uses la comida como premio ni castigo',
      'Evita decir "si te portas bien te doy un dulce" o "si no comes no sales". Así el niño aprende a comer por emociones y no por hambre. Premia con un paseo, un juego o un abrazo.',
    ],
    [
      'Revisa el peso y la talla con el profesional',
      'Llevar a tu hijo a sus controles permite saber si está creciendo bien. Si el profesional te da recomendaciones de alimentación, anótalas y pregunta lo que no entiendas. Ahí puedes contar cómo come tu hijo en la semana.',
    ],
  ],
  // 48 a 60 meses
  [
    [
      'Porciones del tamaño de su mano',
      'Una porción para tu hijo es más pequeña que la tuya. Sirve poco y deja que repita. No lo obligues a terminar el plato: aprende a reconocer cuándo está lleno, lo que ayuda a evitar el sobrepeso.',
    ],
    [
      'Colaciones saludables para la escuela',
      'Si tu hijo va a la escuela o al centro infantil, envía una colación de fruta, un sánduche con queso, yogur natural o frutos secos molidos. Incluye una botella de agua. Evita las papas fritas, los dulces y los jugos de caja.',
    ],
    [
      'Menos azúcar, más cuidado de los dientes',
      'El azúcar de golosinas y bebidas azucaradas causa caries. Deja los dulces para ocasiones especiales y cepilla los dientes de tu hijo después de comer, al menos antes de dormir.',
    ],
    [
      'Actividad y juego cada día',
      'Además de comer bien, tu hijo necesita correr, saltar y jugar varias horas al día. Limita el tiempo frente a pantallas. La actividad ayuda a crecer sano y a mantener un peso adecuado.',
    ],
    [
      'Ayuda a preparar la comida',
      'Invita a tu hijo a lavar frutas, mezclar o servir. Participar le da ganas de probar lo que preparó. Mantén fuera de su alcance los cuchillos y el fuego.',
    ],
  ],
];

/** Los 20 artículos del seed (5 por tramo, idioma `es`). */
export const EDUCATION_SEED: readonly EducationSeedArticle[] = DRAFTS.flatMap((band, bandIndex) =>
  band.map(([title, body], i) => ({
    id: articleId(bandIndex * 5 + i + 1),
    title,
    body,
    minAgeMonths: EDUCATION_AGE_BANDS[bandIndex]!.min,
    maxAgeMonths: EDUCATION_AGE_BANDS[bandIndex]!.max,
    language: 'es',
  })),
);

/** Inserts or updates the seed articles. Returns how many were processed. */
export async function seedEducationalContent(client?: PrismaClient): Promise<number> {
  const shouldDisconnect = !client;
  const prisma =
    client ??
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: env.DIRECT_URL ?? env.DATABASE_URL }),
    });

  try {
    for (const { id, ...data } of EDUCATION_SEED) {
      await prisma.educationalContent.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }
    console.log(`Contenido educativo: ${EDUCATION_SEED.length} artículos sembrados (es).`);
    return EDUCATION_SEED.length;
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}
