// orderRouter.js
const express = require('express');
const config = require('../config.js');
const { Role, DB } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');
const { asyncHandler, StatusCodeError } = require('../endpointHelper.js');
const { incrementPizzasSold, incrementRevenue, incrementPizzaCreationFailures } = require('../metrics.js');
const logger = require('../logger.js'); // Import the logger

const orderRouter = express.Router();

orderRouter.endpoints = [
  {
    method: 'GET',
    path: '/api/order/menu',
    description: 'Get the pizza menu',
    example: `curl localhost:3000/api/order/menu`,
    response: [{ id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' }],
  },
  {
    method: 'PUT',
    path: '/api/order/menu',
    requiresAuth: true,
    description: 'Add an item to the menu',
    example: `curl -X PUT localhost:3000/api/order/menu -H 'Content-Type: application/json' -d '{ "title":"Student", "description": "No topping, no sauce, just carbs", "image":"pizza9.png", "price": 0.0001 }'  -H 'Authorization: Bearer tttttt'`,
    response: [{ id: 1, title: 'Student', description: 'No topping, no sauce, just carbs', image: 'pizza9.png', price: 0.0001 }],
  },
  {
    method: 'GET',
    path: '/api/order',
    requiresAuth: true,
    description: 'Get the orders for the authenticated user',
    example: `curl -X GET localhost:3000/api/order  -H 'Authorization: Bearer tttttt'`,
    response: { dinerId: 4, orders: [{ id: 1, franchiseId: 1, storeId: 1, date: '2024-06-05T05:14:40.000Z', items: [{ id: 1, menuId: 1, description: 'Veggie', price: 0.05 }] }], page: 1 },
  },
  {
    method: 'POST',
    path: '/api/order',
    requiresAuth: true,
    description: 'Create an order for the authenticated user',
    example: `curl -X POST localhost:3000/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H 'Authorization: Bearer tttttt'`,
    response: { order: { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }], id: 1 }, jwt: '1111111111' },
  },
];

// getMenu
orderRouter.get(
  '/menu',
  asyncHandler(async (req, res) => {
    res.send(await DB.getMenu());
  })
);

// addMenuItem
orderRouter.put(
  '/menu',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      throw new StatusCodeError('unable to add menu item', 403);
    }
    const addMenuItemReq = req.body;
    await DB.addMenuItem(addMenuItemReq);
    res.send(await DB.getMenu());
  })
);

// getOrders
orderRouter.get(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(await DB.getOrders(req.user, req.query.page));
  })
);

let enableChaos = false;
orderRouter.put(
  '/chaos/:state',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (req.user.isRole(Role.Admin)) {
      enableChaos = req.params.state === 'true';
    }

    res.json({ chaos: enableChaos });
  })
);

orderRouter.post('/', (req, res, next) => {
  if (enableChaos && Math.random() < 0.5) {
    throw new StatusCodeError('Chaos monkey', 500);
  }
  next();
});

// createOrder
orderRouter.post(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const orderReq = req.body;
    const order = await DB.addDinerOrder(req.user, orderReq);

    let pizzaCount = 0;
    let cost = 0;
    try {
      if (orderReq.items && Array.isArray(orderReq.items)) {
        if (orderReq.items.length > 0 && 'quantity' in orderReq.items[0]) {
          pizzaCount = orderReq.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          cost = orderReq.items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
        } else {
          pizzaCount = orderReq.items.length;
          cost = orderReq.items.reduce((sum, item) => sum + (item.price || 0), 0);
        }
      } else {
        throw new Error('Invalid order format: items missing or not an array');
      }
    } catch (error) {
      console.error('Error calculating pizza count or cost:', error.message, orderReq);
      throw new StatusCodeError('Invalid order data', 400);
    }

    const factoryStartTime = Date.now();
    const factoryUrl = `${config.factory.url}/api/order`;
    const factoryData = { diner: { id: req.user.id, name: req.user.name, email: req.user.email }, order };
    try {
      const factoryResponse = await fetch(factoryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${config.factory.apiKey}` },
        body: JSON.stringify(factoryData),
      });
      const factoryLatency = Date.now() - factoryStartTime;
      const factoryResponseData = await factoryResponse.json();

      // Log the factory service request
      logger.logFactoryServiceRequest('POST', factoryUrl, factoryData, factoryResponseData);

      if (req.metrics && req.metrics.reportFactoryLatency) {
        req.metrics.reportFactoryLatency(factoryLatency);
      } else {
        console.warn('req.metrics.reportFactoryLatency not available. Ensure purchaseTracker middleware is applied.');
      }

      if (factoryResponse.ok) {
        incrementPizzasSold(pizzaCount);
        incrementRevenue(cost);
        res.send({ order, reportSlowPizzaToFactoryUrl: factoryResponseData.reportUrl, jwt: factoryResponseData.jwt });
      } else {
        incrementPizzaCreationFailures();
        res.status(500).send({ message: 'Failed to fulfill order at factory', reportPizzaCreationErrorToPizzaFactoryUrl: factoryResponseData.reportUrl });
      }
    } catch (error) {
      // Log the factory service request error
      logger.logFactoryServiceRequest('POST', factoryUrl, factoryData, null, error);
      incrementPizzaCreationFailures();
      res.status(500).send({ message: 'Failed to fulfill order at factory', error: error.message });
    }
  })
);

module.exports = orderRouter;