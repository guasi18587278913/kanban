
/**
 * Chat Splitter Utility
 * Splits a single large chat log string into multiple daily chunks.
 */

export interface DailyChunk {
  dateStr: string;
  content: string;
}

export class ChatSplitter {
  /**
   * Main split function.
   * Tries to find date headers first. 
   * @param rawText Full content of the log file
   * @param defaultYear Fallback year if file only has MM-DD
   */
  static split(rawText: string, defaultYear: string = new Date().getFullYear().toString()): DailyChunk[] {
    const lines = rawText.split(/\r?\n/);
    const chunks: DailyChunk[] = [];
    
    let currentDateStr: string | null = null;
    let currentLines: string[] = [];

    // Regex Strategies
    // 1. Explicit Header: "— 2025-10-29 —" (Keep as fallback)
    const headerDateRegex = /[\-—]{1,}\s*(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s*[\-—]{1,}/;
    
    // 2. Message Timestamp: "... 10-29 14:55:44"
    // Captures: [1]=MM, [2]=DD
    const messageTimeRegex = /\b(\d{1,2})-(\d{1,2})\s+\d{2}:\d{2}:\d{2}/;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check for Explicit Header first
      let headerMatch = trimmed.match(headerDateRegex);
      if (headerMatch) {
         // Found explicit new date
         if (currentDateStr && currentLines.length > 0) {
           chunks.push({ dateStr: currentDateStr, content: currentLines.join('\n') });
         }
         currentDateStr = `${headerMatch[1]}-${headerMatch[2].padStart(2, '0')}-${headerMatch[3].padStart(2, '0')}`;
         currentLines = []; 
         continue; 
      }

      // Check for Message Timestamp change
      let msgMatch = trimmed.match(messageTimeRegex);
      if (msgMatch) {
          // Found a timestamp line
          const mm = msgMatch[1].padStart(2, '0');
          const dd = msgMatch[2].padStart(2, '0');
          const foundDate = `${defaultYear}-${mm}-${dd}`;

          if (currentDateStr) {
             // Enforce Monotonicity: Date cannot go backwards (ignoring quotes)
             // Only switch if foundDate > currentDateStr
             if (foundDate > currentDateStr) {
                 // Date forwarded!
                 if (currentLines.length > 0) {
                      chunks.push({ dateStr: currentDateStr, content: currentLines.join('\n') });
                 }
                 currentDateStr = foundDate;
                 currentLines = [];
             }
             // If foundDate == currentDateStr: Continue accumulating
             // If foundDate < currentDateStr: Ignore (Quote from past), continue accumulating
          } else {
             // First date found
             currentDateStr = foundDate;
          }
      }
      
      // Initialize if first line
      if (!currentDateStr && msgMatch) {
           const mm = msgMatch[1].padStart(2, '0');
           const dd = msgMatch[2].padStart(2, '0');
           currentDateStr = `${defaultYear}-${mm}-${dd}`;
      }

      if (currentDateStr) {
        currentLines.push(line);
      }
    }

    // Push last chunk
    if (currentDateStr && currentLines.length > 0) {
      chunks.push({
        dateStr: currentDateStr,
        content: currentLines.join('\n')
      });
    }

    return chunks;
  }
}
