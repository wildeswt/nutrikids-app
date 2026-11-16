# Tokens de UI y componentes compartidos (Figma)

Documentacion de referencia para la base visual de `apps/mobile` alineada con Figma (NK-65).

## 1. Paleta de colores (`apps/mobile/src/constants/colors.ts`)

| Token                          | Valor Hex | Uso principal                                                         |
| ------------------------------ | --------- | --------------------------------------------------------------------- |
| `PALETTE.primary`              | `#2D5F5A` | Botones primarios, borde de boton secundario, focos y elementos clave |
| `PALETTE.primaryPressed`       | `#244c48` | Estado presionado de acciones primarias                               |
| `PALETTE.primaryLight`         | `#E8F1F0` | Fondos suaves de seleccion o hover/pressed secundario                 |
| `PALETTE.secondary`            | `#F77E4D` | Acentos, insignias y divisores secundarios                            |
| `PALETTE.secondaryPressed`     | `#e06a39` | Estado presionado secundario                                          |
| `PALETTE.secondaryLight`       | `#FEF2EC` | Fondo suave secundario                                                |
| `PALETTE.background`           | `#FBFBFB` | Fondo general de pantallas                                            |
| `PALETTE.surface`              | `#FBFBFB` | Fondo de tarjetas (`Card`) y superficies elevadas                     |
| `PALETTE.text.title`           | `#575757` | Titulos, encabezados de seccion e icono de retorno                    |
| `PALETTE.text.body`            | `#4D4D4D` | Texto de cuerpo y etiqueta `Volver`                                   |
| `PALETTE.text.muted`           | `#737373` | Texto secundario e informativo                                        |
| `PALETTE.text.light`           | `#FFFFFF` | Texto sobre fondos oscuros/primarios                                  |
| `PALETTE.border.default`       | `#E5E7EB` | Bordes generales                                                      |
| `PALETTE.border.focus`         | `#2D5F5A` | Borde en estado enfocado                                              |
| `PALETTE.border.subtle`        | `#F3F4F6` | Separadores sutiles                                                   |
| `PALETTE.border.input`         | `#E5E5E5` | Borde de 1 px para campos pildora (`PillField`)                       |
| `PALETTE.border.checkbox`      | `#D4D4D8` | Borde para casillas, chips y selectores heredados                     |
| `PALETTE.input.background`     | `#F9F9F9` | Fondo de campos de entrada (`PillField`)                              |
| `PALETTE.input.placeholder`    | `#969696` | Texto placeholder en inputs                                           |
| `PALETTE.feedback.error`       | `#E14100` | Borde, icono y texto de error                                         |
| `PALETTE.feedback.errorBg`     | `#FEE2E2` | Fondo de alertas de error                                             |
| `PALETTE.feedback.errorBorder` | `#FCA5A5` | Borde de contenedores de alerta de error                              |
| `PALETTE.feedback.success`     | `#16A34A` | Estado exitoso                                                        |
| `PALETTE.feedback.successBg`   | `#DCFCE7` | Fondo de exito                                                        |
| `PALETTE.feedback.warning`     | `#D97706` | Estado de advertencia                                                 |
| `PALETTE.feedback.warningBg`   | `#FEF3C7` | Fondo de advertencia                                                  |

## 2. Medidas y sombras (`apps/mobile/src/constants/layout.ts`)

| Constante       | Valor                                                                                           | Uso                                                 |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `SCREEN_MARGIN` | `30`                                                                                            | Margen horizontal estandar de pantalla              |
| `RADIUS_PILL`   | `25`                                                                                            | Radio de esquinas para botones, campos y tarjetas   |
| `FIELD_HEIGHT`  | `50`                                                                                            | Altura del contenedor de `PillField`                |
| `BUTTON_WIDTH`  | `318`                                                                                           | Ancho maximo de `PrimaryButton` y `SecondaryButton` |
| `BUTTON_HEIGHT` | `50`                                                                                            | Altura fija de `PrimaryButton` y `SecondaryButton`  |
| `CARD_SHADOW`   | Negro (`#000000`), opacidad `0.25`, radio `8`, offset `{ width: 0, height: 0 }`, `elevation: 4` | Sombra estandar para `Card`                         |

## 3. Tipografia (`apps/mobile/src/constants/typography.ts`)

Las variantes de **Inter** (`Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`) se cargan al iniciar la app en `apps/mobile/src/app/_layout.tsx` manteniendo el splash visible hasta completar la carga. Si la carga falla, la aplicacion continua con la fuente del sistema sin bloquearse.

```ts
import { font } from '@/constants/typography';

font('regular'); // 'Inter_400Regular'
font('medium'); // 'Inter_500Medium'
font('semibold'); // 'Inter_600SemiBold'
```

## 4. Componentes compartidos (`apps/mobile/src/components/ui/`)

Todos aceptan `testID` y `accessibilityRole` configurables.

### `ScreenHeader`

- Renderiza la accion `<- Volver` (flecha `arrow-back` 24 px `#575757` + texto 20 px medium `#4D4D4D`) y el titulo principal (32 px semibold `#575757`).
- Props: `title`, `onBack?`, `showBack?: boolean` (por defecto `true`), `backLabel?: string`, `testID?`, `accessibilityRole?`, `style?`.

```tsx
<ScreenHeader title="Registrar control" onBack={() => router.back()} />
```

### `PillField`

- Renderiza etiqueta de seccion opcional (18 px medium `#575757`), contenedor pildora (altura `50`, radio `25`, fondo `#F9F9F9`, borde 1 px `#E5E5E5` o `#E14100` en error), hijo (`TextInput` o selector), `rightIcon?` y mensaje de error.
- Props: `label?`, `children`, `rightIcon?`, `error?`, `testID?`, `accessibilityRole?`, `style?`, `containerStyle?`.

```tsx
<PillField
  label="Peso"
  error={errors.weight}
  rightIcon={<Ionicons name="scale-outline" size={20} color={PALETTE.text.muted} />}
>
  <TextInput
    value={weight}
    onChangeText={setWeight}
    placeholder="Ej. 11.4"
    placeholderTextColor={PALETTE.input.placeholder}
  />
</PillField>
```

### `PrimaryButton` y `SecondaryButton`

- Botones pildora de ancho maximo `318`, alto `50`, radio `25`, texto 16 px semibold.
- `PrimaryButton`: fondo `#2D5F5A` y texto blanco (`#FFFFFF`).
- `SecondaryButton`: fondo `#FBFBFB`, borde 2 px `#2D5F5A` y texto `#2D5F5A`.
- Props: `label`, `onPress?`, `loading?`, `disabled?`, `testID?`, `accessibilityRole?`, `accessibilityLabel?`, `style?`.

```tsx
<PrimaryButton label="Guardar cambios" onPress={handleSubmit} loading={isSaving} />
<SecondaryButton label="Cancelar" onPress={handleCancel} disabled={isSaving} />
```

### `Card`

- Contenedor con fondo `#FBFBFB`, radio `25`, `padding: 16`, `CARD_SHADOW` y sin borde.
- Props: `children`, `testID?`, `accessibilityRole?`, `style?`.

```tsx
<Card testID="child-summary-card">
  <Text>Resumen del ultimo control</Text>
</Card>
```

## 5. Como migrar una pantalla existente

1. Reemplaza los colores fijos de fondo, inputs, bordes y errores por `PALETTE.*` desde `constants/colors.ts`.
2. Sustituye margenes laterales, radios de pildora, alturas de inputs/botones y sombras manuales por `SCREEN_MARGIN`, `RADIUS_PILL`, `FIELD_HEIGHT`, `BUTTON_WIDTH`, `BUTTON_HEIGHT` y `CARD_SHADOW` desde `constants/layout.ts`.
3. Reemplaza el encabezado manual (boton volver + `h1`) por `<ScreenHeader />`.
4. Envuelve inputs y selectores en `<PillField />` conservando `placeholderTextColor={PALETTE.input.placeholder}` y validaciones existentes.
5. Cambia botones principales y secundarios por `<PrimaryButton />` y `<SecondaryButton />`, y contenedores elevados por `<Card />`.
6. Agrega `font('regular' | 'medium' | 'semibold')` gradualmente en los textos de la pantalla migrada sin alterar textos de i18n ni la logica de negocio.
7. Verifica con `pnpm --filter mobile typecheck`, `pnpm --filter mobile test`, `pnpm lint` y `pnpm format:check`.
