const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('./logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const reviewQueue = new Queue('review-queue', { connection });

// We will define the worker in a separate file or within server.js
// but here we export the queue for adding jobs.
module.exports = {
    reviewQueue,
    connection
};
