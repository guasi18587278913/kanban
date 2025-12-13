import { extractWithLLM } from '../lib/community-llm-extractor';
import * as fs from 'fs';
import * as path from 'path';

async function auditOneFile() {
  const importDir = path.join(process.cwd(), 'private/import');
  
  if (!fs.existsSync(importDir)) {
    console.error(`Directory not found: ${importDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(importDir).filter(f => f.endsWith('.txt'));
  if (files.length === 0) {
    console.log('Please put a .txt file in private/import to audit.');
    process.exit(0);
  }

  console.log(`Found ${files.length} files to audit.\n`);

  for (const file of files) {
    console.log(`\n================================================`);
    console.log(`🔍 Auditing File: ${file}`);
    console.log(`================================================\n`);
    
    const content = fs.readFileSync(path.join(importDir, file), 'utf-8');
    
    try {
      const start = Date.now();
      const result = await extractWithLLM(file, content);
      const duration = (Date.now() - start) / 1000;

      console.log(`✅ Extraction Complete (${duration.toFixed(1)}s)`);
      console.log('------------------------------------------------');
      console.log(`📅 Date: ${result.reportDate.toLocaleDateString()}`);
      console.log(`👥 Group: ${result.productLine} ${result.period ?? ''} ${result.groupNumber}群`);
      console.log('------------------------------------------------');
      console.log(`💬 Messages: ${result.messageCount}`);
      console.log(`👥 Active Users: ${result.activeUserCount ?? 'N/A'}`);
      console.log(`❓ Questions: ${result.questionCount}`);
      console.log(`⏱️ Avg Response: ${result.avgResponseTime} min`);
      console.log(`✅ Resolution Rate: ${result.resolutionRate}%`);
    
    console.log('\n❓ [Questions Identified]');
    if (result.questions && result.questions.length > 0) {
      result.questions.forEach(q => {
        console.log(`- 🗣️ ${q.author || 'Someone'}: ${q.content}`);
        if (q.reply) console.log(`  ↪️ Reply: ${q.reply}`);
      });
    } else {
      console.log('- (None extracted as separate list)');
    }

    console.log(`🎉 Good News: ${result.goodNewsCount}`);
      console.log('------------------------------------------------');
      
      console.log('\n🔍 [Top Star Students Identified]');
      result.starStudents.forEach(s => {
        console.log(`- 👤 ${s.name} [${s.type}]`);
        console.log(`  💡 Reason: ${s.achievement}`);
      });

      console.log('\n🔍 [Top KOCs Identified]');
      result.kocs.forEach(k => {
        console.log(`- 🗣️ ${k.name} [${k.type || 'Contributor'}]`);
        console.log(`  💡 Reason: ${k.contribution}`);
      });
      if (result.goodNews && result.goodNews.length > 0) {
        result.goodNews.forEach(gn => {
          console.log(`- ✨ ${gn.author ? gn.author + ': ' : ''}${gn.content}`);
        });
      } else {
        console.log('- (None)');
      }

      console.log('\n🔍 [Top KOCs Identified]');
      result.kocs.forEach(k => {
        console.log(`- 🗣️ ${k.name}: ${k.contribution}`);
      });

      console.log('\n📜 [Generated Report Preview (First 5 lines)]');
      console.log(result.fullText.split('\n').slice(0, 5).join('\n'));
      console.log('(...truncated...)');

    } catch (error) {
      console.error(`❌ Audit Failed for ${file}:`, error);
    }
    
    // Small delay between files
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

auditOneFile();
