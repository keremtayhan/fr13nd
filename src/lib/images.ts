// Shared image encoding for fr13nd's vision: downscale to a sane long-edge and
// re-encode as JPEG so the base64 payload stays small. Used by the AGENT chat
// (paste/attach) and CRAFT (show fr13nd your work).
export interface EncodedImage {
  url: string; // data URL, for thumbnails
  media: string; // media_type for the Anthropic image block
  data: string; // base64 (no data: prefix)
}

export async function encodeImageFile(file: File, max = 1568, quality = 0.85): Promise<EncodedImage | null> {
  if (!file.type.startsWith('image/')) return null;
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('bad image'));
    im.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', quality);
  return { url: out, media: 'image/jpeg', data: out.split(',')[1] ?? '' };
}
