/**
 * Generate a sample marked answer sheet PNG matching the DEMO SESSION exactly.
 *
 * Demo session questions (page 1):
 *   Q1: Algebra / Quadratic Equations, maxScore=3,  filled=2
 *   Q2: Algebra / Solving for X,       maxScore=5,  filled=4
 *   Q3: Geometry / Circle Theorems,     maxScore=8,  filled=6
 *   Q4: Geometry / Area of Sectors,     maxScore=10, filled=8
 *   Q5: Trigonometry / SOH CAH TOA,     maxScore=4,  filled=3
 *   Q6: Calculus / Differentiation,     maxScore=10, filled=7
 *
 * Usage: node scripts/generateTestSheet.mjs
 */

import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import { writeFileSync } from 'fs';

// ========== LAYOUT ==========
const SCALE = 4;
const PDF_W = 595;
const PDF_H = 842;
const W = PDF_W * SCALE;
const H = PDF_H * SCALE;
const s = (v) => v * SCALE;

const QR_SIZE = s(55);
const QR_MARGIN = s(15);
const PAGE_PAD = s(40);

// ========== DEMO SESSION DATA ==========
const testConfig = {
  school: 'Kisii School',
  subject: 'Mathematics',
  level: 'Form 4',
  examTitle: 'End of Term Assessment 2024',
  date: '2024-03-20',
  student: { name: 'John Kamau', id: 's1' },
  pageNumber: 1,
  totalPages: 1,
};

const testQuestions = [
  { id: 1, topic: 'Algebra', subTopic: 'Quadratic Equations', questionText: 'Solve for x: x^2 - 5x + 6 = 0', maxScore: 3, cognitiveLevel: 'Recall', filledScore: 2 },
  { id: 2, topic: 'Algebra', subTopic: 'Solving for X', questionText: 'Explain the steps to isolate x in the equation 3(x - 2) = 12', maxScore: 5, cognitiveLevel: 'Understanding', filledScore: 4 },
  { id: 3, topic: 'Geometry', subTopic: 'Circle Theorems', questionText: 'Calculate the angle x in the cyclic quadrilateral ABCD given...', maxScore: 8, cognitiveLevel: 'Application', filledScore: 6 },
  { id: 4, topic: 'Geometry', subTopic: 'Area of Sectors', questionText: 'A sector of a circle with radius 10cm has an angle of 60 degrees. Find the area.', maxScore: 10, cognitiveLevel: 'Analysis', filledScore: 8 },
  { id: 5, topic: 'Trigonometry', subTopic: 'SOH CAH TOA', questionText: 'Define Sine, Cosine and Tangent ratios in a right-angled triangle.', maxScore: 4, cognitiveLevel: 'Recall', filledScore: 3 },
  { id: 6, topic: 'Calculus', subTopic: 'Differentiation', questionText: 'Find the derivative of f(x) = 3x^2 + 4x - 5', maxScore: 10, cognitiveLevel: 'Application', filledScore: 7 },
];

async function generateQR(data) {
  return await QRCode.toBuffer(JSON.stringify(data), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: QR_SIZE,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

async function main() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // ---- Corner QR codes ----
  const cornerData = {
    type: 'corner',
    studentName: testConfig.student.name,
    studentId: testConfig.student.id,
    level: testConfig.level,
    subject: testConfig.subject,
    date: testConfig.date,
    examTitle: testConfig.examTitle,
    pageNumber: testConfig.pageNumber,
    totalPages: testConfig.totalPages,
    isFinalPage: true,
  };

  const qrBuffer = await generateQR(cornerData);
  const qrImg = await loadImage(qrBuffer);

  ctx.drawImage(qrImg, QR_MARGIN, QR_MARGIN, QR_SIZE, QR_SIZE);
  ctx.drawImage(qrImg, W - QR_MARGIN - QR_SIZE, QR_MARGIN, QR_SIZE, QR_SIZE);
  ctx.drawImage(qrImg, QR_MARGIN, H - QR_MARGIN - QR_SIZE, QR_SIZE, QR_SIZE);
  ctx.drawImage(qrImg, W - QR_MARGIN - QR_SIZE, H - QR_MARGIN - QR_SIZE, QR_SIZE, QR_SIZE);

  // ---- Header ----
  const headerY = PAGE_PAD + s(30);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1e293b';
  ctx.font = `bold ${s(14)}px Helvetica, Arial, sans-serif`;
  ctx.fillText(testConfig.school, W / 2, headerY);

  ctx.fillStyle = '#64748b';
  ctx.font = `${s(8)}px Helvetica, Arial, sans-serif`;
  ctx.fillText(
    `${testConfig.examTitle} • ${testConfig.subject} • ${testConfig.level} • ${testConfig.date}`,
    W / 2, headerY + s(14)
  );

  ctx.fillStyle = '#4f46e5';
  ctx.font = `bold ${s(9)}px Helvetica, Arial, sans-serif`;
  ctx.fillText(
    `Student: ${testConfig.student.name} (${testConfig.student.id})`,
    W / 2, headerY + s(26)
  );

  // Header border
  const headerBottom = headerY + s(34);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = s(1);
  ctx.beginPath();
  ctx.moveTo(PAGE_PAD, headerBottom);
  ctx.lineTo(W - PAGE_PAD, headerBottom);
  ctx.stroke();

  // ---- Question Blocks ----
  let blockY = headerBottom + s(12);
  ctx.textAlign = 'left';

  for (const q of testQuestions) {
    const blockX = PAGE_PAD;
    const blockW = W - PAGE_PAD * 2;
    const blockPad = s(8);

    // Question block border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = s(1);

    let contentY = blockY + blockPad;

    // Question number
    ctx.fillStyle = '#1e293b';
    ctx.font = `bold ${s(9)}px Helvetica, Arial, sans-serif`;
    ctx.fillText(`Q${q.id}. (${q.maxScore} marks)`, blockX + blockPad, contentY + s(9));
    contentY += s(12);

    // Question text (compact)
    ctx.fillStyle = '#475569';
    ctx.font = `${s(7)}px Helvetica, Arial, sans-serif`;
    const maxTextW = blockW - blockPad * 2;
    const text = q.questionText.length > 80 ? q.questionText.substring(0, 77) + '...' : q.questionText;
    ctx.fillText(text, blockX + blockPad, contentY + s(7), maxTextW);
    contentY += s(10);

    // Topic label
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${s(6)}px Helvetica, Arial, sans-serif`;
    ctx.fillText(`${q.topic} › ${q.subTopic} • ${q.cognitiveLevel}`, blockX + blockPad, contentY + s(6));
    contentY += s(10);

    // OMR strip separator
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = s(0.5);
    ctx.beginPath();
    ctx.moveTo(blockX + blockPad, contentY);
    ctx.lineTo(blockX + blockW - blockPad, contentY);
    ctx.stroke();
    contentY += s(4);

    // OMR label
    ctx.fillStyle = '#64748b';
    ctx.font = `bold ${s(6)}px Helvetica, Arial, sans-serif`;
    ctx.fillText('SCORE:', blockX + blockPad, contentY + s(10));

    // OMR bubbles — positioned to match omrScanner.ts expectations
    // firstBubbleX = PAGE_PAD + BLOCK_PAD + OMR_LABEL_W + BUBBLE_SIZE/2
    // In PDF coords: 40 + 10 + 32 + 8 = 90
    // In image coords: 90 * SCALE = 360
    const bubbleStartX = s(90);
    const bubbleR = s(8);
    const bubbleSpacing = s(20);
    const bubbleY = contentY + s(8);

    for (let n = 0; n <= q.maxScore; n++) {
      const cx = bubbleStartX + n * bubbleSpacing;
      const cy = bubbleY;

      ctx.beginPath();
      ctx.arc(cx, cy, bubbleR, 0, Math.PI * 2);

      if (n === q.filledScore) {
        // FILLED bubble — solid dark
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = s(1.5);
        ctx.stroke();
      } else {
        // Empty bubble — just outline
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = s(1.5);
        ctx.stroke();
      }

      // Bubble number
      ctx.fillStyle = n === q.filledScore ? '#ffffff' : '#64748b';
      ctx.font = `${s(5)}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(n), cx, cy + s(2));
      ctx.textAlign = 'left';
    }

    contentY = bubbleY + bubbleR + s(4);

    // Answer lines (compact — 2 lines)
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = s(0.5);
    for (let line = 0; line < 2; line++) {
      const ly = contentY + s(4) + line * s(14);
      ctx.beginPath();
      ctx.moveTo(blockX + blockPad, ly);
      ctx.lineTo(blockX + blockW - blockPad, ly);
      ctx.stroke();
    }

    const blockH = contentY + s(32) - blockY;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = s(1);
    ctx.strokeRect(blockX, blockY, blockW, blockH);

    blockY += blockH + s(8);
  }

  // ---- Footer ----
  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${s(7)}px Helvetica, Arial, sans-serif`;
  ctx.fillText(
    `Page ${testConfig.pageNumber} of ${testConfig.totalPages} • ${testConfig.student.name} • ${testConfig.school}`,
    W / 2, H - s(15)
  );

  // ---- Save ----
  const outputPath = new URL('../public/test-sheet.png', import.meta.url).pathname;
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(outputPath, buffer);
  console.log(`✅ Test sheet saved to: ${outputPath}`);
  console.log(`   Image size: ${W}x${H} (A4 @ ${SCALE}x)`);
  console.log(`   Student: ${testConfig.student.name}`);
  console.log(`   Questions: ${testQuestions.length}`);
  console.log(`   Expected scores: ${testQuestions.map(q => `Q${q.id}=${q.filledScore}/${q.maxScore}`).join(', ')}`);
}

main().catch(console.error);
