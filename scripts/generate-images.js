import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.join(__dirname, "../src/assets/images");
const outputDir = path.join(__dirname, "../public/images/optimized");

// Responsive breakpoints
const sizes = [320, 640, 768, 1024, 1280, 1440, 1920];

// Image quality settings
const qualitySettings = {
  avif: { quality: 50, effort: 6 },
  webp: { quality: 75, effort: 6 },
  jpeg: { quality: 78, progressive: true },
  png: { compressionLevel: 8, progressive: true }
};

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Ensure input directory exists
if (!fs.existsSync(inputDir)) {
  fs.mkdirSync(inputDir, { recursive: true });
  console.log(`Created input directory: ${inputDir}`);
  console.log("Add your source images to src/assets/images/ and run this script again.");
  process.exit(0);
}

console.log("🖼️  Starting image optimization...");
console.log(`Input: ${inputDir}`);
console.log(`Output: ${outputDir}`);

let processed = 0;
let total = 0;

async function processImage(file) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, ext);

  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    console.log(`⚠️  Skipping unsupported format: ${file}`);
    return;
  }

  const inputPath = path.join(inputDir, file);
  console.log(`📸 Processing: ${file}`);

  try {
    // Get original image metadata
    const metadata = await sharp(inputPath).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    
    console.log(`   Original: ${originalWidth}x${originalHeight}`);

    for (const size of sizes) {
      // Skip if size is larger than original
      if (size > originalWidth) continue;

      // Calculate proportional height
      const height = Math.round((originalHeight * size) / originalWidth);
      
      const resizeOptions = {
        width: size,
        height: height,
        fit: 'cover',
        position: 'center'
      };

      // Generate AVIF
      try {
        await sharp(inputPath)
          .resize(resizeOptions)
          .avif(qualitySettings.avif)
          .toFile(`${outputDir}/${base}-${size}.avif`);
        console.log(`   ✅ AVIF ${size}w`);
      } catch (error) {
        console.log(`   ❌ AVIF ${size}w failed: ${error.message}`);
      }

      // Generate WebP
      try {
        await sharp(inputPath)
          .resize(resizeOptions)
          .webp(qualitySettings.webp)
          .toFile(`${outputDir}/${base}-${size}.webp`);
        console.log(`   ✅ WebP ${size}w`);
      } catch (error) {
        console.log(`   ❌ WebP ${size}w failed: ${error.message}`);
      }

      // Generate JPEG (fallback)
      try {
        await sharp(inputPath)
          .resize(resizeOptions)
          .jpeg(qualitySettings.jpeg)
          .toFile(`${outputDir}/${base}-${size}.jpg`);
        console.log(`   ✅ JPEG ${size}w`);
      } catch (error) {
        console.log(`   ❌ JPEG ${size}w failed: ${error.message}`);
      }
    }

    // Generate a metadata file for each image
    const metadataFile = `${outputDir}/${base}.json`;
    const imageMetadata = {
      original: {
        width: originalWidth,
        height: originalHeight,
        format: metadata.format,
        size: metadata.size
      },
      sizes: sizes.filter(s => s <= originalWidth).map(size => ({
        width: size,
        height: Math.round((originalHeight * size) / originalWidth),
        formats: ['avif', 'webp', 'jpg']
      }))
    };
    
    fs.writeFileSync(metadataFile, JSON.stringify(imageMetadata, null, 2));
    processed++;

  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
  }
}

async function main() {
  try {
    const files = fs.readdirSync(inputDir);
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
    });

    total = imageFiles.length;
    
    if (total === 0) {
      console.log("📁 No images found in src/assets/images/");
      console.log("Add some .jpg, .jpeg, .png, or .webp files and run again.");
      return;
    }

    console.log(`Found ${total} image(s) to process...\n`);

    // Process images sequentially to avoid overwhelming the system
    for (const file of imageFiles) {
      await processImage(file);
      console.log(); // Empty line for readability
    }

    console.log(`🎉 Image optimization complete!`);
    console.log(`📊 Processed: ${processed}/${total} images`);
    console.log(`📁 Output directory: ${outputDir}`);
    
    // Generate index file for easy importing
    const indexFile = `${outputDir}/index.js`;
    const imageIndex = imageFiles.map(file => {
      const base = path.basename(file, path.extname(file));
      return `export { default as ${base} } from './${base}.json';`;
    }).join('\n');
    
    fs.writeFileSync(indexFile, imageIndex);
    console.log(`📝 Generated index file: ${indexFile}`);

  } catch (error) {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  }
}

main();