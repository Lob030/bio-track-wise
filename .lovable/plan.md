# QR de cajas + deep-link con resaltado

Permite generar un código QR por caja que, al escanearse, abre la app directamente en la ruta de esa caja (`/rodents/boxes?box=<ID>` o `/insects/boxes?box=<ID>`), resaltando y haciendo scroll automático a la caja.

## Qué se construye

1. **Dependencia QR** — Instalar `qrcode.react`.

2. **Botón "QR" en cada card de caja** (`src/components/boxes-view.tsx`)
   - El footer de cada card pasa de `grid-cols-2` a `grid-cols-3`.
   - Nuevo botón "QR" entre "Editar" y "Eliminar" que abre el diálogo (`onClick={() => setQrBox(b)}`).
   - Estado nuevo en `BoxesView`: `const [qrBox, setQrBox] = useState<any | null>(null);`

3. **Diálogo de QR**
   - `Dialog` controlado por `qrBox`, con `DialogContent id="qr-dialog"`.
   - Renderiza `<QRCodeSVG>` con la URL `${window.location.origin}/${kind === "rodent" ? "rodents" : "insects"}/boxes?box=${qrBox.id}`.
   - Muestra la URL en texto y un botón "Descargar QR" que serializa el SVG (XMLSerializer + Blob) y lo descarga como `QR-<code>.svg` (sin html2canvas).

4. **Deep-link en las rutas de cajas**
   - `src/routes/rodents.boxes.tsx` y `src/routes/insects.boxes.tsx`: añadir `validateSearch` que lee `box` (string | undefined) y pasar `highlightBoxId={box}` a `BoxesView` vía `Route.useSearch()`.

5. **Resaltado + scroll en `BoxesView`**
   - Nueva prop opcional: `highlightBoxId?: string`.
   - Cada `Card` recibe `id={\`box-card-${b.id}\`}`.
   - `useEffect([highlightBoxId])`: hace `scrollIntoView` al card y aplica un `ring` durante 3s.

## Detalles técnicos

- **Imports nuevos en `boxes-view.tsx`:** `QRCodeSVG` desde `qrcode.react`; `QrCode` desde `lucide-react` (añadir a la línea de import existente, junto a `Download` que ya está importado); añadir `DialogDescription` al import de `@/components/ui/dialog` (actualmente no está) y `useEffect` al import de `react`.
- **Firma del componente:** `export function BoxesView({ kind, highlightBoxId }: { kind: Kind; highlightBoxId?: string })`.
- **Rutas:** patrón
  ```tsx
  export const Route = createFileRoute("/rodents/boxes")({
    validateSearch: (search: Record<string, unknown>) => ({
      box: typeof search.box === "string" ? search.box : undefined,
    }),
    component: RouteComponent,
  });
  function RouteComponent() {
    const { box } = Route.useSearch();
    return <BoxesView kind="rodent" highlightBoxId={box} />;
  }
  ```
  (igual para `insects` con `kind="insect"`).
- **Diálogo QR** se inserta antes del `Dialog` de nacimiento (línea ~1017).
- **Descarga SVG:** seleccionar `#qr-dialog svg`, `XMLSerializer().serializeToString`, `Blob` tipo `image/svg+xml`, `URL.createObjectURL`, click en `<a download>`, `revokeObjectURL`.

## Verificación

- TypeScript estricto sin errores; el build debe pasar.
- Escanear el QR abre la ruta correcta según el tipo de caja.
- Al cargar `?box=<ID>` la caja correspondiente hace scroll y muestra el ring ~3s.
