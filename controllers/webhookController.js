const { reviewQueue } = require('../queues/reviewQueue');
const { validateWebhookSignature, extractPullRequestData } = require('../utils/webhookHandler');
const Repository = require('../models/Repository');
const logger = require('../utils/logger');

const handleWebhook = async (req, res) => {
    const deliveryId = req.headers['x-github-delivery'];
    const eventType = req.headers['x-github-event'];
    const traceId = deliveryId; // Use deliveryId as traceId

    try {
        const signature = req.headers['x-hub-signature-256'];

        if (!eventType || !signature || !deliveryId) {
            return res.status(400).json({ error: 'Missing required headers' });
        }

        const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!validateWebhookSignature(req.rawBody, signature, webhookSecret)) {
            logger.error({
                traceId,
                stage: 'webhook_validation_failed',
                message: 'Invalid webhook signature'
            });
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Handle Installation Events
        if (eventType === 'installation') {
            const { action, installation, repositories } = req.body;
            if (action === 'created') {
                for (const repo of repositories) {
                    await Repository.findOneAndUpdate(
                        { name: repo.full_name },
                        {
                            name: repo.full_name,
                            owner: repo.owner?.login,
                            githubId: repo.id,
                            installationId: installation.id,
                            'settings.enabled': true
                        },
                        { upsert: true, new: true }
                    );
                }
                logger.info({
                    traceId,
                    stage: 'installation_created',
                    message: 'Installation event processed and repositories synced',
                    repositoryCount: repositories.length,
                    installationId: installation.id
                });
            }
            return res.status(200).json({ success: true, message: 'Installation event processed' });
        }

        // Handle Installation Repositories Changes
        if (eventType === 'installation_repositories') {
            const { action, installation, repositories_added, repositories_removed } = req.body;

            if (action === 'added' && repositories_added) {
                for (const repo of repositories_added) {
                    await Repository.findOneAndUpdate(
                        { name: repo.full_name },
                        {
                            name: repo.full_name,
                            owner: repo.owner?.login,
                            githubId: repo.id,
                            installationId: installation.id,
                            'settings.enabled': true
                        },
                        { upsert: true, new: true }
                    );
                }
            }

            if (action === 'removed' && repositories_removed) {
                for (const repo of repositories_removed) {
                    await Repository.deleteOne({ name: repo.full_name });
                }
            }

            logger.info({
                traceId,
                stage: 'installation_repositories_updated',
                action,
                added: repositories_added?.map(r => r.full_name),
                removed: repositories_removed?.map(r => r.full_name)
            });
            return res.status(200).json({ success: true, message: 'Repositories updated' });
        }

        // Existing Pull Request Logic
        if (eventType !== 'pull_request') {
            return res.status(200).json({ message: `Event ignored (${eventType})` });
        }

        const prData = extractPullRequestData(req.body);
        if (!prData) {
            return res.status(400).json({ error: 'Invalid pull request data' });
        }

        // Add traceId to prData for downstream tracking
        prData.traceId = traceId;

        // Enqueue job to BullMQ - Use deliveryId as jobId to prevent duplicates
        await reviewQueue.add('reviewJob', { prData, deliveryId, traceId }, {
            jobId: deliveryId, // Deduplication strategy
            attempts: 2,
            removeOnComplete: true,
            backoff: {
                type: 'exponential',
                delay: 1000,
            }
        });

        logger.info({
            traceId,
            stage: 'webhook_pr_enqueued',
            repository: prData.repository,
            prNumber: prData.pullRequestNumber,
            message: `Enqueued review job for PR #${prData.pullRequestNumber}`
        });

        return res.status(200).json({
            success: true,
            message: 'Review job enqueued successfully',
            deliveryId
        });

    } catch (error) {
        logger.error({
            traceId,
            stage: 'webhook_error',
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    handleWebhook
};
