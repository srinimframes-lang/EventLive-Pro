import {
  SHARE_THUMB_HEIGHT,
  SHARE_THUMB_WIDTH,
  thumbnailOverlayCopy,
} from './shareThumbnailMeta.js';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@500;600&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap';

let fontsPromise = null;

function loadStylesheet(href) {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[data-elp-thumb-font="1"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-elp-thumb-font', '1');
  document.head.appendChild(link);
}

async function ensureThumbnailFonts() {
  if (typeof document === 'undefined') return;
  if (!fontsPromise) {
    loadStylesheet(FONT_HREF);
    fontsPromise = (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        await Promise.allSettled([
          document.fonts.load('700 72px "Playfair Display"'),
          document.fonts.load('700 32px Cinzel'),
          document.fonts.load('600 22px Inter'),
        ]);
      } catch {
        /* system serif/sans fallbacks still render */
      }
    })();
  }
  return fontsPromise;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    if (typeof src === 'string' && /^https?:/i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load couple photo for thumbnail'));
    img.src = src;
  });
}

async function sourceToImage(source) {
  if (!source) throw new Error('Upload a couple photo first');
  if (typeof source === 'string') return loadImage(source);
  if (source instanceof Blob) {
    const url = URL.createObjectURL(source);
    try {
      return await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  throw new Error('Unsupported image source');
}

/**
 * Cover-crop the photo into 16:9, biased toward the upper third so faces stay in frame.
 */
function drawCoverImage(ctx, img, width, height) {
  const ir = img.naturalWidth / img.naturalHeight || 1;
  const cr = width / height;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > cr) {
    dh = height;
    dw = img.naturalWidth * (height / img.naturalHeight);
    dx = (width - dw) / 2;
    dy = 0;
  } else {
    dw = width;
    dh = img.naturalHeight * (width / img.naturalWidth);
    dx = 0;
    const focusY = 0.32;
    dy = Math.max(height - dh, Math.min(0, height / 2 - dh * focusY));
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function wrapHeadline(ctx, text, maxWidth) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (ctx.measureText(raw).width <= maxWidth) return [raw];

  const weds = /\s+Weds\s+/i;
  if (weds.test(raw)) {
    const [left, right] = raw.split(weds);
    const line1 = `${left.trim()} Weds`;
    const line2 = (right || '').trim();
    if (line2 && ctx.measureText(line1).width <= maxWidth && ctx.measureText(line2).width <= maxWidth) {
      return [line1, line2];
    }
  }

  const words = raw.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function fitHeadlineSize(ctx, text, maxWidth, maxPx, minPx) {
  let size = maxPx;
  ctx.font = `700 ${size}px "Playfair Display", Palatino, Georgia, serif`;
  while (size > minPx && wrapHeadline(ctx, text, maxWidth).some((line) => ctx.measureText(line).width > maxWidth)) {
    size -= 2;
    ctx.font = `700 ${size}px "Playfair Display", Palatino, Georgia, serif`;
  }
  return size;
}

/**
 * Render a 1280x720 YouTube Live-style wedding thumbnail.
 * @returns {Promise<{ blob: Blob, file: File, dataUrl: string }>}
 */
export async function generateYoutubeThumbnail({ source, event, settings }) {
  await ensureThumbnailFonts();
  const img = await sourceToImage(source);
  const copy = thumbnailOverlayCopy(event, settings);
  const width = SHARE_THUMB_WIDTH;
  const height = SHARE_THUMB_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.fillStyle = '#0b0610';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawCoverImage(ctx, img, width, height);

  const vignette = ctx.createRadialGradient(
    width / 2,
    height * 0.42,
    height * 0.18,
    width / 2,
    height * 0.5,
    height * 0.78
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(6,3,10,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const wash = ctx.createLinearGradient(0, height * 0.32, 0, height);
  wash.addColorStop(0, 'rgba(8,4,14,0)');
  wash.addColorStop(0.42, 'rgba(8,4,14,0.28)');
  wash.addColorStop(1, 'rgba(8,4,14,0.88)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  const margin = 80;
  const maxText = width - margin * 2;
  const headline = copy.headline || 'Wedding Live';
  const size = fitHeadlineSize(ctx, headline, maxText, 78, 40);
  ctx.font = `700 ${size}px "Playfair Display", Palatino, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFF6E8';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 3;
  const lines = wrapHeadline(ctx, headline, maxText);
  const lineHeight = size * 1.08;
  let y = height - 248 - (lines.length - 1) * lineHeight;
  for (const line of lines) {
    ctx.fillText(line, width / 2, y);
    y += lineHeight;
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  const ruleY = y - lineHeight * 0.15;
  ctx.strokeStyle = '#E4C57A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 92, ruleY);
  ctx.lineTo(width / 2 + 92, ruleY);
  ctx.stroke();

  ctx.font = '700 28px Cinzel, Palatino, Georgia, serif';
  ctx.fillStyle = '#E8C872';
  ctx.letterSpacing = '4px';
  ctx.fillText(copy.subtitle.toUpperCase(), width / 2, ruleY + 48);
  ctx.letterSpacing = '0px';

  ctx.textAlign = 'left';
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,246,232,0.92)';
  ctx.fillText(copy.brand, margin, height - 48);

  if (copy.url) {
    ctx.textAlign = 'right';
    ctx.font = '500 20px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,246,232,0.82)';
    ctx.fillText(copy.url, width - margin, height - 48);
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('Thumbnail export failed'))),
      'image/jpeg',
      0.92
    );
  });
  const file = new File([blob], 'youtube-thumbnail.jpg', { type: 'image/jpeg' });
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return { blob, file, dataUrl };
}
