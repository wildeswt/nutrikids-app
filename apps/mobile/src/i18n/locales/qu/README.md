# Kichwa (`qu`)

> **Estado: BORRADOR AUTOMÁTICO.** Estos archivos se generaron con traducción automática para
> tener una base. **No están revisados por hablantes nativos** y pueden tener errores de
> vocabulario, gramática o variante dialectal. Deben revisarse antes de publicar la app.
> Mientras tanto, el selector de idioma muestra el aviso "traducción en revisión" al elegir Kichwa.

El español (`../es`) es el idioma base: toda clave que falte aquí se muestra en español.

## Qué está traducido

- Todos los namespaces: `common`, `auth`, `caregiver`, `consent`, `professional`, `errors`.
- **Excepción:** el documento legal del consentimiento (`consent.json` → `documents.v1`) **no**
  se tradujo automáticamente. Se muestra en español, con un aviso, hasta que exista una
  traducción revisada y aprobada (ver "Reglas").
- Nombres de meses: vienen de `common.json` → `date.months` (calendario kichwa: kulla, panchi,
  pawkar, ayriwa, aymuray, raymi, sitwa, karwa, kuski, wayru, sasi, kapak), con el formato
  `date.long` ("18 wayru killa 2026") y `date.short` ("16 wayru"). Deben validarse con hablantes
  de la zona: en algunas comunidades se usan los nombres de los meses en español.
- Fechas numéricas, horas y decimales usan formato español de Ecuador (`es-EC`), porque los datos
  de idioma del teléfono para `qu` corresponden al quechua de Perú. Ver
  `INTL_LOCALE_BY_LANGUAGE` en `src/i18n/resources.ts`.

## Glosario usado en el borrador (a validar)

| Español             | Kichwa (borrador) |
| ------------------- | ----------------- |
| niño / niños        | wawa / wawakuna   |
| peso                | llasay            |
| estatura            | hatunkay          |
| control             | kamay             |
| crecimiento         | wiñay             |
| equipo de salud     | hampik tantanakuy |
| centro de salud     | hampi wasi        |
| consentimiento      | ari nina          |
| retirar (permiso)   | kichuy            |
| contraseña          | pakalla shimi     |
| mensajes            | willaykuna        |
| cuidador            | wawa kamak        |
| profesional (salud) | hampik            |
| volver              | tikray            |
| guardar             | wakaychiy         |

## Cómo revisar o corregir

1. Edita los valores en `qu/<namespace>.json`. No cambies las claves ni las variables entre
   llaves (`{{name}}`, `{{count}}`, etc.).
2. Plurales: el kichwa no marca plural después de un número ("3 wata"), por eso `_one` y
   `_other` tienen el mismo texto.
3. Corre `pnpm --filter mobile test`: el test `i18n.test.ts` verifica que `qu` tenga todas las
   claves de `es` (salvo `documents.*`) y ninguna clave desconocida.
4. Cuando la revisión esté completa, cambia `draft: true` a `false` para `qu` en
   `LANGUAGE_OPTIONS` (`src/i18n/resources.ts`) y actualiza este README.

## Reglas

- `consent.json` → `documents.<versión>` es un texto legal versionado. Agrégalo aquí solo con
  una traducción completa, revisada por hablantes nativos y aprobada por el equipo del proyecto.
- En las vistas del cuidador usa lenguaje sencillo: frases cortas, sin siglas sin explicar.
