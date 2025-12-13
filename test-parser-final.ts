
import { parseCommunityReport } from './src/lib/community-parser';

// Polyfill/Mock function to test logic without importing the whole file if needed, 
// but here we will actually use the real parser function but overwrite the regex inside the test 
// to see if the NEW regex works. 
// Actually simpler: I'll write the regex testing logic right here.

const snippets = [
    {
        name: "Pattern 1 (AI Product 1-1)",
        text: `*   **总消息数：** 43 条\n*   **识别提问：** 共 **3** 个有效业务提问。`,
        expectedMessage: 43,
        expectedQuestion: 3
    },
    {
        name: "Pattern 2 (YouTube)",
        text: `*   **消息总量：** **约 240+ 条**。\n*   **有效提问：** **11 个**。`,
        expectedMessage: 240,
        expectedQuestion: 11
    },
    {
        name: "Pattern 3 (Bilibili)",
        text: `*   **消息总量：** **约 320+ 条**（非常活跃）。\n*   **有效提问：** **9 个**。`,
        expectedMessage: 320,
        expectedQuestion: 9
    },
    {
        name: "Pattern 4 (AI Product 1-2 Header Style)",
        text: `#### 1. 群活跃率（极客特征）\n*   **活跃时段：**\n\n#### 2. 提问数量\n*   **共 3 个具体问题：**`,
        expectedMessage: 0, // No message count in this snippet
        expectedQuestion: 3
    }
];

function testRegex(snippets: any[]) {
    // Proposed Regexes
    const messageRegex = /(?:总消息数|消息总量)[：:]\s*[*]*[\s*约共]*(\d+)/; 
    // Added \s*[*]* to handle space and stars before the set, and the set includes space, star, '约', '共'
    // Let's refine: 
    // After colon [：:], we want to skip any sequence of: whitespace, '*', '约', '共', 'total' (maybe?)
    const messageRegexFinal = /(?:总消息数|消息总量)[：:][\s*约共]*(\d+)/;

    // Question Regex strategies
    // 1. Look for label + colon pattern
    const questionRegex1 = /(?:识别提问|有效提问|提问数量)[：:][\s*约共]*(\d+)/;
    // 2. Look for header pattern (提问数量 ... * ... number)
    const questionRegex2 = /提问数量[\s\S]*?[*•]\s*[^\d\n]*(\d+)\s*(?:个|条)/;

    console.log("--- Testing Regexes ---");
    snippets.forEach(s => {
        console.log(`\nSnippet: ${s.name}`);
        
        // Message Test
        const mMatch = s.text.match(messageRegexFinal);
        const mVal = mMatch ? parseInt(mMatch[1]) : 0;
        console.log(`  Message: Got ${mVal}, Expected ${s.expectedMessage} -> ${mVal === s.expectedMessage ? 'PASS' : 'FAIL'}`);

        // Question Test
        let qVal = 0;
        const qMatch1 = s.text.match(questionRegex1);
        if (qMatch1) {
             qVal = parseInt(qMatch1[1]);
        } else {
             const qMatch2 = s.text.match(questionRegex2);
             if (qMatch2) qVal = parseInt(qMatch2[1]);
        }
        
        console.log(`  Question: Got ${qVal}, Expected ${s.expectedQuestion} -> ${qVal === s.expectedQuestion ? 'PASS' : 'FAIL'}`);
    });
}

testRegex(snippets);
