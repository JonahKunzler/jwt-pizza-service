const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database');

const testMenuItem = {
  title: 'Veggie Pizza',
  description: 'A delightful garden pizza',
  image: 'veggie.png',
  price: 0.0038,
};



let adminUser, adminAuthToken, dinerUser;

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

});

test('getting pizza', async () => {
  const menuItems = [{ ...testMenuItem, id: 1 }];
  jest.spyOn(DB, 'getMenu').mockResolvedValue(menuItems);

  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(res.body).toEqual(menuItems);
  expect(DB.getMenu).toHaveBeenCalled();
});

test('place an order as a diner', async () => {
    const orderRequest = { items: [{ id: 1, quantity: 2 }] };
    const mockOrder = { id: 123, items: orderRequest.items };
  
    jest.spyOn(DB, 'addDinerOrder').mockResolvedValue(mockOrder);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        reportUrl: 'http://factory.com/report',
        jwt: 'mock-jwt-token',
      }),
    });
  
    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${adminAuthToken}`)
      .send(orderRequest);
  
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      order: mockOrder,
      reportSlowPizzaToFactoryUrl: 'http://factory.com/report',
      jwt: 'mock-jwt-token',
    });
  
    //expect(DB.addDinerOrder).toHaveBeenCalledWith(adminUser, orderRequest);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/order'), expect.any(Object));
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

