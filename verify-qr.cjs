const { createCanvas, loadImage } = require('canvas');
const jsQR = require('jsqr');

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: node verify-qr.cjs <image-path>');
    process.exit(1);
  }

  console.log(`Loading image: ${imagePath}`);
  const image = await loadImage(imagePath);
  console.log(`Image size: ${image.width}x${image.height}`);

  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const decoded = jsQR(imageData.data, canvas.width, canvas.height);

  if (decoded) {
    console.log('\n✅ QR CODE IS VALID!');
    console.log(`Decoded data (${decoded.data.length} chars):`);
    console.log(decoded.data);
    try {
      const parsed = JSON.parse(decoded.data);
      console.log('\n✅ Valid JSON! Parsed content:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log('\n⚠️  Not JSON, but QR is still valid text content');
    }
  } else {
    console.log('\n❌ Could not decode QR code from this image');
    console.log('This may mean the QR code is corrupted, too small, or has too much noise.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
