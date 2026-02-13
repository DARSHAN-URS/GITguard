const { Worker } = require('bullmq');
const { fetchPullRequestDiff, fetchPullRequestFiles } = require('./diffFetcher');
const { cleanAndStructureDiff } = require('./diffCleaner');
const { generateFileLevelPrompts } = require('./promptGenerator');
const { sendBatchToLLM } = require('./llmClient');
const { prioritizeFiles } = require('./tokenManager');
const { postReviewComment } = require('./commentBot');
const { getRepositorySettings, saveReviewHistory } = require('./storage');
const logger = require('./logger');

function aggregateJSONResponses(responses, prData) {
    const successful = responses.filter(r => !r.failed && r.response);

    if (successful.length === 0) return null;

    const allIssues = [];
    let combinedSummary = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    successful.forEach(resp => {
        if (resp.response.issues) {
            allIssues.push(...resp.response.issues);
        }
        combinedSummary += (resp.response.summary || "") + "\n\n";
        totalPromptTokens += resp.usage.promptTokens;
        totalCompletionTokens += resp.usage.completionTokens;
    });

    // Unique issues by file/line/message to avoid duplicates if chunked
    const uniqueIssuesMap = new Map();
    allIssues.forEach(issue => {
        const key = `${issue.file}-${issue.line}-${issue.message}`;
        uniqueIssuesMap.set(key, issue);
    });

    return {
        summary: combinedSummary.trim(),
        issues: Array.from(uniqueIssuesMap.values()),
        usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens
        }
    };
}

const startWorker = (connection) => {
    const worker = new Worker('review-queue', async (job) => {
        const { prData, deliveryId } = job.data;
        logger.info(`Processing background review job ${job.id}`, { repository: prData.repository, pr: prData.pullRequestNumber });

        try {
            const repoSettings = await getRepositorySettings(prData.repository);
            if (!repoSettings.enabled) return;

            const githubToken = process.env.GITHUB_TOKEN;
            const [rawDiff, files] = await Promise.all([
                fetchPullRequestDiff(prData.repository, prData.pullRequestNumber, githubToken),
                fetchPullRequestFiles(prData.repository, prData.pullRequestNumber, githubToken)
            ]);

            const { files: cleanedDiff } = cleanAndStructureDiff(rawDiff, files);
            const prioritizedFiles = prioritizeFiles(cleanedDiff);
            const filePrompts = generateFileLevelPrompts(prData, prioritizedFiles, repoSettings);

            const groqKey = process.env.GROQ_API_KEY;
            const delayBetweenCalls = parseInt(process.env.LLM_DELAY_MS || '1000', 10);
            const llmResponses = await sendBatchToLLM(filePrompts, groqKey, { delayBetweenCalls });

            const aggregated = aggregateJSONResponses(llmResponses, prData);
            if (!aggregated) return;

            // Deterministic risk scoring is already done in sendToLLM but we might want to re-calculate for aggregated issues
            const weights = { 'Critical': 40, 'High': 20, 'Medium': 10, 'Low': 5 };
            aggregated.risk_score = Math.min(100, aggregated.issues.reduce((sum, i) => sum + (weights[i.severity] || 5), 0));

            // Save to MongoDB
            await saveReviewHistory({
                repository: prData.repository,
                pullRequestNumber: prData.pullRequestNumber,
                title: prData.title,
                author: prData.author,
                llmResponse: aggregated,
                processingTimeMs: Date.now() - job.timestamp
            });

            // Post comment if enabled
            if (process.env.COMMENT_BOT_ENABLED === 'true') {
                const commentBody = `## 🤖 GitGuard AI Review\n\n**Risk Score: ${aggregated.risk_score}/100**\n\n${aggregated.summary}\n\n### Issues Found: ${aggregated.issues.length}\n` +
                    aggregated.issues.map(i => `- **[${i.type}]** ${i.file}:${i.line || '?'} - ${i.title}\n  *${i.message}*\n  > Suggestion: ${i.suggestion}`).join('\n\n');

                await postReviewComment({
                    repository: prData.repository,
                    pullRequestNumber: prData.pullRequestNumber,
                    reviewBody: commentBody,
                    githubToken
                });
            }

        } catch (error) {
            logger.error(`Error in worker job ${job.id}`, { error: error.message, stack: error.stack });
            throw error;
        }
    }, { connection });

    worker.on('completed', job => {
        logger.info(`Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`Job ${job.id} failed`, { error: err.message });
    });

    return worker;
};

module.exports = startWorker;
