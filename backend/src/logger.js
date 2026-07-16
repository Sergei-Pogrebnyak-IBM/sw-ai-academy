/**
 * logger.js — structured JSON logger (BE-07)
 *
 * Writes one JSON object per line to stdout.
 * Levels: INFO | WARN | ERROR
 *
 * Rules (design §13):
 * - Never log file binary content, stack traces in responses, or user comment text.
 * - Error entries include error_type category only — not raw exception messages.
 */

function log(level, event, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

const logger = {
  info: (event, context) => log('INFO', event, context),
  warn: (event, context) => log('WARN', event, context),
  error: (event, context) => log('ERROR', event, context),
};

module.exports = logger;
