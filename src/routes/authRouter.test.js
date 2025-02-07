const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let adminUser, adminAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);

  adminUser = {
    name: 'Admin User',
    email: `${Math.random().toString(36).substring(2, 12)}@admin.com`,
    password: 'adminpassword',
    roles: [{ role: Role.Admin }],
  };

  await DB.addUser(adminUser);

  const adminLoginRes = await request(app)
    .put('/api/auth')
    .send({ email: adminUser.email, password: 'adminpassword' });
  adminAuthToken = adminLoginRes.body.token;
  expectValidJwt(adminAuthToken);
});


test('non-admin user not being able to update another user', async () => {
  const res = await request(app)
    .put(`/api/auth/${adminUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ email: 'unauthorized@attempt.com' });

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ message: 'unauthorized' });
});

test('logging out', async () => {
  jest.spyOn(DB, 'logoutUser').mockResolvedValueOnce();

  const res = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'logout successful' });
  expect(DB.logoutUser).toHaveBeenCalledWith(expect.any(String));
});



function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}
