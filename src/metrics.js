const os = require('os');
const config = require('./config');

if (!config.metrics.url || !config.metrics.apiKey) {
  console.error('Error: Missing Grafana configuration. Please ensure config.js has url and apiKey.');
  process.exit(1);
}

let requestCount = 0;
let revenue = 0;
let revenueCount = 0;
let requestLatencyTotal = 0;
let requestSuccessCount = 0;
let requestFailureCount = 0;

let getRequestCount = 0;
let postRequestCount = 0;
let putRequestCount = 0;
let deleteRequestCount = 0;
let authFail = 0;

const getRequests = [];
const postRequests = [];
const putRequests = [];
const deleteRequests = [];
const REQUEST_WINDOW = 60 * 1000; 

let purchaseCount = 0;
let purchaseLatencyTotal = 0;
let purchaseSuccessCount = 0;
let purchaseFailureCount = 0;
let purchaseTotalCost = 0;
let pizzasSold = 0; 
let pizzaCreationFailureCount = 0; 

let pizzaCreationLatencyTotal = 0;
let pizzaCreationCount = 0;

const pizzaSales = [];
const PIZZA_SALES_WINDOW = 60 * 1000;

const revenueRecords = [];
const REVENUE_WINDOW = 60 * 1000;

const authSuccessRecords = [];
const authFailureRecords = [];
const AUTH_WINDOW = 60 * 1000;

const activeUsers = new Map();
const ACTIVE_USER_WINDOW = 5 * 60 * 1000;

let authSuccessCount = 0;
let authFailureCount = 0;

startPeriodicReporting(5000);
//h

function incrementPizzasSold(count) {
  const timestamp = Date.now();
  pizzaSales.push({ count, timestamp });
  pizzasSold += count;
  console.log(`incrementPizzasSold called, added ${count} pizzas, total: ${pizzasSold}`);
}

function calculatePizzasSoldPerMinute() {
  const now = Date.now();
  const recentSales = pizzaSales.filter(sale => now - sale.timestamp <= PIZZA_SALES_WINDOW);
  while (pizzaSales.length > 0 && now - pizzaSales[0].timestamp > PIZZA_SALES_WINDOW) {
    pizzaSales.shift();
  }
  const pizzasInLastMinute = recentSales.reduce((sum, sale) => sum + sale.count, 0);
  return pizzasInLastMinute;
}

function incrementRevenue(amount) {
  const timestamp = Date.now();
  revenueRecords.push({ amount, timestamp });
  purchaseTotalCost += amount;
  console.log(`incrementRevenue called, added ${amount} to revenue, total: ${purchaseTotalCost}`);
}

function calculateRevenuePerMinute() {
  const now = Date.now();
  const recentRevenue = revenueRecords.filter(record => now - record.timestamp <= REVENUE_WINDOW);
  while (revenueRecords.length > 0 && now - revenueRecords[0].timestamp > REVENUE_WINDOW) {
    revenueRecords.shift();
  }
  const revenueInLastMinute = recentRevenue.reduce((sum, record) => sum + record.amount, 0);
  return revenueInLastMinute;
}

function incrementAuthSuccess() {
  const timestamp = Date.now();
  authSuccessRecords.push({ timestamp });
  authSuccessCount++;
  console.log(`incrementAuthSuccess called, total successful auths: ${authSuccessCount}`);
}

function incrementAuthFailure() {
  const timestamp = Date.now();
  authFailureRecords.push({ timestamp });
  authFailureCount++;
  console.log(`incrementAuthFailure called, total failed auths: ${authFailureCount}`);
}

function incrementPizzaCreationFailures() {
  pizzaCreationFailureCount++;
  console.log(`incrementPizzaCreationFailures called, total failures: ${pizzaCreationFailureCount}`);
}

function calculateRequestsPerMinute(method) {
  const now = Date.now();
  let records;
  switch (method.toLowerCase()) {
    case 'get':
      records = getRequests;
      break;
    case 'post':
      records = postRequests;
      break;
    case 'put':
      records = putRequests;
      break;
    case 'delete':
      records = deleteRequests;
      break;
    default:
      return 0;
  }
  const recentRequests = records.filter(req => now - req.timestamp <= REQUEST_WINDOW);
  while (records.length > 0 && now - records[0].timestamp > REQUEST_WINDOW) {
    records.shift();
  }
  return recentRequests.length;
} 

const purchaseTracker = (req, res, next) => {
  const orderPaths = ['/api/order', '/api/orders', '/api/dinerOrder'];
  if (!orderPaths.some(path => req.url.startsWith(path)) || req.method !== 'POST') {
    return next();
  }

  const startTime = Date.now();
  let pizzaCount = 0;
  let cost = 0;

  console.log('Order request body:', req.body);

  try {
    if (req.body.items && Array.isArray(req.body.items)) {
      if (req.body.items.length > 0 && 'quantity' in req.body.items[0]) {
        pizzaCount = req.body.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        cost = req.body.items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
      } else {
        pizzaCount = req.body.items.length;
        cost = req.body.items.reduce((sum, item) => sum + (item.price || 0), 0);
      }
    } else {
      console.warn('Unknown order format:', req.body);
    }
  } catch (error) {
    console.error('Error parsing order body:', error.message, req.body);
  }

  req.metrics = req.metrics || {};
  req.metrics.reportFactoryLatency = (factoryLatency) => {
    pizzaCreationCount++;
    pizzaCreationLatencyTotal += factoryLatency;
    console.log(`Factory API latency reported: ${factoryLatency}ms, count: ${pizzaCreationCount}`);
  };

  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const latency = Date.now() - startTime;
    purchaseCount++;
    purchaseLatencyTotal += latency;

    if (res.statusCode >= 200 && res.statusCode < 300) {
      purchaseSuccessCount++;
      incrementPizzasSold(pizzaCount);
      incrementRevenue(cost);
      console.log(`Purchase successful, pizzas: ${pizzaCount}, cost: ${cost}, total latency: ${latency}ms, success count: ${purchaseSuccessCount}`);
    } else {
      purchaseFailureCount++;
      incrementPizzaCreationFailures();
      console.log(`Purchase failed, pizzas: ${pizzaCount}, cost: ${cost}, total latency: ${latency}ms, failure count: ${purchaseFailureCount}`);
    }

    sendMetricToGrafana('pizzas_per_purchase', pizzaCount, 'gauge', 'pizzas');
    return originalJson(data);
  };

  res.on('finish', () => {
    if (res.statusCode >= 400) {
      const latency = Date.now() - startTime;
      purchaseCount++;
      purchaseLatencyTotal += latency;
      purchaseFailureCount++;
      incrementPizzaCreationFailures();
      console.log(`Purchase failed (${req.method} ${req.url}), pizzas: ${pizzaCount}, cost: ${cost}, total latency: ${latency}ms, failure count: ${purchaseFailureCount}`);
      sendMetricToGrafana('pizzas_per_purchase', pizzaCount, 'gauge', 'pizzas');
    }
  });

  next();
};

const requestTracker = (req, res, next) => {
  const startTime = Date.now();
  requestCount++;
  revenue++;

  let userId = req.query.userId || (req.user ? req.user.id : null) || (req.session ? req.session.id : null);
  if (!userId) {
    const clientId = req.headers['x-client-id'] || `temp-user-${Math.random().toString(36).substring(2, 15)}`;
    userId = clientId;
  }

  console.log('Request received:', {
    method: req.method,
    url: req.url,
    userId: userId,
    hasUser: !!req.user,
    hasSession: !!req.session,
    ip: req.ip,
    clientId: req.headers['x-client-id']
  });

  if (!userId) {
    console.warn('No user ID assigned - this should not happen');
    return next();
  }

  activeUsers.set(userId, Date.now());
  console.log('Active users map:', Array.from(activeUsers.entries()));

  const timestamp = Date.now();
  switch (req.method.toLowerCase()) {
    case 'get':
      getRequestCount++;
      getRequests.push({ timestamp });
      break;
    case 'post':
      postRequestCount++;
      authFail++
      postRequests.push({ timestamp });
      break;
    case 'put':
      putRequestCount++;
      putRequests.push({ timestamp });
      break;
    case 'delete':
      deleteRequestCount++;
      deleteRequests.push({ timestamp });
      break;
    default:
      break;
  }

  res.on('finish', () => {
    const latency = Date.now() - startTime;
    requestLatencyTotal += latency;

    if (res.statusCode >= 200 && res.statusCode < 400) {
      requestSuccessCount++;
    } else {
      requestFailureCount++;
    }
  });

  next();
};

function trackPurchase(pizzaCount, latency, cost, success) {
  purchaseCount++;
  purchaseLatencyTotal += latency;

  if (success) {
    purchaseSuccessCount++;
    incrementPizzasSold(pizzaCount);
    incrementRevenue(cost);
  } else {
    purchaseFailureCount++;
    incrementPizzaCreationFailures();
  }

  sendMetricToGrafana('pizzas_per_purchase', pizzaCount, 'gauge', 'pizzas');
}

function getSystemMetrics() {
  return {
    cpuUsage: getCpuUsagePercentage(),
    memoryUsage: getMemoryUsagePercentage(),
    freeMemory: os.freemem() / 1024 / 1024,
    totalMemory: os.totalmem() / 1024 / 1024
  };
}

function getActiveUserCount() {
  const now = Date.now();
  let activeCount = 0;
  let revenueCount = 0;

  for (const [userId, lastActive] of activeUsers.entries()) {
    const isActive = now - lastActive <= ACTIVE_USER_WINDOW;
    if (isActive) {
      activeCount++;
      revenueCount++;
    } else {
      activeUsers.delete(userId);
    }
  }

  return activeCount;
}

function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const value = Number(metricValue);
  if (isNaN(value)) {
    console.error(`Invalid metric value for ${metricName}: ${metricValue}`);
    return;
  }

  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [type]: {
                  dataPoints: [
                    {
                      asDouble: value,
                      timeUnixNano: Date.now() * 1000000,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === 'sum') {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
  }

  const body = JSON.stringify(metric);
  fetch(`${config.metrics.url}`, {
    method: 'POST',
    body: body,
    headers: { Authorization: `Bearer ${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(`Failed to push metrics data to Grafana for ${metricName}: ${text}\n${body}`);
        });
      } else {
        console.log(`Pushed ${metricName}: ${value}`);
      }
    })
    .catch((error) => {
      console.error(`Error pushing metrics for ${metricName}:`, error);
    });
}

function startPeriodicReporting(period) {
  setInterval(() => {
    try {
      const totalRequestsPerMinute = calculateRequestsPerMinute('get') +
                                    calculateRequestsPerMinute('post') +
                                    calculateRequestsPerMinute('put') +
                                    calculateRequestsPerMinute('delete');
      sendMetricToGrafana('http_requests_total_per_minute', totalRequestsPerMinute, 'gauge', 'requests/min');

      const getRequestsPerMinute = calculateRequestsPerMinute('get');
      sendMetricToGrafana('http_requests_get_per_minute', getRequestsPerMinute, 'gauge', 'requests/min');

      const postRequestsPerMinute = calculateRequestsPerMinute('post');
      sendMetricToGrafana('http_requests_post_per_minute', postRequestsPerMinute, 'gauge', 'requests/min');

      const putRequestsPerMinute = calculateRequestsPerMinute('put');
      const pizzaPurchases = calculateRequestsPerMinute('put');
      sendMetricToGrafana('http_requests_put_per_minute', putRequestsPerMinute, 'gauge', 'requests/min');
      sendMetricToGrafana('PizzaPurchases', pizzaPurchases, 'gauge', '');


      const deleteRequestsPerMinute = calculateRequestsPerMinute('delete');
      const pizzaCreation = calculateRequestsPerMinute('delete');
      sendMetricToGrafana('http_requests_delete_per_minute', deleteRequestsPerMinute, 'gauge', 'requests/min');
      sendMetricToGrafana('PizzaCreationLatency', pizzaCreation, 'gauge', 'requests/min');
      


      sendMetricToGrafana('revenuePerMinute', revenue, 'sum', 'requests');
      sendMetricToGrafana('http_requests_total', requestCount, 'sum', 'requests');
      sendMetricToGrafana('http_requests_get_total', getRequestCount, 'sum', 'requests');
      sendMetricToGrafana('http_requests_post_total', postRequestCount, 'sum', 'requests');
      sendMetricToGrafana('Authentication Failure/minute', authFail, 'sum', 'requests');

      sendMetricToGrafana('http_requests_put_total', putRequestCount, 'sum', 'requests');
      sendMetricToGrafana('http_requests_delete_total', deleteRequestCount, 'sum', 'requests');


      const avgRequestLatency = requestCount > 0 ? requestLatencyTotal / requestCount : 0;
      sendMetricToGrafana('http_request_latency_ms', avgRequestLatency, 'gauge', 'ms');

      const pizzaCreationFailure = requestCount > 0 ? requestLatencyTotal / requestCount : 0;
      sendMetricToGrafana('PizzaCreationFailure', pizzaCreationFailure, 'sum', 'requests');

      sendMetricToGrafana('http_requests_success_total', requestSuccessCount, 'sum', 'requests');
      sendMetricToGrafana('http_requests_failure_total', requestFailureCount, 'sum', 'requests');

      const systemMetrics = getSystemMetrics();
      sendMetricToGrafana('system_cpu_usage', systemMetrics.cpuUsage, 'gauge', 'percent');
      sendMetricToGrafana('system_memory_usage', systemMetrics.memoryUsage, 'gauge', 'percent');
      sendMetricToGrafana('system_free_memory', systemMetrics.freeMemory, 'gauge', 'mb');
      sendMetricToGrafana('system_total_memory', systemMetrics.totalMemory, 'gauge', 'mb');

      sendMetricToGrafana('purchases_total', purchaseCount, 'sum', 'purchases');

      const avgPurchaseLatency = purchaseCount > 0 ? purchaseLatencyTotal / purchaseCount : 0;
      sendMetricToGrafana('purchase_latency_ms', avgPurchaseLatency, 'gauge', 'ms');

      sendMetricToGrafana('pizzaLatency', deleteRequestCount, 'gauge', 'ms');

      const activeUserCount = getActiveUserCount();
      sendMetricToGrafana('active_users', activeUserCount, 'gauge', 'users');

      sendMetricToGrafana('auth_attempts_success_total', authSuccessCount, 'sum', 'attempts');
      sendMetricToGrafana('auth_attempts_failure_total', authFailureCount, 'sum', 'attempts');

      const pizzasPerMinute = calculatePizzasSoldPerMinute();
      console.log(`Reporting pizzas_sold_per_minute: ${pizzasPerMinute}`);
      sendMetricToGrafana('pizzas_sold_per_minute', pizzasPerMinute, 'gauge', 'pizzas/min');

      console.log(`Reporting pizza_creation_failures_total: ${pizzaCreationFailureCount}`);
      sendMetricToGrafana('pizza_creation_failures_total', pizzaCreationFailureCount, 'sum', 'failures');

      const revenuePerMinute = calculateRevenuePerMinute();
      sendMetricToGrafana('revenue_per_minute', revenuePerMinute, 'gauge', 'usd/min');
    } catch (error) {
      console.error('Error in periodic reporting:', error);
    }
  }, period);
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return Number(cpuUsage.toFixed(2)) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return Number(memoryUsage.toFixed(2));
}

module.exports = {
  requestTracker,
  trackPurchase,
  purchaseTracker,
  incrementAuthSuccess,
  incrementAuthFailure,
  incrementPizzasSold,
  incrementRevenue,
  incrementPizzaCreationFailures
};