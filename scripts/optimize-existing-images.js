import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { glob } from "glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
  // Input directories to scan for images
  inputDirs: [
    path.join(__dirname, "../public"),
    path.join(__dirname, "../src/assets"),
    path.join(__dirname, "../src/assets/images")
  ],
  // Output directory for optimized images
  outputDir: path.join(__dirname, "../public/images/optimized"),
  // Backup directory for original images
  backupDir: path.join(__dirname, "../public/images/originals"),
  // Responsive breakpoints
  breakpoints: [320, 640, 768, 1024, 1280, 1440, 1920],
  // Quality settings
  quality: {
    avif: { quality: 50, effort: 6 },
    webp: { quality: 75, effort: 6 },
    jpeg: { quality: 78, progressive: true },
    png: { compressionLevel: 8, progressive: true }
  },
  // File patterns to include
  patterns: [
    "**/*.jpg",
    "**/*.jpeg", 
    "**/*.png",
    "**/*.webp"
  ],
  // File patterns to exclude
  exclude: [
    "**/node_modules/**",
    "**/optimized/**",
    "**/originals/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**"
  ]
};

// Ensure directories exist
function ensureDirectories() {
  [config.outputDir, config.backupDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Find all image files in the project
async function findAllImages() {
  console.log("🔍 Scanning for existing images...");
  
  const allImages = [];
  
  for (const inputDir of config.inputDirs) {
    if (!fs.existsSync(inputDir)) continue;
    
    console.log(`📁 Scanning: ${inputDir}`);
    
    for (const pattern of config.patterns) {
      try {
        const files = await glob(pattern, {
          cwd: inputDir,
          ignore: config.exclude,
          absolute: true
        });
        
        for (const file of files) {
          const stats = fs.statSync(file);
          const relativePath = path.relative(process.cwd(), file);
          
          allImages.push({
            absolutePath: file,
            relativePath,
            fileName: path.basename(file),
            baseName: path.basename(file, path.extname(file)),
            extension: path.extname(file).toLowerCase(),
            size: stats.size,
            directory: path.dirname(file)
          });
        }
      } catch (error) {
        console.warn(`⚠️  Error scanning ${pattern} in ${inputDir}:`, error.message);
      }
    }
  }
  
  console.log(`📊 Found ${allImages.length} images to process`);
  return allImages;
}

// Backup original image
function backupOriginal(imagePath, baseName) {
  const backupPath = path.join(config.backupDir, path.basename(imagePath));
  
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(imagePath, backupPath);
    console.log(`💾 Backed up: ${path.basename(imagePath)}`);
  }
}

// Process a single image
async function processImage(imageInfo) {
  const { absolutePath, baseName, fileName } = imageInfo;
  
  console.log(`\n🖼️  Processing: ${fileName}`);
  
  try {
    // Backup original
    backupOriginal(absolutePath, baseName);
    
    // Get image metadata
    const metadata = await sharp(absolutePath).metadata();
    const originalWidth = metadata.width || 1920;
    const originalHeight = metadata.height || 1080;
    
    console.log(`   📐 Original: ${originalWidth}x${originalHeight}`);
    
    const results = {
      original: {
        width: originalWidth,
        height: originalHeight,
        format: metadata.format,
        size: imageInfo.size
      },
      generated: [],
      errors: []
    };
    
    // Process each breakpoint
    for (const width of config.breakpoints) {
      // Skip if breakpoint is larger than original
      if (width > originalWidth) continue;
      
      const height = Math.round((originalHeight * width) / originalWidth);
      const resizeOptions = {
        width,
        height,
        fit: 'cover' as const,
        position: 'center' as const
      };
      
      // Generate AVIF
      try {
        const avifPath = path.join(config.outputDir, `${baseName}-${width}.avif`);
        await sharp(absolutePath)
          .resize(resizeOptions)
          .avif(config.quality.avif)
          .toFile(avifPath);
        
        const avifStats = fs.statSync(avifPath);
        results.generated.push({
          format: 'avif',
          width,
          height,
          size: avifStats.size,
          path: avifPath
        });
        console.log(`   ✅ AVIF ${width}w (${Math.round(avifStats.size / 1024)}KB)`);
      } catch (error) {
        results.errors.push(`AVIF ${width}w: ${error.message}`);
        console.log(`   ❌ AVIF ${width}w failed`);
      }
      
      // Generate WebP
      try {
        const webpPath = path.join(config.outputDir, `${baseName}-${width}.webp`);
        await sharp(absolutePath)
          .resize(resizeOptions)
          .webp(config.quality.webp)
          .toFile(webpPath);
        
        const webpStats = fs.statSync(webpPath);
        results.generated.push({
          format: 'webp',
          width,
          height,
          size: webpStats.size,
          path: webpPath
        });
        console.log(`   ✅ WebP ${width}w (${Math.round(webpStats.size / 1024)}KB)`);
      } catch (error) {
        results.errors.push(`WebP ${width}w: ${error.message}`);
        console.log(`   ❌ WebP ${width}w failed`);
      }
      
      // Generate JPEG
      try {
        const jpegPath = path.join(config.outputDir, `${baseName}-${width}.jpg`);
        await sharp(absolutePath)
          .resize(resizeOptions)
          .jpeg(config.quality.jpeg)
          .toFile(jpegPath);
        
        const jpegStats = fs.statSync(jpegPath);
        results.generated.push({
          format: 'jpg',
          width,
          height,
          size: jpegStats.size,
          path: jpegPath
        });
        console.log(`   ✅ JPEG ${width}w (${Math.round(jpegStats.size / 1024)}KB)`);
      } catch (error) {
        results.errors.push(`JPEG ${width}w: ${error.message}`);
        console.log(`   ❌ JPEG ${width}w failed`);
      }
    }
    
    // Generate metadata file
    const metadataPath = path.join(config.outputDir, `${baseName}.json`);
    const metadata_output = {
      original: results.original,
      sizes: config.breakpoints
        .filter(width => width <= originalWidth)
        .map(width => ({
          width,
          height: Math.round((originalHeight * width) / originalWidth),
          formats: ['avif', 'webp', 'jpg']
        })),
      generated: results.generated,
      generatedAt: new Date().toISOString(),
      errors: results.errors
    };
    
    fs.writeFileSync(metadataPath, JSON.stringify(metadata_output, null, 2));
    
    return {
      success: true,
      fileName,
      baseName,
      generated: results.generated.length,
      errors: results.errors.length,
      originalSize: imageInfo.size,
      totalOptimizedSize: results.generated.reduce((sum, gen) => sum + gen.size, 0)
    };
    
  } catch (error) {
    console.error(`💥 Error processing ${fileName}:`, error.message);
    return {
      success: false,
      fileName,
      baseName,
      error: error.message
    };
  }
}

// Generate optimization report
function generateReport(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const totalOriginalSize = successful.reduce((sum, r) => sum + r.originalSize, 0);
  const totalOptimizedSize = successful.reduce((sum, r) => sum + r.totalOptimizedSize, 0);
  const totalGenerated = successful.reduce((sum, r) => sum + r.generated, 0);
  
  const savings = totalOriginalSize > 0 ? 
    ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize * 100) : 0;
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 OPTIMIZATION REPORT");
  console.log("=".repeat(60));
  console.log(`✅ Successfully processed: ${successful.length} images`);
  console.log(`❌ Failed to process: ${failed.length} images`);
  console.log(`🎯 Total optimized files generated: ${totalGenerated}`);
  console.log(`📦 Original total size: ${Math.round(totalOriginalSize / 1024 / 1024 * 100) / 100} MB`);
  console.log(`📦 Optimized total size: ${Math.round(totalOptimizedSize / 1024 / 1024 * 100) / 100} MB`);
  console.log(`💰 Total savings: ${Math.round(savings)}% (${Math.round((totalOriginalSize - totalOptimizedSize) / 1024 / 1024 * 100) / 100} MB)`);
  console.log(`📁 Output directory: ${config.outputDir}`);
  console.log(`💾 Backup directory: ${config.backupDir}`);
  
  if (failed.length > 0) {
    console.log("\n❌ Failed files:");
    failed.forEach(f => console.log(`   - ${f.fileName}: ${f.error}`));
  }
  
  // Generate JSON report
  const reportPath = path.join(config.outputDir, 'optimization-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      successful: successful.length,
      failed: failed.length,
      totalGenerated,
      originalSize: totalOriginalSize,
      optimizedSize: totalOptimizedSize,
      savings: Math.round(savings * 100) / 100
    },
    details: results,
    config
  }, null, 2));
  
  console.log(`📄 Detailed report saved: ${reportPath}`);
}

// Main function
async function main() {
  try {
    console.log("🚀 Starting bulk image optimization...");
    console.log(`📅 ${new Date().toISOString()}\n`);
    
    // Ensure output directories exist
    ensureDirectories();
    
    // Find all images
    const images = await findAllImages();
    
    if (images.length === 0) {
      console.log("📭 No images found to optimize.");
      return;
    }
    
    // Process images
    const results = [];
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`\n[${i + 1}/${images.length}]`);
      const result = await processImage(image);
      results.push(result);
    }
    
    // Generate report
    generateReport(results);
    
    console.log("\n🎉 Bulk optimization complete!");
    
  } catch (error) {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as optimizeAllImages, findAllImages, processImage, config };