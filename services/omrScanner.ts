/**
 * Client-Side OMR Scanner v5 — Self-Calibrating
 *
 * Strategy:
 * 1. Corner QR detection → coordinate mapper (perspective correction)
 * 2. Y-detection: Periodic fingerprint (proven approach)
 * 3. X-calibration: Auto-detect first bubble X and spacing by sweeping
 *    horizontally at the Y with strongest signal
 * 4. Use calibrated X positions for all strips (consistent per page)
 * 5. Sample bubble interiors to find the darkest (filled) one
 *
 * This approach adapts to any PDF layout without hardcoded constants.
 */

import { Question } from '../types';

// ========== CONSTANTS (coordinate mapper only) ==========
const PDF_W = 595.28;
const PDF_H = 841.89;
const QR_CENTER_OFFSET = 15 + 55 / 2;

const PDF_CORNERS = {
  TL: { x: QR_CENTER_OFFSET, y: QR_CENTER_OFFSET },
  TR: { x: PDF_W - QR_CENTER_OFFSET, y: QR_CENTER_OFFSET },
  BL: { x: QR_CENTER_OFFSET, y: PDF_H - QR_CENTER_OFFSET },
  BR: { x: PDF_W - QR_CENTER_OFFSET, y: PDF_H - QR_CENTER_OFFSET },
};

// ========== TYPES ==========
interface Point { x: number; y: number; }

export interface ClientOMRResult {
  scores: Record<number, number>;
  confidence: Record<number, number>;
  warnings: string[];
}

// ========== COORDINATE MAPPING ==========

function createCoordinateMapper(
  imgCorners: { TL: Point; TR: Point; BL: Point; BR: Point }
) {
  return (pdfX: number, pdfY: number): Point => {
    const u = (pdfX - PDF_CORNERS.TL.x) / (PDF_CORNERS.TR.x - PDF_CORNERS.TL.x);
    const v = (pdfY - PDF_CORNERS.TL.y) / (PDF_CORNERS.BL.y - PDF_CORNERS.TL.y);
    const topX = imgCorners.TL.x + u * (imgCorners.TR.x - imgCorners.TL.x);
    const topY = imgCorners.TL.y + u * (imgCorners.TR.y - imgCorners.TL.y);
    const botX = imgCorners.BL.x + u * (imgCorners.BR.x - imgCorners.BL.x);
    const botY = imgCorners.BL.y + u * (imgCorners.BR.y - imgCorners.BL.y);
    return { x: topX + v * (botX - topX), y: topY + v * (botY - topY) };
  };
}

// ========== QR CORNER DETECTION ==========

async function findQRCenters(
  canvas: HTMLCanvasElement,
  imgW: number,
  imgH: number
): Promise<{ corners: { TL: Point; TR: Point; BL: Point; BR: Point }; found: number }> {
  const jsQR = (await import('jsqr')).default;
  type CK = 'TL' | 'TR' | 'BL' | 'BR';

  const frac = 0.30;
  const cropW = Math.floor(imgW * frac);
  const cropH = Math.floor(imgH * frac);

  const regions: { key: CK; x: number; y: number }[] = [
    { key: 'TL', x: 0, y: 0 },
    { key: 'TR', x: imgW - cropW, y: 0 },
    { key: 'BL', x: 0, y: imgH - cropH },
    { key: 'BR', x: imgW - cropW, y: imgH - cropH },
  ];

  const defaults: Record<CK, Point> = {
    TL: { x: imgW * (QR_CENTER_OFFSET / PDF_W), y: imgH * (QR_CENTER_OFFSET / PDF_H) },
    TR: { x: imgW * (1 - QR_CENTER_OFFSET / PDF_W), y: imgH * (QR_CENTER_OFFSET / PDF_H) },
    BL: { x: imgW * (QR_CENTER_OFFSET / PDF_W), y: imgH * (1 - QR_CENTER_OFFSET / PDF_H) },
    BR: { x: imgW * (1 - QR_CENTER_OFFSET / PDF_W), y: imgH * (1 - QR_CENTER_OFFSET / PDF_H) },
  };

  const corners = { ...defaults };
  let found = 0;

  const cropCanvas = document.createElement('canvas');
  const cropCtx = cropCanvas.getContext('2d')!;

  for (const region of regions) {
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    cropCtx.drawImage(canvas, region.x, region.y, cropW, cropH, 0, 0, cropW, cropH);
    const cropData = cropCtx.getImageData(0, 0, cropW, cropH);
    const decoded = jsQR(cropData.data, cropW, cropH, { inversionAttempts: 'attemptBoth' });
    if (decoded?.location) {
      const loc = decoded.location;
      const cx = (loc.topLeftCorner.x + loc.topRightCorner.x + loc.bottomLeftCorner.x + loc.bottomRightCorner.x) / 4;
      const cy = (loc.topLeftCorner.y + loc.topRightCorner.y + loc.bottomLeftCorner.y + loc.bottomRightCorner.y) / 4;
      corners[region.key] = { x: region.x + cx, y: region.y + cy };
      found++;
    }
  }

  return { corners, found };
}

// ========== PIXEL SAMPLING ==========

function sampleCircleDarkness(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number
): number {
  const pixels = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  let totalGray = 0;
  let count = 0;
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  const r = Math.max(2, Math.round(radius));

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const px = icx + dx;
      const py = icy + dy;
      if (px < 0 || px >= w || py < 0 || py >= h) continue;
      const idx = (py * w + px) * 4;
      totalGray += (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
      count++;
    }
  }

  if (count === 0) return 0;
  return 255 - (totalGray / count);
}

// ========== SELF-CALIBRATING OMR DETECTION ==========

/**
 * Auto-calibrate bubble X positions by finding the periodic signal
 * in the strongest OMR strip. Returns firstBubbleX and spacing in image coords.
 */
function calibrateBubbleX(
  imageData: ImageData,
  imgW: number,
  stripY: number,
  estBubbleDia: number,
  sampleR: number
): { firstX: number; spacing: number } | null {
  // Fine horizontal scan — start AFTER label area (~12% from left)
  // The SCORE: label is within the first ~80pt from page margin.
  // Starting at 12% safely skips it at any resolution.
  const step = Math.max(1, Math.round(estBubbleDia * 0.1));
  const leftStart = Math.round(imgW * 0.12);
  const rightEnd = Math.round(imgW * 0.90);

  const profile: number[] = [];
  const xCoords: number[] = [];

  for (let x = leftStart; x < rightEnd; x += step) {
    profile.push(sampleCircleDarkness(imageData, x, stripY, sampleR));
    xCoords.push(x);
  }

  // Find all peaks above threshold
  interface Peak { x: number; dark: number; }
  const peaks: Peak[] = [];

  for (let i = 2; i < profile.length - 2; i++) {
    if (profile[i] > 12 &&
        profile[i] >= profile[i - 1] && profile[i] >= profile[i + 1] &&
        profile[i] >= profile[i - 2] && profile[i] >= profile[i + 2]) {
      peaks.push({ x: xCoords[i], dark: profile[i] });
    }
  }

  if (peaks.length < 3) return null;

  // Merge very close peaks (within 1/4 bubble diameter — truly overlapping detections)
  const merged: Peak[] = [peaks[0]];
  for (let i = 1; i < peaks.length; i++) {
    const last = merged[merged.length - 1];
    if (peaks[i].x - last.x < estBubbleDia * 0.25) {
      if (peaks[i].dark > last.dark) {
        merged[merged.length - 1] = peaks[i];
      }
    } else {
      merged.push(peaks[i]);
    }
  }

  if (merged.length < 3) return null;

  // Find the longest regularly-spaced subsequence of peaks.
  // Ideal spacing ≈ 1.25× bubble diameter (16pt bubble, 20pt spacing).
  const idealSpacing = estBubbleDia * 1.25;
  let bestRun: Peak[] = [];
  let bestSpacing = 0;
  let bestScore = 0;

  for (let startIdx = 0; startIdx < Math.min(merged.length - 2, 6); startIdx++) {
    for (let refIdx = startIdx + 1; refIdx < Math.min(startIdx + 4, merged.length); refIdx++) {
      const refSpacing = merged[refIdx].x - merged[startIdx].x;

      // Skip spacings outside expected range (0.8× to 2.0× bubble diameter)
      if (refSpacing < estBubbleDia * 0.8 || refSpacing > estBubbleDia * 2.0) continue;

      // Count peaks that match this spacing
      const run: Peak[] = [merged[startIdx], merged[refIdx]];
      let expectedX = merged[refIdx].x + refSpacing;

      for (let j = refIdx + 1; j < merged.length && run.length < 15; j++) {
        if (Math.abs(merged[j].x - expectedX) < refSpacing * 0.3) {
          run.push(merged[j]);
          expectedX = merged[j].x + refSpacing;
        }
      }

      // Score: run length + bonus for spacing near ideal
      const spacingProximity = 1 - Math.abs(refSpacing - idealSpacing) / idealSpacing;
      const score = run.length + spacingProximity * 2;

      if (score > bestScore) {
        bestRun = run;
        bestSpacing = refSpacing;
        bestScore = score;
      }
    }
  }

  if (bestRun.length < 3) return null;

  // Refine spacing using average of the best run
  let totalSpacing = 0;
  for (let i = 1; i < bestRun.length; i++) {
    totalSpacing += bestRun[i].x - bestRun[i - 1].x;
  }
  const avgSpacing = totalSpacing / (bestRun.length - 1);

  console.log(`[OMR] X-calibration: firstX=${bestRun[0].x.toFixed(0)}, spacing=${avgSpacing.toFixed(1)}, runLen=${bestRun.length}, totalPeaks=${merged.length}`);

  return { firstX: bestRun[0].x, spacing: avgSpacing };
}

/**
 * Find OMR strip Y positions using periodic fingerprint detection.
 * Uses calibrated X positions instead of hardcoded ones.
 */
function findOMRStripYPositions(
  imageData: ImageData,
  imgW: number,
  imgH: number,
  firstBubbleX: number,
  bubbleSpacing: number,
  sampleR: number,
  gapSampleR: number,
  expectedCount: number
): number[] {
  // Bubble center positions for fingerprint check
  const bubbleXs: number[] = [];
  for (let i = 0; i < 5; i++) {
    bubbleXs.push(firstBubbleX + i * bubbleSpacing);
  }

  // Gap positions (midpoints between bubbles)
  const gapXs: number[] = [];
  for (let i = 0; i < 4; i++) {
    gapXs.push(firstBubbleX + i * bubbleSpacing + bubbleSpacing / 2);
  }

  // Estimate scan step in image pixels (~1pt equivalent)
  const ptScale = imgH / PDF_H;
  const step = Math.max(1, Math.round(ptScale));
  const startY = Math.round(imgH * 0.08);
  const endY = Math.round(imgH * 0.95);

  const candidates: { y: number; periodicScore: number }[] = [];

  for (let y = startY; y < endY; y += step) {
    let totalBubbleDark = 0;
    let bubbleHits = 0;
    for (const bx of bubbleXs) {
      const dark = sampleCircleDarkness(imageData, bx, y, sampleR);
      totalBubbleDark += dark;
      if (dark > 8) bubbleHits++;
    }

    if (bubbleHits < 3) continue;
    const avgBubbleDark = totalBubbleDark / bubbleXs.length;
    if (avgBubbleDark < 10) continue;

    let totalGapDark = 0;
    for (const gx of gapXs) {
      totalGapDark += sampleCircleDarkness(imageData, gx, y, gapSampleR);
    }
    const avgGapDark = totalGapDark / gapXs.length;

    const periodicScore = avgBubbleDark - avgGapDark;
    if (periodicScore > 5) {
      candidates.push({ y, periodicScore });
    }
  }

  // Cluster into strips
  const estBubbleDia = Math.round(imgW * 16 / PDF_W);
  const minGap = estBubbleDia * 3;

  const strips: { y: number; score: number }[] = [];
  for (const c of candidates) {
    const last = strips[strips.length - 1];
    if (!last || c.y - last.y > minGap) {
      strips.push({ y: c.y, score: c.periodicScore });
    } else if (c.periodicScore > last.score) {
      last.y = c.y;
      last.score = c.periodicScore;
    }
  }

  console.log(`[OMR] Y-scan: ${strips.length} strips found:`,
    strips.map(s => `Y=${s.y}(ps=${s.score.toFixed(0)})`).join(', '));

  // Select top N by score, sort by Y, refine
  const selected = strips
    .sort((a, b) => b.score - a.score)
    .slice(0, expectedCount)
    .sort((a, b) => a.y - b.y);

  // Refine each Y by sampling ±3px around the peak
  return selected.map(strip => {
    let bestY = strip.y;
    let bestSum = -1;
    const refineStep = Math.max(1, Math.round(ptScale * 0.5));

    for (let dy = -estBubbleDia / 2; dy <= estBubbleDia / 2; dy += refineStep) {
      let sum = 0;
      for (const bx of bubbleXs) {
        sum += sampleCircleDarkness(imageData, bx, strip.y + dy, sampleR);
      }
      if (sum > bestSum) {
        bestSum = sum;
        bestY = strip.y + dy;
      }
    }
    return bestY;
  });
}

// ========== MAIN EXPORT ==========

export async function extractOMRScoresClient(
  imageDataUrl: string,
  questions: Question[]
): Promise<ClientOMRResult> {
  const warnings: string[] = [];

  if (questions.length === 0) {
    return { scores: {}, confidence: {}, warnings: ['No questions on this page.'] };
  }

  // Load image
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Find QR corners
  const { corners: imgCorners, found: cornersFound } = await findQRCenters(canvas, img.width, img.height);
  if (cornersFound < 4) {
    warnings.push(`${cornersFound}/4 QR corners detected.`);
  }

  // Estimated bubble dimensions from image size
  const estBubbleDia = Math.round(img.width * 16 / PDF_W);
  const sampleR = Math.max(2, Math.round(estBubbleDia * 0.35));
  const gapSampleR = Math.max(2, Math.round(estBubbleDia * 0.2));
  const innerR = Math.max(2, Math.round(estBubbleDia * 0.3));

  // Step 1: Initial Y-scan with estimated X positions to find one strong strip
  // Use proportional estimate for initial scan
  const estFirstX = img.width * 90 / PDF_W;  // ~90pt from left edge
  const estSpacing = img.width * 20 / PDF_W;  // ~20pt spacing

  // Find a strong strip for calibration
  const initialStrips = findOMRStripYPositions(
    imageData, img.width, img.height,
    estFirstX, estSpacing, sampleR, gapSampleR, questions.length
  );

  if (initialStrips.length === 0) {
    warnings.push('No OMR strips found. Cannot calibrate.');
    const scores: Record<number, number> = {};
    const confidence: Record<number, number> = {};
    questions.forEach(q => { scores[q.id] = 0; confidence[q.id] = 0; });
    return { scores, confidence, warnings };
  }

  // Step 2: Calibrate X-positions using the strongest strip
  const calibResult = calibrateBubbleX(imageData, img.width, initialStrips[0], estBubbleDia, sampleR);

  let firstBubbleX: number;
  let bubbleSpacing: number;

  if (calibResult) {
    firstBubbleX = calibResult.firstX;
    bubbleSpacing = calibResult.spacing;
  } else {
    // Fallback to proportional estimates
    firstBubbleX = estFirstX;
    bubbleSpacing = estSpacing;
    warnings.push('X-calibration failed, using proportional estimates.');
  }

  // Use initial Y positions directly (they're already accurate)
  // No need to re-scan Y — the initial estimated X was close enough for Y detection
  const stripYPositions = initialStrips;

  console.log(`[OMR] Final: ${stripYPositions.length} strips for ${questions.length} questions, X: firstX=${firstBubbleX.toFixed(0)} spacing=${bubbleSpacing.toFixed(1)}`);

  // Step 4: Score extraction
  const scores: Record<number, number> = {};
  const confidence: Record<number, number> = {};

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    if (i >= stripYPositions.length) {
      scores[q.id] = 0;
      confidence[q.id] = 0;
      warnings.push(`Q${q.id}: No OMR strip found.`);
      continue;
    }

    const stripY = stripYPositions[i];
    const darknessValues: number[] = [];

    for (let n = 0; n <= q.maxScore; n++) {
      const bx = firstBubbleX + n * bubbleSpacing;
      const dark = sampleCircleDarkness(imageData, bx, stripY, innerR);
      darknessValues.push(dark);
    }

    const maxDark = Math.max(...darknessValues);
    const sorted = [...darknessValues].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const contrast = maxDark - median;
    const darkestIdx = darknessValues.indexOf(maxDark);

    console.log(`[OMR] Q${q.id}: darkness=[${darknessValues.map(d => d.toFixed(0)).join(',')}], contrast=${contrast.toFixed(0)}, idx=${darkestIdx}`);

    const CONTRAST_THRESHOLD = 20;

    if (contrast < CONTRAST_THRESHOLD) {
      scores[q.id] = 0;
      confidence[q.id] = 0.1;
      warnings.push(`Q${q.id}: No clearly filled bubble (contrast: ${contrast.toFixed(0)}).`);
    } else {
      scores[q.id] = darkestIdx;
      confidence[q.id] = Math.min(1, contrast / 60);
    }
  }

  if (warnings.length === 0) {
    warnings.push('Client-side OMR extraction completed successfully.');
  }

  return { scores, confidence, warnings };
}

// ========== HELPERS ==========

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
