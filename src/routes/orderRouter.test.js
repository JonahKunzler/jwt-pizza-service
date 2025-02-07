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

test('getting pizza', async () => {
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

