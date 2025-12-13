
import { parseCommunityReport } from './src/lib/community-parser';

const sampleText = `
1. 群活跃率
消息总量： 约 320+ 条 (非常活跃)。
活跃特征：
刷屏级互动： 晚间 19:56 - 20:00...
`;

console.log('--- Debugging Regex ---');
// Testing new regex for message count
const regex = /(?:总消息数|消息总量)[：:]\s*(?:约)?\s*[*]*(\d+)/;
const match = sampleText.match(regex);
console.log('Match Result:', match ? match[1] : 'No match');

console.log('--- Parsing Sample Text ---');
const parsed = parseCommunityReport('深海圈丨AI产品出海1期2群_2025-12-03.txt', sampleText);
console.log(JSON.stringify(parsed, null, 2));
