import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const source = path.resolve('public/assets/aistudio/images__4__e539a736.jpeg');
const publicDir = path.resolve('public');

async function generate() {
  console.log('Generating PWA icons from:', source);

  // 192x192 PNG
  await sharp(source)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  // 512x512 PNG
  await sharp(source)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // 180x180 Apple Touch Icon
  await sharp(source)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // 512x512 Maskable Icon with 10% safe zone padding
  await sharp(source)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: '#000000'
    })
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  // Favicon 64x64 PNG
  await sharp(source)
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));

  console.log('PWA icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
