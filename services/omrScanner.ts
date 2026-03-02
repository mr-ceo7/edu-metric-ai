/**
 * Client-Side OMR Scanner v3 — Hybrid Adaptive
 *
 * Strategy:
 * 1. Use jsQR to find corner QR positions → precise coordinate mapper
 * 2. Use coordinate mapper for X positions (reliable — PDF padding/spacing is known)
 * 3. Adaptively detect OMR strip Y positions by scanning for bubble-shaped dark rows
 * 4. Sample bubble interiors at the mapped X + detected Y positions
 * 5. The darkest bubble = filled score
 */

import { Question } from '../types';

// ========== PDF CONSTANTS ==========
const PDF_W = 595.28;
const PDF_H = 841.89;
const QR_CENTER_OFFSET = 15 + 55 / 2; // 42.5

const PDF_CORNERS = {
  TL: { x: QR_CENTER_OFFSET, y: QR_CENTER_OFFSET },
  TR: { x: PDF_W - QR_CENTER_OFFSET, y: QR_CENTER_OFFSET },
  BL: { x: QR_CENTER_OFFSET, y: PDF_H - QR_CENTER_OFFSET },
  BR: { x: PDF_W - QR_CENTER_OFFSET, y: PDF_H - QR_CENTER_OFFSET },
};

// OMR bubble layout (PDF points) — X positions are reliable
const PAGE_PAD = 40;
const BLOCK_PAD = 10;
const OMR_LABEL_W = 32;        // "SCORE:" label width
const OMR_BUBBLE_SIZE = 16;    // diameter
const OMR_BUBBLE_SPACING = 20; // center-to-center

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

// ========== QR CENTER DETECTION ==========

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
  return 255 - (totalGray / count); // 0=white, 255=black
}

// ========== OMR STRIP Y-DETECTION ==========

/**
 * Find Y positions of OMR bubble strips by looking for rows where
 * sampling at the known X positions yields bubble-like patterns.
 * 
 * The key insight: we KNOW the X positions of the bubbles (from PDF layout)
 * but NOT the Y positions (PDF layout engine renders differently).
 * So we sweep Y and check if bubbles exist at the known X positions.
 */
function findOMRStripYPositions(
  imageData: ImageData,
  imgW: number,
  imgH: number,
  mapToImage: (px: number, py: number) => Point,
  questions: Question[]
): number[] {
  // The first bubble of each question starts at this PDF X
  const firstBubbleX = PAGE_PAD + BLOCK_PAD + OMR_LABEL_W + OMR_BUBBLE_SIZE / 2;
  
  const bubbleDiaImg = Math.round(OMR_BUBBLE_SIZE * (imgW / PDF_W));
  const sampleR = Math.max(2, Math.round(bubbleDiaImg * 0.35));

  // Sweep PDF y from header to just above footer
  const step = 1.5;
  const startY = 80;
  const endY = PDF_H - 50;

  // Check first 5 bubble X positions as signature for more robust detection
  const signatureXs = [
    firstBubbleX,
    firstBubbleX + OMR_BUBBLE_SPACING,
    firstBubbleX + OMR_BUBBLE_SPACING * 2,
    firstBubbleX + OMR_BUBBLE_SPACING * 3,
    firstBubbleX + OMR_BUBBLE_SPACING * 4,
  ];

  const yScores: { pdfY: number; score: number; avgDark: number }[] = [];

  for (let pdfY = startY; pdfY < endY; pdfY += step) {
    let totalDark = 0;
    let minDark = 255;
    let signatureHits = 0;

    for (const sx of signatureXs) {
      const imgPt = mapToImage(sx, pdfY);
      const dark = sampleCircleDarkness(imageData, imgPt.x, imgPt.y, sampleR);
      totalDark += dark;
      minDark = Math.min(minDark, dark);
      if (dark > 8) signatureHits++;
    }

    const avgDark = totalDark / signatureXs.length;

    // At least 3 out of 5 positions should show some darkness, and average must be notable
    if (signatureHits >= 3 && avgDark > 12) {
      yScores.push({ pdfY, score: avgDark, avgDark });
    }
  }

  // Cluster into strips
  const strips: { pdfY: number; peakScore: number }[] = [];
  const minGap = 30; // Minimum gap between question blocks in PDF points

  for (const ys of yScores) {
    const lastStrip = strips[strips.length - 1];
    if (!lastStrip || ys.pdfY - lastStrip.pdfY > minGap) {
      strips.push({ pdfY: ys.pdfY, peakScore: ys.score });
    } else if (ys.score > lastStrip.peakScore) {
      // Update peak within same cluster
      lastStrip.pdfY = ys.pdfY;
      lastStrip.peakScore = ys.score;
    }
  }

  console.log(`[OMR] Y-detection found ${strips.length} potential strips:`, strips.map(s => `Y=${s.pdfY.toFixed(0)}`).join(', '));

  // Return the best N strips (sorted by Y)
  return strips
    .sort((a, b) => b.peakScore - a.peakScore)
    .slice(0, questions.length)
    .sort((a, b) => a.pdfY - b.pdfY)
    .map(s => s.pdfY);
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
    warnings.push(`${cornersFound}/4 QR corners detected. Accuracy may be reduced.`);
  }

  // Create coordinate mapper
  const mapToImage = createCoordinateMapper(imgCorners);

  // Scale factor for sampling (image pixels per PDF point)
  const imgRectW = imgCorners.TR.x - imgCorners.TL.x;
  const avgScale = imgRectW / (PDF_CORNERS.TR.x - PDF_CORNERS.TL.x);
  const bubbleRadiusImg = (OMR_BUBBLE_SIZE / 2) * avgScale;
  // Sample interior only (40% of radius to avoid outline)
  const innerSampleR = Math.max(2, Math.round(bubbleRadiusImg * 0.4));

  // Detect OMR strip Y positions
  const stripYPositions = findOMRStripYPositions(imageData, img.width, img.height, mapToImage, questions);

  console.log(`[OMR] Matched ${stripYPositions.length} strips to ${questions.length} questions`);

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

    // Sample each bubble at known X positions + detected Y
    const darknessValues: number[] = [];
    const firstBubbleX = PAGE_PAD + BLOCK_PAD + OMR_LABEL_W + OMR_BUBBLE_SIZE / 2;

    for (let n = 0; n <= q.maxScore; n++) {
      const pdfX = firstBubbleX + n * OMR_BUBBLE_SPACING;
      const imgPt = mapToImage(pdfX, stripY);
      const darkness = sampleCircleDarkness(imageData, imgPt.x, imgPt.y, innerSampleR);
      darknessValues.push(darkness);
    }

    // Find the darkest bubble
    const maxDark = Math.max(...darknessValues);
    const sorted = [...darknessValues].sort((a, b) => a - b);
    // Median of all values (more robust than min for computing contrast)
    const median = sorted[Math.floor(sorted.length / 2)];
    const contrast = maxDark - median;
    const darkestIdx = darknessValues.indexOf(maxDark);

    console.log(`[OMR] Q${q.id}: stripY=${stripY.toFixed(0)}, bubbles=[${darknessValues.map(d => d.toFixed(0)).join(',')}], contrast=${contrast.toFixed(0)}, idx=${darkestIdx}`);

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
