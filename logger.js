/**
 * Simple structured logger for GitGuard AI
 * Logs to console with structured, ordered format for better readability
 */

const logLevels = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// Color codes for terminal output
const colors = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[90m', // Gray
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

function formatLog(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  
  // Order metadata fields for consistent output
  const orderedMetadata = {};
  const fieldOrder = [
    'repository',
    'pullRequestNumber',
    'title',
    'author',
    'action',
    'eventType',
    'deliveryId',
    'owner',
    'repo',
    'diffSizeBytes',
    'fetchTimeMs',
    'totalFiles',
    'filesProcessed',
    'totalChangesBytes',
    'processingTimeMs',
    'diffFiles',
    'receivedAt',
    'port',
    'environment',
    'endpoint',
    'timestamp'
  ];
  
  // Add ordered fields first
  for (const field of fieldOrder) {
    if (metadata[field] !== undefined) {
      orderedMetadata[field] = metadata[field];
    }
  }
  
  // Add any remaining fields
  for (const key in metadata) {
    if (!orderedMetadata[key] && !fieldOrder.includes(key)) {
      orderedMetadata[key] = metadata[key];
    }
  }
  
  // Create structured log entry
  const logEntry = {
    timestamp,
    level,
    message,
    ...orderedMetadata
  };
  
  // Format for console output (readable format)
  if (process.env.LOG_FORMAT === 'json') {
    // JSON format for parsing
    return JSON.stringify(logEntry);
  } else {
    // Human-readable format
    const color = colors[level] || '';
    const reset = colors.RESET;
    const bold = colors.BOLD;
    
    let output = `${color}${bold}[${level}]${reset} ${message}\n`;
    output += `  ${bold}Timestamp:${reset} ${timestamp}\n`;
    
    // Add metadata in ordered format
    for (const [key, value] of Object.entries(orderedMetadata)) {
      if (key !== 'timestamp') {
        const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        output += `  ${bold}${formattedKey}:${reset} ${value}\n`;
      }
    }
    
    return output;
  }
}

const logger = {
  error: (message, metadata) => {
    console.error(formatLog(logLevels.ERROR, message, metadata));
  },
  
  warn: (message, metadata) => {
    console.warn(formatLog(logLevels.WARN, message, metadata));
  },
  
  info: (message, metadata) => {
    console.log(formatLog(logLevels.INFO, message, metadata));
  },
  
  debug: (message, metadata) => {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      console.log(formatLog(logLevels.DEBUG, message, metadata));
    }
  }
};

module.exports = logger;

