/**
 * Simple structured logger for GitGuard AI
 * Logs to console with structured JSON format for better parsing
 */

const logLevels = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

function formatLog(level, message, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };
  
  return JSON.stringify(logEntry);
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

