const githubService = require('./githubService');
const llmService = require('./llmService');
const repoService = require('./repoService');
const usageService = require('./usageService');
const Review = require('../models/Review');
const ReviewIssue = require('../models/ReviewIssue');
const Policy = require('../models/Policy');
const { cleanAndStructureDiff } = require('../utils/diffCleaner');
const { generateFileLevelPrompts } = require('../utils/promptGenerator');
const logger = require('../utils/logger');

class ReviewService {
    /**
     * Evaluates if a PR should be blocked based on repository policy
     */
    async evaluatePolicy(repoId, analysis, traceId, repository, prNumber) {
        const policy = await Policy.findOne({ repositoryId: repoId });
        if (!policy) return { isBlocked: false, reason: '' };

        const blockingReasons = [];

        if (analysis.risk_score > policy.blockRiskThreshold) {
            blockingReasons.push(`Risk score ${analysis.risk_score} exceeds threshold of ${policy.blockRiskThreshold}`);
        }

        if (policy.blockOnHighSecurity) {
            const highSecurityIssue = analysis.issues.find(i =>
                i.category.toLowerCase() === 'security' && i.severity.toLowerCase() === 'high'
            );
            if (highSecurityIssue) {
                blockingReasons.push('High-severity security vulnerability detected');
            }
        }

        logger.info({
            traceId,
            stage: "policy_evaluation_complete",
            repository,
            prNumber,
            isBlocked: blockingReasons.length > 0
        });

        if (blockingReasons.length > 0) {
            return { isBlocked: true, reason: blockingReasons.join('. ') };
        }

        return { isBlocked: false, reason: '' };
    }

    async processReview(prData) {
        const startTime = Date.now();
        const { traceId, repository, pullRequestNumber: prNumber } = prData;

        try {
            // 0. Find or create repo and update installationId
            const repo = await repoService.findOrCreateRepo(repository, prData.installationId);
            if (!repo.settings.enabled) {
                logger.info({
                    traceId,
                    stage: "review_skipped",
                    repository,
                    prNumber,
                    message: "Repository is disabled"
                });
                return;
            }

            // 1. Fetch Diff
            logger.info({ traceId, stage: "diff_fetch_start", repository, prNumber });
            const rawDiff = await githubService.getDiff(repository, prNumber, prData.installationId);

            if (!rawDiff) {
                logger.error({ traceId, stage: "diff_fetch_failed", repository, prNumber, message: "Could not fetch PR diff" });
                throw new Error('Could not fetch PR diff');
            }
            logger.info({ traceId, stage: "diff_fetch_success", repository, prNumber });

            // 2. Clean and structure diff
            const { files: cleanedFiles } = cleanAndStructureDiff(rawDiff);

            // 3. Generate prompt
            const prompts = generateFileLevelPrompts(prData, cleanedFiles, repo.settings);
            const mainPrompt = prompts[0]?.prompt || 'No changes found to review.';

            // 4. Call LLM
            logger.info({ traceId, stage: "llm_analysis_start", repository, prNumber });
            const analysis = await llmService.analyzeDiff(mainPrompt);
            logger.info({ traceId, stage: "llm_analysis_success", repository, prNumber });

            // 5. Risk and Policy Evaluation
            logger.info({ traceId, stage: "risk_scoring_complete", repository, prNumber, riskScore: analysis.risk_score });
            const policyDecision = await this.evaluatePolicy(repo._id, analysis, traceId, repository, prNumber);
            const githubEvent = policyDecision.isBlocked ? 'REQUEST_CHANGES' : 'COMMENT';

            // 6. Save Review to MongoDB
            const processingTimeMs = Date.now() - startTime;
            const reviewStatus = analysis.issues.length > 0 ? 'issues' : 'clean';

            const review = await Review.create({
                repositoryId: repo._id,
                prNumber: prNumber,
                title: prData.title,
                author: prData.author,
                riskScore: analysis.risk_score,
                totalTokens: analysis.usage.totalTokens,
                processingTimeMs,
                status: reviewStatus,
                policyDecisionCache: {
                    isBlocked: policyDecision.isBlocked,
                    blockingReason: policyDecision.reason
                }
            });

            // 7. Save Review Issues
            if (analysis.issues && analysis.issues.length > 0) {
                const issuesToSave = analysis.issues.map(issue => {
                    const validCategories = ['security', 'bug', 'performance', 'quality'];
                    const normalizedCategory = (issue.category || '').toLowerCase().trim();
                    const category = validCategories.includes(normalizedCategory) ? normalizedCategory : 'quality';

                    return {
                        reviewId: review._id,
                        file: issue.file,
                        category,
                        severity: issue.severity,
                        description: issue.description,
                        currentCode: issue.current_code,
                        suggestedFix: issue.suggested_fix
                    };
                });
                await ReviewIssue.insertMany(issuesToSave);
            }

            logger.info({
                traceId,
                stage: "review_saved",
                repository,
                prNumber,
                reviewId: review._id
            });

            // 8. Post to GitHub
            let finalSummary = analysis.summary;
            if (policyDecision.isBlocked) {
                finalSummary = `❌ **PR BLOCKED BY POLICY**\n**Reason:** ${policyDecision.reason}\n\n${finalSummary}`;
            }

            await githubService.postReview(repository, prNumber, {
                riskScore: analysis.risk_score,
                summary: finalSummary,
                issues: analysis.issues,
                usage: analysis.usage,
                status: reviewStatus,
                event: githubEvent
            }, prData.installationId);

            // 9. Track Usage
            await usageService.trackUsage(repo._id, analysis.usage.totalTokens);

            logger.info({
                traceId,
                stage: "review_process_complete",
                repository,
                prNumber,
                reviewId: review._id,
                isBlocked: policyDecision.isBlocked
            });

        } catch (error) {
            logger.error({
                traceId,
                stage: "review_process_failed",
                repository,
                prNumber,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new ReviewService();
