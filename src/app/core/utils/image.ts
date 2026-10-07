export interface ImageUpload {
  name: string;
  dataUrl: string;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This file is not a readable image.'));
    img.src = src;
  });
}

/**
 * Reads an image file and, if it is large, resizes it in a canvas to ~1600px (longest edge)
 * and re-encodes it as JPEG so uploads stay small.
 */
export async function compressImage(file: File, maxDimension = MAX_DIMENSION): Promise<ImageUpload> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  const original = await readAsDataUrl(file);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';

  let img: HTMLImageElement;
  try {
    img = await loadImage(original);
  } catch {
    // e.g. HEIC on desktop browsers: send as-is
    return { name: file.name, dataUrl: original };
  }

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const smallEnough = longest <= maxDimension && file.size <= 400 * 1024;
  if (smallEnough) return { name: file.name, dataUrl: original };

  const scale = Math.min(1, maxDimension / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { name: file.name, dataUrl: original };
  ctx.fillStyle = '#ffffff'; // flatten transparent PNGs
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { name: `${baseName}.jpg`, dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY) };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy copy */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
