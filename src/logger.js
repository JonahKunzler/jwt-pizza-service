// logger.js
const fetch = require('node-fetch');
const config = require('./config');

class Logger {
  httpLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = (resBody) => {
      const responseTime = Date.now() - startTime;
      const logData = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        hasAuthHeader: !!req.headers.authorization,
        reqBody: req.body,
        resBody: resBody,
        responseTime,
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http-req', logData);
      res.send = originalSend;
      return res.send(resBody);
    };
    next();
  };

  logDatabaseQuery(query, params) {
    const sanitizedParams = params.map(param => {
      if (typeof param === 'string') {
        if (param.includes('@')) return '*****';
        if (param.startsWith('eyJ')) return '*****';
      }
      return param;
    });
    const logData = { query, params: sanitizedParams };
    this.log('info', 'db-query', logData);
  }

  logFactoryServiceRequest(method, url, data, response, error = null) {
    const logData = { method, url, data, response };
    const level = error ? 'error' : 'info';
    this.log(level, 'factory-req', { ...logData, error: error?.message });
  }

  logException(error, request = null) {
    const logData = {
      message: this.sanitizeString(error.message),
      stack: this.sanitizeString(error.stack),
      request: request
        ? {
            method: request.method,
            path: request.originalUrl,
            body: request.body,
          }
        : null,
    };
    this.log('error', 'exception', logData);
  }

  log(level, type, logData) {
    const labels = { component: config.logging.source, level, type };
    const values = [
      [
        this.nowString(),
        JSON.stringify(this.sanitize(logData)),
        { traceID: this.generateTraceID() },
      ],
    ];
    const logEvent = { streams: [{ stream: labels, values }] };
    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Date.now() * 1000000).toString();
  }

  generateTraceID() {
    return Math.random().toString(36).substring(2, 15);
  }

  sanitize(logData) {
    if (!logData || typeof logData !== 'object') return logData;

    const sensitiveFields = ['password', 'token', 'jwt', 'apiKey', 'authorization'];

    const sanitizeRecursive = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;

      for (const key in obj) {
        if (sensitiveFields.includes(key.toLowerCase())) {
          obj[key] = '*****';
        } else if (typeof obj[key] === 'object') {
          obj[key] = sanitizeRecursive(obj[key]);
        }
      }
      return obj;
    };

    return sanitizeRecursive(JSON.parse(JSON.stringify(logData)));
  }

  sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/(password|token|jwt|apiKey|authorization)=[^& ]+/gi, '$1=*****')
             .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '*****');
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(`${config.logging.url}`, {
      method: 'POST',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    })
      .then((res) => {
        if (!res.ok) console.log('Failed to send log to Grafana:', res.status, res.statusText);
      })
      .catch((error) => {
        console.error('Error sending log to Grafana:', error);
      });
  }
}

module.exports = new Logger();