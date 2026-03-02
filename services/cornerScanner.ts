/**
 * Robust client-side QR corner detection with multi-pass preprocessing.
 * 
 * When scanning printed pages (especially via phone camera), QR codes may have
 * low contrast, blur, or uneven lighting. This scanner tries multiple image
 * processing strategies to maximize detection rate.
 */

import { CornerQRData } from '../types';

export type CornerPosition = 'TL' | 'TR' | 'BL' | 'BR';

export interface CornerScanResult {
  position: CornerPosition;
  detected: boolean;
  data: CornerQRData | null;
}

export interface PageCompletenessResult {
  allCornersDetected: boolean;
  cornersFound: number;
  corners: CornerScanResult[];
  cornerData: CornerQRData | null;
  warnings: string[];
}

// Multiple crop fractions to try — some pages may have wider margins
const CROP_FRACTIONS = [0.30, 0.40, 0.25, 0.50];

/**
 * Parse decoded QR text into CornerQRData.
 * Supports both compact keys (new) and full keys (legacy).
 */
function parseCornerData(text: string): CornerQRData | null {
  try {
    const parsed = JSON.parse(text);
    const isCompact = parsed.t === 'corner';
    const isOriginal = parsed.type === 'corner';
    if (isCompact) {
      return {
        type: 'corner',
        studentName: parsed.sn,
        studentId: parsed.si,
        level: parsed.l,
        subject: parsed.sb,
        date: parsed.d,
        examTitle: parsed.et,
        pageNumber: parsed.p,
        totalPages: parsed.tp,
        isFinalPage: parsed.fp,
      };
    }
    if (isOriginal) return parsed as CornerQRData;
  } catch {
    // Not valid JSON
  }
  return null;
}

/**
 * Apply contrast enhancement to ImageData.
 * Stretches the histogram to use full 0-255 range.
 */
function enhanceContrast(imageData: ImageData, factor: number = 1.5): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const mid = 128;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, mid + (data[i] - mid) * factor));
    data[i + 1] = Math.min(255, Math.max(0, mid + (data[i + 1] - mid) * factor));
    data[i + 2] = Math.min(255, Math.max(0, mid + (data[i + 2] - mid) * factor));
  }
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Convert ImageData to high-contrast black & white using adaptive threshold.
 */
function thresholdBW(imageData: ImageData, threshold: number = 128): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = gray < threshold ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply sharpening to ImageData using a simple unsharp mask approach.
 */
function sharpen(imageData: ImageData): ImageData {
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  
  // Simple 3x3 sharpen kernel: center=5, neighbors=-1
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const val = 5 * src[idx + c]
          - src[((y - 1) * w + x) * 4 + c]
          - src[((y + 1) * w + x) * 4 + c]
          - src[(y * w + x - 1) * 4 + c]
          - src[(y * w + x + 1) * 4 + c];
        out[idx + c] = Math.min(255, Math.max(0, val));
      }
    }
  }
  return new ImageData(out, w, h);
}

/**
 * Try to detect a QR code in the given ImageData with multiple preprocessing strategies.
 */
async function tryDecodeQR(
  jsQR: (data: Uint8ClampedArray, width: number, height: number, options?: object) => { data: string } | null,
  regionData: ImageData
): Promise<string | null> {
  const strategies = [
    // Pass 1: Raw image
    () => regionData,
    // Pass 2: Contrast enhanced
    () => enhanceContrast(regionData, 1.5),
    // Pass 3: Strong contrast
    () => enhanceContrast(regionData, 2.0),
    // Pass 4: Threshold B&W (light threshold)
    () => thresholdBW(regionData, 140),
    // Pass 5: Threshold B&W (dark threshold)
    () => thresholdBW(regionData, 100),
    // Pass 6: Threshold after contrast
    () => thresholdBW(enhanceContrast(regionData, 1.8), 128),
    // Pass 7: Sharpen then threshold
    () => thresholdBW(sharpen(regionData), 128),
    // Pass 8: Sharpen only
    () => sharpen(regionData),
  ];

  for (const strategy of strategies) {
    const processed = strategy();
    const result = jsQR(processed.data, processed.width, processed.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (result?.data) return result.data;
  }
  return null;
}

/**
 * Scale up a region for better QR detection on small/low-res crops.
 */
function scaleUpRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, scale: number): ImageData {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.round(w * scale);
  tempCanvas.height = Math.round(h * scale);
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = 'high';
  // Draw the region scaled up
  tempCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, tempCanvas.width, tempCanvas.height);
  return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
}

/**
 * Scan all 4 corners of an image for QR codes.
 * Uses multiple crop sizes, preprocessing, and scale-up strategies.
 */
export async function scanPageCorners(imageDataUrl: string): Promise<PageCompletenessResult> {
  const jsQR = (await import('jsqr')).default;
  
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  console.log(`[CornerScanner] Image size: ${img.width}x${img.height}`);

  const cornerResults: Map<CornerPosition, CornerScanResult> = new Map();
  const positions: CornerPosition[] = ['TL', 'TR', 'BL', 'BR'];
  positions.forEach(p => cornerResults.set(p, { position: p, detected: false, data: null }));

  let firstCornerData: CornerQRData | null = null;

  // Try each crop fraction size
  for (const fraction of CROP_FRACTIONS) {
    // Stop if we already found at least one corner with data
    if (firstCornerData) break;

    const cropW = Math.floor(img.width * fraction);
    const cropH = Math.floor(img.height * fraction);

    const regions: { position: CornerPosition; x: number; y: number }[] = [
      { position: 'TL', x: 0, y: 0 },
      { position: 'TR', x: img.width - cropW, y: 0 },
      { position: 'BL', x: 0, y: img.height - cropH },
      { position: 'BR', x: img.width - cropW, y: img.height - cropH },
    ];

    for (const region of regions) {
      if (cornerResults.get(region.position)!.detected) continue;

      // Try at original scale
      const regionData = ctx.getImageData(region.x, region.y, cropW, cropH);
      let decoded = await tryDecodeQR(jsQR, regionData);

      // If not found, try scaled up (2x) for small QR codes
      if (!decoded && (cropW < 400 || cropH < 400)) {
        const scaledData = scaleUpRegion(ctx, region.x, region.y, cropW, cropH, 2);
        decoded = await tryDecodeQR(jsQR, scaledData);
      }

      if (decoded) {
        const data = parseCornerData(decoded);
        if (data) {
          cornerResults.set(region.position, { position: region.position, detected: true, data });
          if (!firstCornerData) firstCornerData = data;
          console.log(`[CornerScanner] ✓ ${region.position} detected (fraction=${fraction})`);
        } else {
          // QR found but not our format
          cornerResults.set(region.position, { position: region.position, detected: true, data: null });
        }
      }
    }
  }

  // Last resort: scan the full image for any QR code
  if (!firstCornerData) {
    console.log('[CornerScanner] No corners found in crops, trying full image scan...');
    const fullData = ctx.getImageData(0, 0, img.width, img.height);
    const decoded = await tryDecodeQR(jsQR, fullData);
    if (decoded) {
      const data = parseCornerData(decoded);
      if (data) {
        firstCornerData = data;
        // Mark at least one corner as found
        cornerResults.set('TL', { position: 'TL', detected: true, data });
        console.log('[CornerScanner] ✓ QR found via full-image scan');
      }
    }
    
    // Also try scaled-up full image (for low-res captures)
    if (!firstCornerData && (img.width < 1200 || img.height < 1200)) {
      console.log('[CornerScanner] Trying scaled-up full image...');
      const scaledCanvas = document.createElement('canvas');
      const scale = 2;
      scaledCanvas.width = img.width * scale;
      scaledCanvas.height = img.height * scale;
      const scaledCtx = scaledCanvas.getContext('2d')!;
      scaledCtx.imageSmoothingEnabled = true;
      scaledCtx.imageSmoothingQuality = 'high';
      scaledCtx.drawImage(img, 0, 0, scaledCanvas.width, scaledCanvas.height);
      const scaledData = scaledCtx.getImageData(0, 0, scaledCanvas.width, scaledCanvas.height);
      const decodedScaled = await tryDecodeQR(jsQR, scaledData);
      if (decodedScaled) {
        const data = parseCornerData(decodedScaled);
        if (data) {
          firstCornerData = data;
          cornerResults.set('TL', { position: 'TL', detected: true, data });
          console.log('[CornerScanner] ✓ QR found via scaled full-image scan');
        }
      }
    }
  }

  const corners = Array.from(cornerResults.values());
  const cornersFound = corners.filter(c => c.detected).length;
  const warnings: string[] = [];

  if (cornersFound === 0) {
    warnings.push('No QR codes detected. Try improving lighting, reducing glare, or using the crop tool to remove excess background.');
  } else if (cornersFound < 4) {
    const missing = corners.filter(c => !c.detected).map(c => {
      const labels: Record<CornerPosition, string> = {
        TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right'
      };
      return labels[c.position];
    });
    warnings.push(`Missing corners: ${missing.join(', ')}. The page may be partially cropped.`);
  }

  console.log(`[CornerScanner] Result: ${cornersFound}/4 corners, data=${!!firstCornerData}`);

  return {
    allCornersDetected: cornersFound === 4,
    cornersFound,
    corners,
    cornerData: firstCornerData,
    warnings,
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
