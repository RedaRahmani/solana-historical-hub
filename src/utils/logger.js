const winston = require('winston');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'solana-historical-hub' },
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0 && meta.service) {
            const { service, ...rest } = meta;
            if (Object.keys(rest).length > 0) {
              msg += ` ${JSON.stringify(rest)}`;
            }
          } else if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
          }
          return msg;
        })
      ),
    }),
  ],
});

// Add file transport in production only when running on a writable filesystem.
// Serverless platforms such as Vercel do not provide a writable project directory,
// and attempting to create files/directories will crash the function (ENOENT).
// Detect Vercel or other serverless environments via VERCEL or NOW environment vars
// and skip file transports there. If you want file logs on a server, run with
// NODE_ENV=production on a traditional server (not Vercel).
const isServerless = Boolean(process.env.VERCEL || process.env.NOW || process.env.FUNCTIONS_EXTERNAL_BINDING);
if (process.env.NODE_ENV === 'production' && !isServerless) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    })
  );
} else if (isServerless) {
  // In serverless environments prefer console-only logging (already present).
  logger.warn('Running in serverless environment: file logging disabled');
}

module.exports = logger;
