const logger = require('./logger');

// Hard token limit per request (configurable via env)
const MAX_TOKENS_PER_REQUEST = parseInt(process.env.MAX_TOKENS_PER_REQUEST || '5000', 10);
const TOKENS_PER_CHAR = 0.25; // Conservative: 1 token ≈ 4 characters

/**
 * Estimates token count for a given text
 * @param {string} text - Text to estimate
 * @returns {number} - Estimated token count
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

/**
 * Splits file content into chunks that fit within token limit
 * @param {string} content - File content to chunk
 * @param {number} maxTokens - Maximum tokens per chunk
 * @returns {Array<string>} - Array of content chunks
 */
function chunkFileContent(content, maxTokens = MAX_TOKENS_PER_REQUEST) {
  if (!content || content.trim().length === 0) {
    return [];
  }

  const estimatedTokens = estimateTokens(content);
  
  // If content fits in one chunk, return as-is
  if (estimatedTokens <= maxTokens) {
    return [content];
  }

  // Split by lines and group into chunks
  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    
    // If single line exceeds limit, split it (shouldn't happen, but safety check)
    if (lineTokens > maxTokens) {
      // If we have accumulated content, save it first
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
        currentTokens = 0;
      }
      // Split the oversized line by character count
      const maxChars = Math.floor(maxTokens / TOKENS_PER_CHAR);
      const lineChunks = [];
      for (let i = 0; i < line.length; i += maxChars) {
        lineChunks.push(line.substring(i, i + maxChars));
      }
      chunks.push(...lineChunks);
      continue;
    }

    // Check if adding this line would exceed limit
    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [line];
      currentTokens = lineTokens;
    } else {
      currentChunk.push(line);
      currentTokens += lineTokens;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
}

/**
 * Validates that a prompt will not exceed token limits
 * @param {string} prompt - Prompt to validate
 * @returns {Object} - Validation result with estimated tokens
 */
function validatePromptTokens(prompt) {
  const estimatedTokens = estimateTokens(prompt);
  const isValid = estimatedTokens <= MAX_TOKENS_PER_REQUEST;

  return {
    isValid,
    estimatedTokens,
    maxTokens: MAX_TOKENS_PER_REQUEST,
    exceedsLimit: !isValid
  };
}

/**
 * Prioritizes files for review (high-risk files first)
 * @param {Array} files - Array of file objects with changes
 * @returns {Array} - Prioritized file list
 */
function prioritizeFiles(files) {
  // Copy array to avoid mutation
  const prioritized = [...files];

  // Sort by risk factors:
  // 1. Security-sensitive extensions (.env, config, auth, etc.)
  // 2. Large changes (more likely to have issues)
  // 3. Core application files (src/, lib/, app/)
  
  prioritized.sort((a, b) => {
    const aRisk = calculateFileRisk(a);
    const bRisk = calculateFileRisk(b);
    return bRisk - aRisk; // Higher risk first
  });

  return prioritized;
}

/**
 * Calculates risk score for a file (0-100)
 * @param {Object} file - File object with filename, changes, etc.
 * @returns {number} - Risk score
 */
function calculateFileRisk(file) {
  let risk = 0;
  const filename = file.filename?.toLowerCase() || '';
  const changes = file.changes || '';

  // Security-sensitive files
  if (filename.includes('.env') || filename.includes('config') || 
      filename.includes('secret') || filename.includes('credential') ||
      filename.includes('auth') || filename.includes('password')) {
    risk += 50;
  }

  // Core application files
  if (filename.includes('/src/') || filename.includes('/lib/') || 
      filename.includes('/app/') || filename.includes('/core/')) {
    risk += 20;
  }

  // Large changes (more code = more potential issues)
  const changeSize = changes.length;
  if (changeSize > 10000) risk += 20;
  else if (changeSize > 5000) risk += 10;
  else if (changeSize > 1000) risk += 5;

  // Security-related keywords in changes
  const securityKeywords = ['password', 'secret', 'token', 'api_key', 'auth', 'credential'];
  if (securityKeywords.some(keyword => changes.toLowerCase().includes(keyword))) {
    risk += 15;
  }

  return Math.min(risk, 100);
}

module.exports = {
  estimateTokens,
  chunkFileContent,
  validatePromptTokens,
  prioritizeFiles,
  calculateFileRisk,
  MAX_TOKENS_PER_REQUEST
};
