// This script will help identify all the remaining function calls that need to be updated

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const functionReplacements = {
  'log_enhanced_security_event': 'log_security_event',
  'anonymize_old_location_data': 'anonymize_location_data'
};

function replaceInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    Object.keys(functionReplacements).forEach(oldFunc => {
      const newFunc = functionReplacements[oldFunc];
      const regex = new RegExp(`'${oldFunc}'`, 'g');
      if (content.includes(`'${oldFunc}'`)) {
        content = content.replace(regex, `'${newFunc}'`);
        modified = true;
        console.log(`Replaced ${oldFunc} with ${newFunc} in ${filePath}`);
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`Updated: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

// Find all TypeScript and JavaScript files
const files = glob.sync('src/**/*.{ts,tsx,js,jsx}', { ignore: 'node_modules/**' });

console.log(`Processing ${files.length} files...`);
files.forEach(replaceInFile);
console.log('Done!');