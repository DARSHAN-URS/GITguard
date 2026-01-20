const logger = require('./logger');

/**
 * Detects programming language from filename
 * @param {string} filename - File path
 * @returns {string} - Detected language or 'unknown'
 */
function detectLanguage(filename) {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  const languageMap = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'sh': 'bash',
    'bash': 'bash',
    'sql': 'sql',
    'html': 'html',
    'css': 'css',
    'scss': 'css',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'vue': 'vue',
    'svelte': 'svelte'
  };
  
  return languageMap[extension] || 'unknown';
}

/**
 * Cleans a single file diff by removing metadata and keeping only code changes
 * @param {string} fileDiff - Raw diff for a single file
 * @param {string} filename - File path
 * @returns {string} - Cleaned diff with only code changes
 */
function cleanFileDiff(fileDiff, filename) {
  if (!fileDiff) return '';
  
  const lines = fileDiff.split('\n');
  const cleanedLines = [];
  let inHunk = false;
  
  for (const line of lines) {
    // Skip diff headers (---, +++, @@)
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }
    
    // Skip hunk headers (@@ ... @@)
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    
    // Only keep lines that are additions (+) or modifications (context lines with +)
    // Skip deletions (-) unless they're part of a modified block
    if (inHunk) {
      // Keep added lines
      if (line.startsWith('+') && !line.startsWith('+++')) {
        cleanedLines.push(line.substring(1)); // Remove the + prefix
      }
      // Keep context lines (unchanged) for better understanding
      else if (line.startsWith(' ') && cleanedLines.length > 0) {
        // Only keep minimal context (2 lines before/after changes)
        cleanedLines.push(line.substring(1));
      }
      // Skip deleted lines (they're not needed for AI analysis)
      // Skip diff metadata lines
    }
  }
  
  return cleanedLines.join('\n').trim();
}

/**
 * Extracts file boundaries from raw diff
 * @param {string} rawDiff - Complete raw diff string
 * @returns {Array<Object>} - Array of file diff objects
 */
function extractFileDiffs(rawDiff) {
  if (!rawDiff || rawDiff.trim().length === 0) {
    return [];
  }
  
  const fileDiffs = [];
  const diffSections = rawDiff.split(/^diff --git /m);
  
  for (const section of diffSections) {
    if (!section.trim()) continue;
    
    // Extract filename from diff header
    const filenameMatch = section.match(/^a\/(.+?)\s+b\/(.+?)$/m);
    if (!filenameMatch) continue;
    
    const filename = filenameMatch[2]; // Use 'b' filename (new file)
    
    // Extract the patch content
    const patchMatch = section.match(/@@[\s\S]*$/m);
    const patch = patchMatch ? patchMatch[0] : '';
    
    if (patch) {
      fileDiffs.push({
        filename,
        rawDiff: `diff --git ${section}`,
        patch
      });
    }
  }
  
  return fileDiffs;
}

/**
 * Validates cleaned diff for secrets and tokens
 * @param {string} cleanedDiff - Cleaned diff content
 * @returns {Object} - Validation result with warnings
 */
function validateDiff(cleanedDiff) {
  const warnings = [];
  
  // Common secret patterns (basic check - not exhaustive)
  const secretPatterns = [
    /(api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}/i,
    /(secret|password|passwd|pwd)\s*[:=]\s*['"]?[a-zA-Z0-9]{10,}/i,
    /(token|bearer)\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}/i,
    /(aws[_-]?access[_-]?key|aws[_-]?secret)/i,
    /(private[_-]?key|ssh[_-]?key)/i
  ];
  
  for (const pattern of secretPatterns) {
    if (pattern.test(cleanedDiff)) {
      warnings.push('Potential secret or token detected in diff');
      break; // Only warn once
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  };
}

/**
 * Main function to clean and structure diff for AI analysis
 * @param {string} rawDiff - Raw diff from GitHub API
 * @param {Array} files - PR files metadata from GitHub API
 * @returns {Object} - Structured cleaned diff
 */
function cleanAndStructureDiff(rawDiff, files = []) {
  const startTime = Date.now();
  
  try {
    if (!rawDiff || rawDiff.trim().length === 0) {
      logger.warn('Empty diff received');
      return {
        files: [],
        totalFiles: 0,
        totalChanges: 0
      };
    }
    
    // Extract file diffs
    const fileDiffs = extractFileDiffs(rawDiff);
    
    // Create file metadata map for quick lookup
    const fileMetadataMap = {};
    for (const file of files) {
      fileMetadataMap[file.filename] = file;
    }
    
    // Clean and structure each file diff
    const cleanedFiles = [];
    let totalChanges = 0;
    
    for (const fileDiff of fileDiffs) {
      const filename = fileDiff.filename;
      const language = detectLanguage(filename);
      const cleanedChanges = cleanFileDiff(fileDiff.patch, filename);
      
      // Skip files with no actual code changes
      if (!cleanedChanges || cleanedChanges.trim().length === 0) {
        continue;
      }
      
      // Validate for secrets
      const validation = validateDiff(cleanedChanges);
      if (!validation.isValid) {
        logger.warn('Diff validation warnings', {
          filename,
          warnings: validation.warnings
        });
      }
      
      const fileInfo = {
        filename,
        language,
        changes: cleanedChanges
      };
      
      // Add metadata if available
      if (fileMetadataMap[filename]) {
        fileInfo.status = fileMetadataMap[filename].status;
        fileInfo.additions = fileMetadataMap[filename].additions;
        fileInfo.deletions = fileMetadataMap[filename].deletions;
      }
      
      cleanedFiles.push(fileInfo);
      totalChanges += cleanedChanges.length;
    }
    
    const processingTime = Date.now() - startTime;
    
    logger.info('Diff cleaned and structured', {
      totalFiles: cleanedFiles.length,
      totalChangesBytes: totalChanges,
      processingTimeMs: processingTime
    });
    
    return {
      files: cleanedFiles,
      totalFiles: cleanedFiles.length,
      totalChanges: totalChanges
    };
    
  } catch (error) {
    logger.error('Error cleaning diff', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  cleanAndStructureDiff,
  detectLanguage,
  validateDiff
};
