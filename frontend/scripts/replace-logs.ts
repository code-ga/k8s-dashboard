import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function processDirectory(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    // Skip node_modules and hidden directories
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    
    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && 
               !fullPath.includes(path.normalize('src/lib/logger.ts'))) {
      
      let content = await fs.readFile(fullPath, 'utf8');
      
      const hasConsoleLog = /console\.log\(/g.test(content);
      const hasConsoleError = /console\.error\(/g.test(content);
      const hasConsoleWarn = /console\.warn\(/g.test(content);
      const hasConsoleInfo = /console\.info\(/g.test(content);
      
      if (hasConsoleLog || hasConsoleError || hasConsoleWarn || hasConsoleInfo) {
        let relativeToLogger = path.relative(path.dirname(fullPath), path.join(__dirname, '../src/lib/logger')).replace(/\\/g, '/');
        const importPath = relativeToLogger.startsWith('.') ? relativeToLogger : `./${relativeToLogger}`;
        
        if (!content.includes('import { logger }')) {
            const importStatement = `import { logger } from "${importPath}";\n`;
            
            // Insert after imports if possible, or at top
            const lastImportIndex = content.lastIndexOf('import ');
            if (lastImportIndex !== -1) {
              const insertPosition = content.indexOf('\n', lastImportIndex) + 1;
              content = content.slice(0, insertPosition) + importStatement + content.slice(insertPosition);
            } else {
              content = importStatement + content;
            }
        }

        content = content.replace(/console\.log\(/g, 'logger.info(');
        content = content.replace(/console\.error\(/g, 'logger.error(');
        content = content.replace(/console\.warn\(/g, 'logger.warn(');
        content = content.replace(/console\.info\(/g, 'logger.info(');

        await fs.writeFile(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(__dirname, '../src')).catch(console.error);
