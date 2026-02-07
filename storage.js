const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

const STORAGE_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(STORAGE_DIR, 'repository-settings.json');
const HISTORY_FILE = path.join(STORAGE_DIR, 'review-history.json');

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    logger.error('Error creating storage directory', { error: error.message });
    throw error;
  }
}

// Initialize default files if they don't exist
async function initializeStorage() {
  await ensureStorageDir();
  
  try {
    await fs.access(SETTINGS_FILE);
  } catch {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify({}, null, 2));
    logger.info('Initialized repository settings file');
  }
  
  try {
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, JSON.stringify([], null, 2));
    logger.info('Initialized review history file');
  }
}

/**
 * Get repository settings (defaults if not set)
 * @param {string} repository - Repository in "owner/repo" format
 * @returns {Promise<Object>} Repository settings
 */
async function getRepositorySettings(repository) {
  await initializeStorage();
  
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(data);
    
    // Return repository-specific settings or defaults
    return settings[repository] || {
      strictMode: false,
      ignoreStyling: false,
      ignoreLinter: false,
      enabled: true
    };
  } catch (error) {
    logger.error('Error reading repository settings', { error: error.message });
    // Return defaults on error
    return {
      strictMode: false,
      ignoreStyling: false,
      ignoreLinter: false,
      enabled: true
    };
  }
}

/**
 * Update repository settings
 * @param {string} repository - Repository in "owner/repo" format
 * @param {Object} updates - Settings to update
 * @returns {Promise<Object>} Updated settings
 */
async function updateRepositorySettings(repository, updates) {
  await initializeStorage();
  
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(data);
    
    // Initialize repository if not exists
    if (!settings[repository]) {
      settings[repository] = {
        strictMode: false,
        ignoreStyling: false,
        ignoreLinter: false,
        enabled: true
      };
    }
    
    // Update settings
    settings[repository] = {
      ...settings[repository],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    
    logger.info('Repository settings updated', {
      repository,
      updates
    });
    
    return settings[repository];
  } catch (error) {
    logger.error('Error updating repository settings', {
      repository,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get all repository settings
 * @returns {Promise<Object>} All repository settings
 */
async function getAllRepositorySettings() {
  await initializeStorage();
  
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('Error reading all repository settings', { error: error.message });
    return {};
  }
}

/**
 * Save review history entry
 * @param {Object} reviewData - Review data to save
 * @returns {Promise<void>}
 */
async function saveReviewHistory(reviewData) {
  await initializeStorage();
  
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8');
    const history = JSON.parse(data);
    
    const entry = {
      id: `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...reviewData,
      createdAt: new Date().toISOString()
    };
    
    history.unshift(entry); // Add to beginning
    
    // Keep only last 1000 reviews (prevent file from growing too large)
    if (history.length > 1000) {
      history.splice(1000);
    }
    
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
    
    logger.info('Review history saved', {
      repository: reviewData.repository,
      pullRequestNumber: reviewData.pullRequestNumber,
      reviewId: entry.id
    });
  } catch (error) {
    logger.error('Error saving review history', {
      error: error.message,
      repository: reviewData.repository
    });
    // Don't throw - history saving shouldn't break reviews
  }
}

/**
 * Get review history
 * @param {Object} filters - Optional filters (repository, limit, offset)
 * @returns {Promise<Array>} Review history entries
 */
async function getReviewHistory(filters = {}) {
  await initializeStorage();
  
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8');
    let history = JSON.parse(data);
    
    // Filter by repository if specified
    if (filters.repository) {
      history = history.filter(entry => entry.repository === filters.repository);
    }
    
    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    
    return history.slice(offset, offset + limit);
  } catch (error) {
    logger.error('Error reading review history', { error: error.message });
    return [];
  }
}

/**
 * Get review statistics
 * @param {string} repository - Optional repository filter
 * @returns {Promise<Object>} Statistics
 */
async function getReviewStatistics(repository = null) {
  await initializeStorage();
  
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8');
    let history = JSON.parse(data);
    
    if (repository) {
      history = history.filter(entry => entry.repository === repository);
    }
    
    const total = history.length;
    const byType = {
      Bug: 0,
      Security: 0,
      Performance: 0,
      Quality: 0
    };
    
    history.forEach(entry => {
      if (entry.issues && Array.isArray(entry.issues)) {
        entry.issues.forEach(issue => {
          if (issue.type && byType[issue.type] !== undefined) {
            byType[issue.type]++;
          }
        });
      }
    });
    
    return {
      totalReviews: total,
      issuesByType: byType,
      repositories: repository ? 1 : new Set(history.map(h => h.repository)).size
    };
  } catch (error) {
    logger.error('Error calculating review statistics', { error: error.message });
    return {
      totalReviews: 0,
      issuesByType: { Bug: 0, Security: 0, Performance: 0, Quality: 0 },
      repositories: 0
    };
  }
}

module.exports = {
  initializeStorage,
  getRepositorySettings,
  updateRepositorySettings,
  getAllRepositorySettings,
  saveReviewHistory,
  getReviewHistory,
  getReviewStatistics
};
