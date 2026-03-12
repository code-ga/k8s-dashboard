import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function processDirectory(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else if (entry.name.endsWith('.ts') && 
               !fullPath.includes(path.normalize('src/utils/logger.ts')) && 
               !fullPath.includes(path.normalize('src/middleware/logger.ts'))) {
      
      let content = await fs.readFile(fullPath, 'utf8');
      
      const hasConsoleLog = /console\.log\(/g.test(content);
      const hasConsoleError = /console\.error\(/g.test(content);
      const hasConsoleWarn = /console\.warn\(/g.test(content);
      const hasConsoleInfo = /console\.info\(/g.test(content);
      
      if (hasConsoleLog || hasConsoleError || hasConsoleWarn || hasConsoleInfo) {
        // Calculate relative path to logger
        const relativeToSrc = path.relative(path.dirname(fullPath), path.join(__dirname, '../src/utils/logger')).replace(/\\/g, '/');
        const importPath = relativeToSrc.startsWith('.') ? relativeToSrc : `./${relativeToSrc}`;
        
        // Add import if not present
        if (!content.includes('import { logger }')) {
            // Find a good spot to insert (e.g. after other imports or top of file)
            const importStatement = `import { logger } from "${importPath}";\n`;
            
            // Just insert at top for simplicity, ignoring shebang lines since it's backend code 
            content = importStatement + content;
        }

        // Replace calls
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
