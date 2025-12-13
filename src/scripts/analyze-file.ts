
import fs from 'fs';
import path from 'path';
import { ChatSplitter } from '@/lib/chat-splitter';

async function main() {
  const args = process.argv.slice(2);
  const targetFile = args[0];

  if (!targetFile) {
    console.error('Usage: npx tsx src/scripts/analyze-file.ts <filename_in_public_import>');
    console.log('Available files:');
    const importDir = path.join(process.cwd(), 'public', 'import');
    if (fs.existsSync(importDir)) {
        fs.readdirSync(importDir).forEach(f => console.log(` - ${f}`));
    }
    process.exit(1);
  }

  const filePath = path.join(process.cwd(), 'public', 'import', targetFile);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Analyzing: ${targetFile}...`);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // 1. Run Splitter
  const chunks = ChatSplitter.split(content);
  
  console.log(`\n--- SPLIT RESULTS ---`);
  console.log(`Found ${chunks.length} daily chunks.`);
  
  if (chunks.length === 0) {
      console.log('⚠️ No date boundaries detected with current Regex strategies.');
      console.log('Sample of first 20 lines:');
      console.log(content.split('\n').slice(0, 20).join('\n'));
  } else {
      chunks.forEach(c => {
          console.log(`📅 [${c.dateStr}] - ${c.content.length} chars - ${c.content.split('\n').length} lines`);
      });
  }
  console.log('---------------------');
}

main();
