const app = require('./service.js');
const logger = require('./logger');

const port = process.argv[2] || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.logException(new Error(reason), null);
});