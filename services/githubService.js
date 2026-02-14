const githubAppService = require('./githubAppService');
const logger = require('../utils/logger');

let Octokit;
async function getOctokit() {
    if (!Octokit) {
        const octokitModule = await import('@octokit/rest');
        Octokit = octokitModule.Octokit;
    }
    return Octokit;
}

class GitHubService {
    async getClient(installationId) {
        if (!installationId) {
            // Fallback to static token for backward compatibility if configured, 
            // but elite upgrade requires installationId
            const staticToken = process.env.GITHUB_TOKEN;
            if (staticToken) {
                const OctokitClass = await getOctokit();
                return new OctokitClass({ auth: staticToken });
            }
            throw new Error('Installation ID or GITHUB_TOKEN required');
        }

        const token = await githubAppService.getInstallationAccessToken(installationId);
        const OctokitClass = await getOctokit();
        return new OctokitClass({ auth: token });
    }

    async getDiff(repository, prNumber, installationId) {
        try {
            const octokit = await this.getClient(installationId);
            const [owner, repo] = repository.split('/');

            const { data: files } = await octokit.rest.pulls.listFiles({
                owner,
                repo,
                pull_number: prNumber,
            });

            let diff = '';
            for (const file of files) {
                if (file.patch) {
                    diff += `diff --git a/${file.filename} b/${file.filename}\n`;
                    diff += file.patch + '\n';
                }
            }
            return diff;
        } catch (error) {
            logger.error('Error fetching diff', { repository, prNumber, error: error.message });
            throw error;
        }
    }

    async postReview(repository, prNumber, reviewData, installationId) {
        try {
            const octokit = await this.getClient(installationId);
            const [owner, repo] = repository.split('/');

            const { riskScore, summary, issues, usage, status, event = 'COMMENT' } = reviewData;

            const summaryBody = `## 🛡️ GitGuard AI Review Summary
**Risk Score:** ${riskScore}/100
**Status:** ${status.toUpperCase()}

${summary}

---
**Stats:**
- Issues: ${issues.length}
- Tokens: ${usage.totalTokens}
- Reviewer: GitGuard AI Elite`;

            const inlineComments = issues
                .filter(issue => issue.file)
                .map(issue => ({
                    path: issue.file,
                    side: 'RIGHT',
                    line: issue.line || 1,
                    body: `**[${issue.category.toUpperCase()}] ${issue.severity.toUpperCase()}**\n${issue.description}\n\n**Suggested Fix:**\n\`\`\`\n${issue.suggested_fix}\n\`\`\``
                }));

            await octokit.rest.pulls.createReview({
                owner,
                repo,
                pull_number: prNumber,
                body: summaryBody,
                event: event, // Can be COMMENT or REQUEST_CHANGES
                comments: inlineComments.length > 0 ? inlineComments : undefined
            });

            logger.info(`Posted GitHub review for PR #${prNumber} with event ${event}`);
        } catch (error) {
            logger.error('Failed to post GitHub review', { error: error.message });
        }
    }
}

module.exports = new GitHubService();
