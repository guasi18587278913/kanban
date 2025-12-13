
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
  compatibility: 'compatible',
});

async function main() {
  console.log('Testing DeepSeek connection...');
  try {
    const result = await generateText({
      model: deepseek.chat('deepseek-chat'),
      prompt: 'Hello, are you V3?',
    });
    console.log('Success:', result.text);
  } catch (e) {
    console.error('Error:', e);
  }
}
main();
