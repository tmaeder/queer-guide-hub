#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

console.log('🖼️  QueerGuide Image Optimizer');
console.log('===============================\n');

const scripts = {
  'generate': {
    file: 'scripts/generate-images.js',
    description: 'Generate optimized images from src/assets/images/',
    command: 'node scripts/generate-images.js'
  },
  'optimize-existing': {
    file: 'scripts/optimize-existing-images.js', 
    description: 'Optimize all existing images in the project',
    command: 'node scripts/optimize-existing-images.js'
  }
};

const command = process.argv[2];

if (!command) {
  console.log('Available commands:');
  Object.entries(scripts).forEach(([cmd, info]) => {
    console.log(`  ${cmd.padEnd(20)} ${info.description}`);
  });
  console.log('\nUsage:');
  console.log('  npm run optimize:images generate        # Generate from src/assets/images');
  console.log('  npm run optimize:images optimize-existing # Optimize all existing images');
  process.exit(0);
}

const script = scripts[command];
if (!script) {
  console.error(`❌ Unknown command: ${command}`);
  console.log('\nAvailable commands:', Object.keys(scripts).join(', '));
  process.exit(1);
}

if (!existsSync(script.file)) {
  console.error(`❌ Script not found: ${script.file}`);
  process.exit(1);
}

console.log(`🚀 Running: ${script.description}`);
console.log(`📄 Script: ${script.file}\n`);

try {
  execSync(script.command, { stdio: 'inherit', cwd: process.cwd() });
  console.log('\n✅ Command completed successfully!');
} catch (error) {
  console.error('\n❌ Command failed:', error.message);
  process.exit(1);
}