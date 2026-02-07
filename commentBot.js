const logger = require('./logger');

// Dynamic import for Octokit (ESM)
let Octokit;
async function getOctokit() {
  if (!Octokit) {
    const octokitModule = await import('@octokit/rest');
    Octokit = octokitModule.Octokit;
  }
  return Octokit;
}

/**
 * Posts an LLM review back to GitHub as a Pull Request review comment.
 * Uses GitHub-flavored Markdown for readability.
 *
 * @param {Object} params
 * @param {string} params.repository - Repository in "owner/repo" format
 * @param {number} params.pullRequestNumber - Pull request number
 * @param {string} params.reviewBody - Markdown review content
 * @param {string} params.githubToken - GitHub token with repo permissions
 */
async function postReviewComment({ repository, pullRequestNumber, reviewBody, githubToken }) {
  const startTime = Date.now();

  try {
    if (!githubToken) {
      throw new Error('GitHub token not provided for comment bot');
    }

    const [owner, repo] = (repository || '').split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: ${repository}. Expected "owner/repo"`);
    }

    if (!reviewBody || !reviewBody.trim()) {
      logger.warn('Comment bot skipped: empty review body', {
        repository,
        pullRequestNumber
      });
      return null;
    }

    const OctokitClass = await getOctokit();
    const octokit = new OctokitClass({
      auth: githubToken
    });

    logger.info('📝 Posting review comment to GitHub', {
      repository,
      pullRequestNumber
    });

    const response = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullRequestNumber,
      body: reviewBody,
      event: 'COMMENT'
    });

    const processingTime = Date.now() - startTime;

    logger.info('✅ Review comment posted to GitHub', {
      repository,
      pullRequestNumber,
      reviewId: response.data.id,
      state: response.data.state,
      processingTimeMs: processingTime
    });

    return response.data;
  } catch (error) {
    logger.error('Error posting review comment to GitHub', {
      repository,
      pullRequestNumber,
      error: error.message,
      stack: error.stack
    });
    // Do not throw – comment failures should not break webhook processing
    return null;
  }
}

module.exports = {
  postReviewComment
};
