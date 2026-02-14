const { Worker } = require('bullmq');
const { connection } = require('../queues/reviewQueue');
const reviewService = require('../services/reviewService');
const logger = require('../utils/logger');

const startWorker = () => {
    const worker = new Worker('reviewQueue', async (job) => {
        const { prData, traceId } = job.data;
        const repository = prData?.repository;
        const prNumber = prData?.pullRequestNumber;

        logger.info({
            traceId,
            jobId: job.id,
            stage: "worker_started",
            repository,
            prNumber,
            message: `Starting worker for job ${job.id}`
        });

        try {
            await reviewService.processReview(prData);

            logger.info({
                traceId,
                jobId: job.id,
                stage: "worker_completed",
                repository,
                prNumber,
                message: `Job ${job.id} completed successfully`
            });
        } catch (error) {
            logger.error({
                traceId,
                jobId: job.id,
                stage: "worker_failed",
                repository,
                prNumber,
                message: `Job ${job.id} failed in service layer`,
                error: error.message
            });
            throw error; // Re-throw to trigger BullMQ retry
        }
    }, {
        connection,
        concurrency: 2,
        limiter: {
            max: 10,
            duration: 1000
        }
    });

    worker.on('failed', (job, err) => {
        if (job) {
            const { prData, traceId } = job.data;
            logger.error({
                traceId,
                jobId: job.id,
                stage: "worker_job_exhausted",
                repository: prData?.repository,
                prNumber: prData?.pullRequestNumber,
                message: `Job ${job.id} failed after all attempts`,
                error: err.message
            });
        }
    });

    logger.info('Review worker started and listening to reviewQueue');
    return worker;
};

// If this file is run directly, start the worker
if (require.main === module) {
    startWorker();
}

module.exports = startWorker;
