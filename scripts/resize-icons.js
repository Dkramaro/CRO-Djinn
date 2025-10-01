/**
 * Icon Resizer Script
 * Creates properly-sized Chrome extension icons from the main logo
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ICON_SIZES = [16, 48, 128];
const SOURCE_ICON = path.join(__dirname, '../icons/CRO-Djinn Logo.png');
const OUTPUT_DIR = path.join(__dirname, '../icons');

async function resizeIcons() {
  console.log('🎨 Starting icon resize process...\n');

  // Check if source file exists
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error(`❌ Source icon not found: ${SOURCE_ICON}`);
    process.exit(1);
  }

  console.log(`📁 Source: ${SOURCE_ICON}`);
  console.log(`📁 Output: ${OUTPUT_DIR}\n`);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Resize for each required size
  for (const size of ICON_SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
    
    try {
      await sharp(SOURCE_ICON)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Created icon-${size}.png (${size}x${size})`);
    } catch (error) {
      console.error(`❌ Failed to create icon-${size}.png:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n🎉 All icons created successfully!');
  console.log('\nCreated files:');
  ICON_SIZES.forEach(size => {
    console.log(`  - icons/icon-${size}.png`);
  });
}

resizeIcons().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

