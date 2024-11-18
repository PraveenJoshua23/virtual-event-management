const winston = require('winston');
const { format } = winston;
const { combine, timestamp, printf, colorize } = format;
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Custom format for logs
const logFormat = printf(({ level, message, timestamp, userId, action, eventId }) => {
    const baseLog = `${timestamp} [${level}]: ${message}`;
    const metadata = [
        userId ? `userId=${userId}` : null,
        eventId ? `eventId=${eventId}` : null,
        action ? `action=${action}` : null
    ].filter(Boolean).join(', ');
    
    return metadata ? `${baseLog} - [${metadata}]` : baseLog;
});

const logger = winston.createLogger({
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        // Console transport
        new winston.transports.Console({
            format: combine(
                colorize(),
                timestamp(),
                logFormat
            )
        }),
        // File transport for all logs
        new winston.transports.File({ 
            filename: 'logs/events.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Separate file for error logs
        new winston.transports.File({ 
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ]
});

// In-memory storage for logs
const inMemoryLogs = new Map();

const addToMemoryLog = (userId, log) => {
    if (!inMemoryLogs.has(userId)) {
        inMemoryLogs.set(userId, []);
    }
    inMemoryLogs.get(userId).push(log);
    
    // Keep only last 1000 logs per user
    const userLogs = inMemoryLogs.get(userId);
    if (userLogs.length > 1000) {
        inMemoryLogs.set(userId, userLogs.slice(-1000));
    }
};

// Enhanced logging function
const logEvent = (level, message, metadata = {}) => {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...metadata
        };

        // Log to Winston
        logger.log({
            level,
            message,
            timestamp,
            ...metadata
        });

        // Store in memory if userId is provided
        if (metadata.userId) {
            if (!inMemoryLogs.has(metadata.userId)) {
                inMemoryLogs.set(metadata.userId, []);
            }
            inMemoryLogs.get(metadata.userId).push(logEntry);

            // Keep only last 1000 logs per user
            const userLogs = inMemoryLogs.get(metadata.userId);
            if (userLogs.length > 1000) {
                inMemoryLogs.set(metadata.userId, userLogs.slice(-1000));
            }
        }

        return logEntry;
    } catch (error) {
        console.error('Error in logEvent:', error);
        throw error;
    }
};

module.exports = { logger, logEvent, inMemoryLogs };