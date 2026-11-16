# Kichwa (`qu`)

> **Status: MACHINE-TRANSLATED DRAFT.** These files were produced with machine translation as a
> starting point. **They have not been reviewed by native speakers** and may contain vocabulary,
> grammar or dialect errors. They must be reviewed before the app is released. Meanwhile, the
> language selector shows a "translation under review" notice when Kichwa is selected.

Spanish (`../es`) is the base language: any key missing here is shown in Spanish.

## What is translated

- Every namespace: `common`, `auth`, `caregiver`, `consent`, `professional`, `errors`.
- **Exception:** the consent legal document (`consent.json` → `documents.v1`) was **not**
  machine-translated. It is shown in Spanish, with a notice, until a reviewed and approved
  translation exists (see "Rules").
- Month names: from `common.json` → `date.months` (Kichwa calendar: kulla, panchi, pawkar, ayriwa,
  aymuray, raymi, sitwa, karwa, kuski, wayru, sasi, kapak), with the formats `date.long`
  ("18 wayru killa 2026") and `date.short` ("16 wayru"). They must be validated with local
  speakers: some communities use the Spanish month names.
- Numeric dates, times and decimals use Spanish (Ecuador) formats (`es-EC`), because the device
  language data for `qu` is Peruvian Quechua. See `INTL_LOCALE_BY_LANGUAGE` in
  `src/i18n/resources.ts`.

## Glossary used in the draft (to be validated)

| Spanish             | Kichwa (draft)    |
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
| madre / padre       | mama / yaya       |
| tutor legal         | kamachik kamak    |
| volver              | tikray            |
| guardar             | wakaychiy         |

## How to review or fix

1. Edit the values in `qu/<namespace>.json`. Do not change the keys or the variables in braces
   (`{{name}}`, `{{count}}`, etc.).
2. Plurals: Kichwa does not mark plural after a number ("3 wata"), so `_one` and `_other` have the
   same text.
3. Run `pnpm --filter mobile test`: `i18n.test.ts` checks that `qu` has every `es` key (except
   `documents.*`) and no unknown key.
4. When the review is complete, set `draft: false` for `qu` in `LANGUAGE_OPTIONS`
   (`src/i18n/resources.ts`) and update this README.

## Rules

- `consent.json` → `documents.<version>` is a versioned legal text. Add it here only with a
  complete translation, reviewed by native speakers and approved by the project team.
- Caregiver screens use plain language: short sentences, no unexplained acronyms.
