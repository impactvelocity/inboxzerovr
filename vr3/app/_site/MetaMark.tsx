/**
 * Meta's infinity mark drawn in pixels (26 x 12), the one in the Devpost images
 * (devpost-images/assets/meta-mark.svg), kept as code here because the repo does not store .svg files.
 */
export function MetaMark({ height = 12 }: { height?: number }) {
  return (
    <svg viewBox="0 0 26 12" height={height} width={(height * 26) / 12} shapeRendering="crispEdges" aria-hidden className="meta-mark">
      <path fill="#0864e6" d="M0 5h1v2h-1zM1 3h1v6h-1zM2 2h1v8h-1zM3 1h1v3h-1zM3 8h1v3h-1zM4 1h1v2h-1zM4 9h1v2h-1zM5 0h1v3h-1zM5 9h1v3h-1zM6 0h1v3h-1zM6 9h1v3h-1z" />
      <path fill="#1a7ef2" d="M7 1h1v2h-1zM7 9h1v2h-1zM8 1h1v2h-1zM8 9h1v2h-1zM9 1h1v3h-1zM9 8h1v3h-1zM10 2h1v3h-1zM10 7h1v3h-1zM11 3h1v6h-1zM12 4h1v4h-1z" />
      <path fill="#2f98fb" d="M13 4h1v4h-1zM14 3h1v6h-1zM15 2h1v3h-1zM15 7h1v3h-1zM16 1h1v3h-1zM16 8h1v3h-1zM17 1h1v2h-1zM17 9h1v2h-1zM18 1h1v2h-1zM18 9h1v2h-1zM19 0h1v3h-1zM19 9h1v3h-1z" />
      <path fill="#4db3ff" d="M20 0h1v3h-1zM20 9h1v3h-1zM21 1h1v2h-1zM21 9h1v2h-1zM22 1h1v3h-1zM22 8h1v3h-1zM23 2h1v8h-1zM24 3h1v6h-1zM25 5h1v2h-1z" />
    </svg>
  );
}
