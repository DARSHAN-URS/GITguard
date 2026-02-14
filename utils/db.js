const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gitguard';
        await mongoose.connect(mongoURI);
        logger.info('✅ MongoDB Connected');
    } catch (err) {
        logger.error('❌ MongoDB Connection Error', { error: err.message });
        process.exit(1);
    }
};

module.exports = connectDB;
