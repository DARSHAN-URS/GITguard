const logger = require('./logger');

// Dynamic import for ES Module
let Octokit;
async function getOctokit() {
  if (!Octokit) {
    const octokitModule = await import('@octokit/rest');
    Octokit = octokitModule.Octokit;
  }
  return Octokit;
}

/**
 * Fetches Pull Request diff from GitHub API
 * @param {string} repository - Repository name in format "owner/repo"
 * @param {number} pullRequestNumber - PR number
 * @param {string} githubToken - GitHub personal access token
 * @returns {Promise<string>} - Raw diff string
 */
async function fetchPullRequestDiff(repository, pullRequestNumber, githubToken) {
  const startTime = Date.now();
  
  try {
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN not configured');
    }
    
    // Initialize Octokit client (using dynamic import for ES Module)
    const OctokitClass = await getOctokit();
    const octokit = new OctokitClass({
      auth: githubToken
    });
    
    // Parse repository owner and name
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: ${repository}. Expected format: owner/repo`);
    }
    
    logger.info('📥 Fetching PR diff from GitHub API', {
      repository,
      pullRequestNumber,
      owner,
      repo
    });
    
    // Fetch PR files with patches (most reliable method)
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullRequestNumber,
      mediaType: {
        format: 'diff' // Request diff format
      }
    });
    
    // Construct unified diff from file patches
    let diff = '';
    for (const file of files) {
      if (file.patch) {
        // Construct standard unified diff format
        diff += `diff --git a/${file.filename} b/${file.filename}\n`;
        if (file.status === 'renamed') {
          diff += `rename from ${file.previous_filename}\n`;
          diff += `rename to ${file.filename}\n`;
        }
        diff += file.patch + '\n';
      } else if (file.status === 'added') {
        // For binary or large files without patch
        diff += `diff --git a/${file.filename} b/${file.filename}\n`;
        diff += `new file mode 100644\n`;
        diff += `Binary files differ\n`;
      } else if (file.status === 'removed') {
        diff += `diff --git a/${file.filename} b/${file.filename}\n`;
        diff += `deleted file mode 100644\n`;
      }
    }
    
    const fetchTime = Date.now() - startTime;
    const diffSize = Buffer.byteLength(diff, 'utf8');
    
    logger.info('✅ PR diff fetched successfully', {
      repository,
      pullRequestNumber,
      diffSizeBytes: diffSize,
      fetchTimeMs: fetchTime
    });
    
    return diff;
    
  } catch (error) {
    logger.error('Error fetching PR diff', {
      repository,
      pullRequestNumber,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Fetches PR files metadata (for language detection)
 * @param {string} repository - Repository name in format "owner/repo"
 * @param {number} pullRequestNumber - PR number
 * @param {string} githubToken - GitHub personal access token
 * @returns {Promise<Array>} - Array of file objects with metadata
 */
async function fetchPullRequestFiles(repository, pullRequestNumber, githubToken) {
  try {
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN not configured');
    }
    
    const OctokitClass = await getOctokit();
    const octokit = new OctokitClass({
      auth: githubToken
    });
    
    const [owner, repo] = repository.split('/');
    
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullRequestNumber
    });
    
    return files.map(file => ({
      filename: file.filename,
      status: file.status, // added, removed, modified, renamed
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch || ''
    }));
    
  } catch (error) {
    logger.error('Error fetching PR files', {
      repository,
      pullRequestNumber,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  fetchPullRequestDiff,
  fetchPullRequestFiles
};
