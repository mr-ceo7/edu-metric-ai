/**
 * Client-side QR corner detection for page completeness verification.
 * 
 * Crops the scanned image into 4 quadrants and attempts to decode a QR code
 * from each corner. If all 4 are found, the page is fully captured.
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
  cornerData: CornerQRData | null; // Data from the first successfully decoded corner
  warnings: string[];
}

// Size of the corner crop region as a fraction of the image dimensions
const CORNER_FRACTION = 0.30; // 30% of width/height from each corner

/**
 * Scan all 4 corners of an image for QR codes.
 * Returns which corners were detected and the decoded data.
 */
export async function scanPageCorners(imageDataUrl: string): Promise<PageCompletenessResult> {
  const jsQR = (await import('jsqr')).default;
  
  // Load the image into a canvas
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const cropW = Math.floor(img.width * CORNER_FRACTION);
  const cropH = Math.floor(img.height * CORNER_FRACTION);

  // Define the 4 corner regions
  const regions: { position: CornerPosition; x: number; y: number }[] = [
    { position: 'TL', x: 0, y: 0 },
    { position: 'TR', x: img.width - cropW, y: 0 },
    { position: 'BL', x: 0, y: img.height - cropH },
    { position: 'BR', x: img.width - cropW, y: img.height - cropH },
  ];

  const corners: CornerScanResult[] = [];
  let firstCornerData: CornerQRData | null = null;
  const warnings: string[] = [];

  for (const region of regions) {
    // Extract pixel data from this corner region
    const regionData = ctx.getImageData(region.x, region.y, cropW, cropH);
    
    // Try to decode QR from this region
    const decoded = jsQR(regionData.data, cropW, cropH, {
      inversionAttempts: 'attemptBoth',
    });

    let cornerResult: CornerScanResult = {
      position: region.position,
      detected: false,
      data: null,
    };

    if (decoded) {
      try {
        const parsed = JSON.parse(decoded.data);
        // Support both compact keys (new) and full keys (old/fallback)
        const isCompact = parsed.t === 'corner';
        const isOriginal = parsed.type === 'corner';
        if (isCompact || isOriginal) {
          const data: CornerQRData = isCompact ? {
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
          } : parsed as CornerQRData;
          cornerResult = {
            position: region.position,
            detected: true,
            data,
          };
          if (!firstCornerData) {
            firstCornerData = data;
          }
        }
      } catch {
        // QR found but not our format
        cornerResult.detected = true; // Still counts as a detected QR
      }
    }

    corners.push(cornerResult);
  }

  const cornersFound = corners.filter(c => c.detected).length;

  // Generate warnings based on which corners are missing
  if (cornersFound === 0) {
    warnings.push('No corner QR codes detected. The image may not be an answer sheet, or it may be too blurry.');
  } else if (cornersFound < 4) {
    const missing = corners.filter(c => !c.detected).map(c => {
      const labels: Record<CornerPosition, string> = {
        TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right'
      };
      return labels[c.position];
    });
    warnings.push(`Page appears truncated. Missing corners: ${missing.join(', ')}. Please recapture with the full page visible.`);
  }

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
