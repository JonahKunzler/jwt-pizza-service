const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database');

const testFranchise = { name: 'Pizza Paradise', admins: [{ email: 'admin@test.com' }] };
let adminUser, adminAuthToken, normalUser;

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

  normalUser = {
    name: 'Jonah',
    email: 'jonah@user.com',
    password: 'password31u82904',
    roles: [{ role: Role.Diner }],
  };

  normalUser = await DB.addUser(normalUser);

  
});


test('getting franchises', async () => {
  const res = await request(app)
    .get('/api/franchise')
    .set('Authorization', `Bearer ${adminAuthToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('deleting franchise if user is admin', async () => {
  const createRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminAuthToken}`)
    .send(testFranchise);

  const franchiseId = createRes.body.id;

  const deleteRes = await request(app)
    .delete(`/api/franchise/${franchiseId}`)
    .set('Authorization', `Bearer ${adminAuthToken}`);

  expect(deleteRes.status).toBe(200);
  expect(deleteRes.body).toEqual({ message: 'franchise deleted' });
});


test('returning user franchises', async () => {
  const userFranchises = [{ id: 1, name: 'Test Franchise' }];
  jest.spyOn(DB, 'getUserFranchises').mockResolvedValue(userFranchises);

  const res = await request(app)
    .get(`/api/franchise/${adminUser.id}`)
    .set('Authorization', `Bearer ${adminAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual(userFranchises);
});



test('deleting stoe', async () => {
  const createRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminAuthToken}`)
    .send(testFranchise);

  const franchiseId = createRes.body.id;

  const storeData = { name: 'New Store' };
  const storeRes = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set('Authorization', `Bearer ${adminAuthToken}`)
    .send(storeData);

  const storeId = storeRes.body.id;

  const deleteStoreRes = await request(app)
    .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
    .set('Authorization', `Bearer ${adminAuthToken}`);

  expect(deleteStoreRes.status).toBe(200);
  expect(deleteStoreRes.body).toEqual({ message: 'store deleted' });
});
