const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database');

const testMenuItem = {
  title: 'Veggie Pizza',
  description: 'A delightful garden pizza',
  image: 'veggie.png',
  price: 0.0038,
};

const testOrder = {
  franchiseId: 1,
  storeId: 1,
  items: [{ menuId: 1, description: 'Veggie Pizza', price: 0.05 }],
};

let adminUser, adminAuthToken, dinerUser, dinerAuthToken;

beforeAll(async () => {
  adminUser = {
    name: Math.random().toString(36).substring(2, 12),
    email: `${Math.random().toString(36).substring(2, 12)}@admin.com`,
    password: 'toomanysecrets',
    roles: [{ role: Role.Admin }],
  };

  adminUser = await DB.addUser(adminUser);

  const adminLoginRes = await request(app)
    .put('/api/auth')
    .send({ email: adminUser.email, password: 'toomanysecrets' });
  adminAuthToken = adminLoginRes.body.token;

  dinerUser = {
    name: 'Jonah',
    email: 'jonah@user.com',
    password: 'password123',
    roles: [{ role: Role.Diner }],
  };

  dinerUser = await DB.addUser(dinerUser);

  const dinerLoginRes = await request(app)
    .put('/api/auth')
    .send({ email: dinerUser.email, password: 'password123' });
  dinerAuthToken = dinerLoginRes.body.token;
});

test('getting pizza menu', async () => {
  const menuItems = [{ ...testMenuItem, id: 1 }];
  jest.spyOn(DB, 'getMenu').mockResolvedValue(menuItems);

  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(res.body).toEqual(menuItems);
  expect(DB.getMenu).toHaveBeenCalled();
});

test('add menu item as admin', async () => {
  const updatedMenu = [{ ...testMenuItem, id: 1 }];
  jest.spyOn(DB, 'addMenuItem').mockResolvedValue(testMenuItem);
  jest.spyOn(DB, 'getMenu').mockResolvedValue(updatedMenu);

  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminAuthToken}`)
    .send(testMenuItem);

  expect(res.status).toBe(200);
  expect(res.body).toEqual(updatedMenu);
  expect(DB.addMenuItem).toHaveBeenCalledWith(testMenuItem);
  expect(DB.getMenu).toHaveBeenCalled();
});

test('403 error test 1', async () => {
  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${dinerAuthToken}`)
    .send(testMenuItem);

  expect(res.status).toBe(403);
  expect(DB.addMenuItem).not.toHaveBeenCalled();
});

test('getting orders', async () => {
  const orders = [
    {
      dinerId: dinerUser.id,
      orders: [
        {
          id: 1,
          franchiseId: 1,
          storeId: 1,
          date: '2024-06-05T05:14:40.000Z',
          items: [{ menuId: 1, description: 'Veggie Pizza', price: 0.05 }],
        },
      ],
    },
  ];
  jest.spyOn(DB, 'getOrders').mockResolvedValue(orders);

  const res = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${dinerAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual(orders);
  expect(DB.getOrders).toHaveBeenCalledWith(dinerUser, undefined);
});

test('creating order', async () => {
  const createdOrder = { ...testOrder, id: 1 };
  jest.spyOn(DB, 'addDinerOrder').mockResolvedValue(createdOrder);

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerAuthToken}`)
    .send(testOrder);

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ order: createdOrder });
  expect(DB.addDinerOrder).toHaveBeenCalledWith(dinerUser, testOrder);
});

test('403 error', async () => {
  const res = await request(app).post('/api/order').send(testOrder);

  expect(res.status).toBe(401);
  expect(DB.addDinerOrder).not.toHaveBeenCalled();
});

test('should return 500 if order fulfillment fails', async () => {
  const failedOrder = { ...testOrder, id: 1 };
  jest.spyOn(DB, 'addDinerOrder').mockResolvedValue(failedOrder);

  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ reportUrl: 'http://example.com/error' }),
    })
  );

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerAuthToken}`)
    .send(testOrder);

  expect(res.status).toBe(500);
  expect(res.body.message).toBe('Failed to fulfill order at factory');
  expect(res.body.reportPizzaCreationErrorToPizzaFactoryUrl).toBe('http://example.com/error');
});
