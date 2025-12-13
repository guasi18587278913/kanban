import fs from 'fs';
import path from 'path';
import { importRawChatLogWithLLM_Script } from '@/actions/community-actions';

async function run() {
  const base = path.join(process.cwd(), 'private/import/AI产品出海');
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (full.endsWith('.txt')) files.push(full);
    }
  };
  walk(base);
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const targets = files.slice(0, 2); // latest 2 by mtime

  console.log('Importing files via LLM:', targets);
  for (const file of targets) {
    const content = fs.readFileSync(file, 'utf-8');
    const filename = path.basename(file);
    try {
      const res = await importRawChatLogWithLLM_Script(filename, content);
      console.log(filename, res);
    } catch (e) {
      console.error('Failed', filename, e);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
