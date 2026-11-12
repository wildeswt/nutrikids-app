# @nutrikids/who-growth

Pure TypeScript library (no Node or React Native runtime dependencies) implementing WHO child growth standard z-score calculations using the LMS method (Cole, 1990). Used by both the mobile application and the API to guarantee identical offline and server results.

## API

| Function / Constant                                | Description                                                    |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `calculateZScore(x, L, M, S)`                      | `((x/M)^L − 1)/(L·S)`; if `L = 0`, `ln(x/M)/S`                 |
| `measurementFromZScore(z, L, M, S)`                | Inverse: `M·(1 + L·S·z)^(1/L)`; if `L = 0`, `M·exp(S·z)`       |
| `zScoreCurves(L, M, S)`                            | Measurements for curves −3, −2, 0, +2, +3 for plotting         |
| `percentileFromZScore(z)`                          | Percentile 0–100 using standard normal CDF                     |
| `ageInMonths(birthDate, checkupDate)`              | Completed months (`YYYY-MM-DD` or `Date`, in UTC)              |
| `adjustLengthHeight(valueCm, measuredIn, tableIn)` | 0.7 cm correction between recumbent length and standing height |
| `classify(zs, cutoffs?)`                           | Risk categories, primary classification, and alert status      |
| `getLmsParameters(indicator, sex, x, position?)`   | Reference LMS parameters from WHO 2006 (offline tables)        |
| `WHO_REFERENCE_VERSION`                            | Reference version (`'WHO 2006'`)                               |

`calculateZScore` returns Cole's LMS z-score without the WHO restricted spline adjustment for |z| > 3.

## Classification (Strict Comparisons)

| Category             | Default Criterion            |
| -------------------- | ---------------------------- |
| `SEVERE_WASTING`     | W/LH < −3 (highest priority) |
| `WASTING`            | W/LH < −2                    |
| `SEVERE_STUNTING`    | H/A < −3                     |
| `STUNTING`           | H/A < −2                     |
| `SEVERE_UNDERWEIGHT` | W/A < −3                     |
| `UNDERWEIGHT`        | W/A < −2                     |
| `OBESITY`            | BMI/A > +3                   |
| `OVERWEIGHT`         | W/LH > +2 (see below)        |
| `OVERWEIGHT_RISK`    | BMI/A > +1                   |

At z = −2.00 or +2.00, strict inequalities apply. Severe category replaces moderate category for the same indicator. `primary` is the highest priority category (order of `RISK_CATEGORIES`), and `hasAlert` is `true` when not `NORMAL`.

### Overweight: W/LH vs BMI/A

The project specification references overweight by W/LH > +2 (operational solution) and BMI/A > +2 (theoretical framework). Both cutoffs (`overweightWFLH`, `overweightBFA`) are configurable, and `overweightCriterion` selects which one triggers `OVERWEIGHT` and an alert:

- `'WFLH'` (default): W/LH > +2, matching the operational solution.
- `'BFA'`: BMI/A > +2.
- `'both'`: either of the two.

`OVERWEIGHT_RISK` and `OBESITY` are always derived from BMI/A.

## Testing

```bash
pnpm --filter @nutrikids/who-growth test
```
