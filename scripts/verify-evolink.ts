
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const API_KEY = 'sk-ZKFbxCuS1FF0yZXD1leHCJFjQYG0f9l4mhsHB7IcHsc5Zulv';
const BASE_URL = 'https://api.evolink.ai/v1';
const MODEL = 'gemini-2.5-flash';

async function runFetch() {
  console.log('--- Testing with FETCH ---');
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Hello from fetch' }],
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Fetch Failed:', response.status, text);
    } else {
      const data = await response.json();
      console.log('Fetch Success:', data.choices[0].message.content);
    }
  } catch (e) {
    console.error('Fetch Exception:', e);
  }
}

async function runSDK() {
  console.log('\n--- Testing with AI SDK ---');
  try {
    const openai = createOpenAI({
      apiKey: API_KEY,
      baseURL: BASE_URL,
    });

    const { text } = await generateText({
      model: openai.chat(MODEL),
      prompt: 'Hello from SDK',
    });
    console.log('SDK Success:', text);
  } catch (e) {
    console.error('SDK Failed:', e);
  }
}

async function main() {
  await runFetch();
  await runSDK();
}

main();
