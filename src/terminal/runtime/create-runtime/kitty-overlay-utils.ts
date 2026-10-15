import type { KittyPlacement } from "../../wasm";

export type KittyDecodedImageLike = {
  width: number;
  height: number;
};

export type KittySlice = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

export function toKittySlice(
  placement: KittyPlacement,
  decoded: KittyDecodedImageLike,
  cellW: number,
  cellH: number,
): KittySlice | null {
  const srcW = decoded.width >>> 0;
  const srcH = decoded.height >>> 0;
  if (!srcW || !srcH) return null;
  if (!placement.width || !placement.height) return null;

  const sxRaw = Math.max(0, Math.min(placement.sourceX >>> 0, srcW));
  const syRaw = Math.max(0, Math.min(placement.sourceY >>> 0, srcH));
  const swMax = Math.max(0, srcW - sxRaw);
  const shMax = Math.max(0, srcH - syRaw);
  const sx = sxRaw;
  const sy = syRaw;
  const sw = Math.max(0, Math.min(placement.sourceWidth >>> 0, swMax));
  const sh = Math.max(0, Math.min(placement.sourceHeight >>> 0, shMax));
  if (!sw || !sh) return null;

  const dx = placement.x * cellW + placement.cellOffsetX;
  const dy = placement.y * cellH + placement.cellOffsetY;
  return {
    sx,
    sy,
    sw,
    sh,
    dx,
    dy,
    dw: placement.width,
    dh: placement.height,
  };
}
