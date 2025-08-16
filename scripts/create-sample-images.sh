#!/bin/bash

echo "🖼️  Creating sample images for optimization demo..."

# Create the source images directory if it doesn't exist
mkdir -p src/assets/images

# Create some sample placeholder images using ImageMagick (if available) or simple colored squares
# These are just examples - replace with real images

echo "📁 Creating sample images in src/assets/images/"

# If ImageMagick is available, create sample images
if command -v convert &> /dev/null; then
    echo "🎨 Using ImageMagick to create sample images..."
    
    # Hero banner (1920x1080)
    convert -size 1920x1080 gradient:blue-purple -pointsize 72 -fill white -gravity center -annotate +0+0 "Hero Banner\nSample Image" src/assets/images/hero-banner.jpg
    
    # Product showcase (1200x800)  
    convert -size 1200x800 gradient:green-blue -pointsize 48 -fill white -gravity center -annotate +0+0 "Product Showcase\nHigh Quality Image" src/assets/images/product-showcase.png
    
    # Team photo (1600x900)
    convert -size 1600x900 gradient:purple-pink -pointsize 48 -fill white -gravity center -annotate +0+0 "Team Photo\nGroup Image" src/assets/images/team-photo.webp
    
    # Card image (800x600)
    convert -size 800x600 gradient:orange-red -pointsize 36 -fill white -gravity center -annotate +0+0 "Card Image\nMedium Size" src/assets/images/card-sample.jpg
    
    # Avatar (400x400)
    convert -size 400x400 gradient:red-yellow -pointsize 24 -fill white -gravity center -annotate +0+0 "Avatar\nProfile" src/assets/images/avatar-sample.png
    
    echo "✅ Created 5 sample images using ImageMagick"
    
else
    echo "⚠️  ImageMagick not found. Creating placeholder files instead..."
    echo "Add your own high-quality images to src/assets/images/ and run the optimizer"
    
    # Create placeholder text files with instructions
    cat > src/assets/images/README.txt << 'EOF'
Sample Images Directory
======================

Add your high-quality source images here:
- hero-banner.jpg (1920x1080 recommended)
- product-showcase.png (1200x800 recommended) 
- team-photo.webp (1600x900 recommended)
- card-sample.jpg (800x600 recommended)
- avatar-sample.png (400x400 recommended)

Supported formats: .jpg, .jpeg, .png, .webp
Recommended: High resolution (at least 1920px wide)

Then run:
npm run optimize:images generate
EOF

fi

echo ""
echo "📊 Image optimization workflow:"
echo "1. Add high-quality images to src/assets/images/"
echo "2. Run: npm run optimize:images generate"
echo "3. Use the optimized images in your components"
echo ""
echo "🎯 The optimizer will create:"
echo "   • AVIF versions (smallest, modern browsers)"
echo "   • WebP versions (good compression, wide support)"  
echo "   • JPEG versions (universal fallback)"
echo "   • 7 responsive sizes for each format"
echo ""
echo "💡 Use the ResponsiveImage component to automatically serve the best format"