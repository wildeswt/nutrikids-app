# @nutrikids/who-growth

Biblioteca TypeScript pura (sin Node ni React Native) con el cálculo de z-score OMS por el método LMS (Cole, 1990). La usan la app y la API para que el resultado sin conexión sea idéntico al del servidor.

## API

| Función                                          | Descripción                                                     |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `calcularZ(x, L, M, S)`                          | `((x/M)^L − 1)/(L·S)`; si `L = 0`, `ln(x/M)/S`                  |
| `medidaDesdeZ(z, L, M, S)`                       | Inversa: `M·(1 + L·S·z)^(1/L)`; si `L = 0`, `M·exp(S·z)`        |
| `curvasZ(L, M, S)`                               | Medidas de las curvas −3, −2, 0, +2, +3 para dibujar            |
| `percentilDesdeZ(z)`                             | Percentil 0–100 con la CDF normal                               |
| `edadEnMeses(nacimiento, control)`               | Meses cumplidos (`YYYY-MM-DD` o `Date`, en UTC)                 |
| `ajustarLongitudTalla(valor, medidoEn, tablaEn)` | Corrección de 0,7 cm entre longitud (acostado) y talla (de pie) |
| `clasificar(zs, puntosCorte?)`                   | Categorías de `riesgo_t`, la principal y si hay alerta          |

`calcularZ` devuelve el z de Cole sin el ajuste de la OMS para |z| > 3.

## Clasificación (comparaciones estrictas)

| Categoría                  | Criterio por defecto        |
| -------------------------- | --------------------------- |
| `desnutricion_aguda_grave` | P/T < −3 (máxima prioridad) |
| `emaciacion`               | P/T < −2                    |
| `retraso_grave`            | T/E < −3                    |
| `retraso_crecimiento`      | T/E < −2                    |
| `bajo_peso_grave`          | P/E < −3                    |
| `bajo_peso`                | P/E < −2                    |
| `obesidad`                 | IMC/E > +3                  |
| `sobrepeso`                | P/T > +2 (ver abajo)        |
| `riesgo_sobrepeso`         | IMC/E > +1                  |

Con z = −2,00 o +2,00 no se clasifica; la grave reemplaza a la moderada del mismo índice. `principal` es la de mayor prioridad (orden de `RIESGOS_T`) y `alerta` es `true` si no es `normal`.

### Sobrepeso: P/T vs IMC/E

El informe define sobrepeso con P/T > +2 (sección de solución) y con IMC/E > +2 (marco teórico). Ambos puntos de corte (`sobrepesoPT`, `sobrepesoIMCE`) son configurables, y `criterioSobrepeso` elige cuál genera `sobrepeso` y por tanto la alerta:

- `'PT'` (por defecto): P/T > +2, el criterio operativo de la solución.
- `'IMCE'`: IMC/E > +2.
- `'ambos'`: cualquiera de los dos.

`riesgo_sobrepeso` y `obesidad` siempre salen de IMC/E.

## Pruebas

```bash
pnpm --filter @nutrikids/who-growth test
```
