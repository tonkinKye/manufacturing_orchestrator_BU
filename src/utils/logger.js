const fs = require('fs').promises;
const path = require('path');

const LOG_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const LOG_MAX_AGE_DAYS = 7; // Keep logs for 7 days
const LOG_BACKUP_COUNT = 3; // Keep 3 backup files

// Logging levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor(logFile, level = 'INFO') {
    this.logFile = logFile;
    this.setLevel(level);
    this.initializeLog();
  }

  /**
   * Set logging level
   * @param {string} level - ERROR, WARN, INFO, or DEBUG
   */
  setLevel(level) {
    const upperLevel = level?.toUpperCase() || 'INFO';
    if (LOG_LEVELS.hasOwnProperty(upperLevel)) {
      this.level = LOG_LEVELS[upperLevel];
      this.levelName = upperLevel;
    } else {
      console.warn(`Invalid log level: ${level}, defaulting to INFO`);
      this.level = LOG_LEVELS.INFO;
      this.levelName = 'INFO';
    }
  }

  /**
   * Check if a log level should be logged
   * @param {string} level - The level to check
   * @returns {boolean}
   */
  shouldLog(level) {
    const levelValue = LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
    return levelValue <= this.level;
  }

  initializeLog() {
    this.checkRotation();
  }

  getTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }

  async checkRotation() {
    try {
      const stats = await fs.stat(this.logFile);
      const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

      if (stats.size > LOG_MAX_SIZE || ageInDays > LOG_MAX_AGE_DAYS) {
        await this.rotateLog();
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error checking log rotation:', error.message);
      }
    }
  }

  async rotateLog() {
    try {
      for (let i = LOG_BACKUP_COUNT; i > 0; i--) {
        const oldFile = i === 1 ? this.logFile : `${this.logFile}.${i - 1}`;
        const newFile = `${this.logFile}.${i}`;

        try {
          await fs.access(oldFile);
          if (i === LOG_BACKUP_COUNT) {
            await fs.unlink(oldFile);
          } else {
            await fs.rename(oldFile, newFile);
          }
        } catch (error) {
          // File doesn't exist, skip
        }
      }

      try {
        await fs.rename(this.logFile, `${this.logFile}.1`);
        this.log('INFO', 'Log rotated - new log file started');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('Error rotating log:', error.message);
        }
      }
    } catch (error) {
      console.error('Error during log rotation:', error.message);
    }
  }

  async log(level, message, data = null) {
    // Check if this level should be logged
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = this.getTimestamp();
    let logMessage = `[${timestamp}] [${level}] ${message}`;

    if (data) {
      logMessage += '\n' + JSON.stringify(data, null, 2);
    }

    console.log(logMessage);

    try {
      await this.checkRotation();
      await fs.appendFile(this.logFile, logMessage + '\n');
    } catch (error) {
      console.error('Error writing to log file:', error.message);
    }
  }

  info(message, data) {
    return this.log('INFO', message, data);
  }

  warn(message, data) {
    return this.log('WARN', message, data);
  }

  error(message, data) {
    return this.log('ERROR', message, data);
  }

  debug(message, data) {
    return this.log('DEBUG', message, data);
  }

  api(message, data) {
    return this.log('API', message, data);
  }

  /**
   * Get current log level name
   * @returns {string}
   */
  getLevel() {
    return this.levelName;
  }
}

module.exports = Logger;
