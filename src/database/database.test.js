const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { DB, Role } = require('../database/database');




jest.mock('mysql2/promise');
jest.mock('bcrypt');


describe('Database Testing', () => {
 let mockConnection;


 beforeEach(() => {
   mockConnection = {
     query: jest.fn(),
     execute: jest.fn(),
     end: jest.fn(),
     beginTransaction: jest.fn(),
     commit: jest.fn(),
     rollback: jest.fn(),
   };


   mysql.createConnection.mockResolvedValue(mockConnection);
 });


 beforeAll(async () => {
   await DB.initializeDatabase;
 });


 afterEach(() => {
   jest.clearAllMocks();
 });


 test('adding menu item', async () => {
   const newItem = { title: 'Veggie', description: 'Healthy', image: 'veg.png', price: 9.99 };
   mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);


   const result = await DB.addMenuItem(newItem);


   expect(result).toEqual({ ...newItem, id: 1 });
   expect(mockConnection.execute).toHaveBeenCalledWith(
     'INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)',
     [newItem.title, newItem.description, newItem.image, newItem.price]
   );


   expect(mockConnection.end).toHaveBeenCalled();
 });


 test('adding user', async () => {
   const user = { name: 'User Test', email: 'jonah@example.com', password: 'secret', roles: [{ role: Role.Diner }] };
   bcrypt.hash.mockResolvedValue('hashed_password');
   mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);


   const result = await DB.addUser(user);


   expect(result).toMatchObject({ ...user, id: 1, password: undefined });
   expect(bcrypt.hash).toHaveBeenCalledWith('secret', 10);
   expect(mockConnection.execute).toHaveBeenCalledWith(
     'INSERT INTO user (name, email, password) VALUES (?, ?, ?)',
     [user.name, user.email, 'hashed_password']
   );


   expect(mockConnection.end).toHaveBeenCalled();
 });


 test('getting user with invalid credentials', async () => {
   mockConnection.execute.mockResolvedValueOnce([[]]);


   await expect(DB.getUser('me@example.com', 'secret')).rejects.toThrow('unknown user');
   expect(mockConnection.execute).toHaveBeenCalledWith('SELECT * FROM user WHERE email=?', ['me@example.com']);


   expect(mockConnection.end).toHaveBeenCalled();
 });


 test('getting user with valid credentials', async () => {
   const mockUser = [{ id: 1, name: 'User Test', email: 'jonah@example.com', password: 'hashed_password' }];
   const mockRoles = [{ role: Role.Diner }];


   mockConnection.execute
     .mockResolvedValueOnce([mockUser])
     .mockResolvedValueOnce([mockRoles]);


   bcrypt.compare.mockResolvedValue(true);


   const result = await DB.getUser('jonah@example.com', 'secret');


   expect(result).toMatchObject({ id: 1, name: 'User Test', email: 'jonah@example.com', roles: mockRoles });
   expect(bcrypt.compare).toHaveBeenCalledWith('secret', 'hashed_password');


   expect(mockConnection.end).toHaveBeenCalled();
 });


 test('deleting franchise', async () => {
   mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);


   await DB.deleteFranchise(300);


   expect(mockConnection.beginTransaction).toHaveBeenCalled();
   expect(mockConnection.execute).toHaveBeenCalledWith('DELETE FROM store WHERE franchiseId=?', [300]);
   expect(mockConnection.execute).toHaveBeenCalledWith('DELETE FROM userRole WHERE objectId=?', [300]);
   expect(mockConnection.execute).toHaveBeenCalledWith('DELETE FROM franchise WHERE id=?', [300]);
   expect(mockConnection.commit).toHaveBeenCalled();
   expect(mockConnection.end).toHaveBeenCalled();
 });


 test('user has no franchises', async () => {
   mockConnection.execute.mockResolvedValueOnce([[]]);
    const result = await DB.getUserFranchises(1);
    expect(result).toEqual([]);
   expect(mockConnection.execute).toHaveBeenCalledWith(
     `SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?`,
     [1]
   );
   expect(mockConnection.end).toHaveBeenCalled();
 });
 
  test('create franchise', async () => {
   const testFranchise = {
     name: 'Pizza Haven',
     admins: [{ email: 'jonah@example.com' }],
   };
    mockConnection.execute
     .mockResolvedValueOnce([[{ id: 10, name: 'Admin User' }]])
     .mockResolvedValueOnce([{ insertId: 50 }])
     .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await DB.createFranchise(testFranchise);
    expect(result).toMatchObject({
     id: 50,
     name: 'Pizza Haven',
     admins: [{ id: 10, name: 'Admin User', email: 'jonah@example.com' }],
   });
    expect(mockConnection.execute).toHaveBeenCalledWith(
     'SELECT id, name FROM user WHERE email=?',
     ['jonah@example.com']
   );
    expect(mockConnection.execute).toHaveBeenCalledWith(
     'INSERT INTO franchise (name) VALUES (?)',
     ['Pizza Haven']
   );
    expect(mockConnection.execute).toHaveBeenCalledWith(
     'INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)',
     [10, Role.Franchisee, 50]
   );
    expect(mockConnection.end).toHaveBeenCalled();
 });


 test('logout', async () => {
   const mockToken = 'valid.token.value';
   const mockTokenSignature = 'token-signature';
    jest.spyOn(DB, 'getTokenSignature').mockReturnValue(mockTokenSignature);
    mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);
    await DB.logoutUser(mockToken);
    expect(DB.getTokenSignature).toHaveBeenCalledWith(mockToken);
    expect(mockConnection.execute).toHaveBeenCalledWith(
     'DELETE FROM auth WHERE token=?',
     [mockTokenSignature]
   );
    expect(mockConnection.end).toHaveBeenCalled();
 });


 test('getOrders', async () => {
   const mockUser = { id: 123 };
   const mockPage = 1;
   const mockOffset = 0;
   const mockOrders = [
     { id: 1, franchiseId: 10, storeId: 5, date: '2024-06-10T12:00:00Z' },
     { id: 2, franchiseId: 11, storeId: 6, date: '2024-06-11T15:00:00Z' },
   ];
   const mockItems = [
     { id: 101, menuId: 1, description: 'Veggie Pizza', price: 9.99 },
     { id: 102, menuId: 2, description: 'BBQ Chicken', price: 12.99 },
   ];
    jest.spyOn(DB, 'getOffset').mockReturnValue(mockOffset);
    mockConnection.execute.mockResolvedValueOnce([mockOrders]);
    mockConnection.execute
     .mockResolvedValueOnce([mockItems])
     .mockResolvedValueOnce([mockItems]);
    const result = await DB.getOrders(mockUser, mockPage);
   
    expect(mockConnection.execute).toHaveBeenCalledWith(
     `SELECT id, menuId, description, price FROM orderItem WHERE orderId=?`,
     [1]
   );
    expect(mockConnection.execute).toHaveBeenCalledWith(
     `SELECT id, menuId, description, price FROM orderItem WHERE orderId=?`,
     [2]
   );
    expect(result).toEqual({
     dinerId: mockUser.id,
     orders: [
       { ...mockOrders[0], items: mockItems },
       { ...mockOrders[1], items: mockItems },
     ],
     page: mockPage,
   });
    expect(mockConnection.end).toHaveBeenCalled();
 });
 
  test('create franchise', async () => {
   const testFranchise = {
     name: 'Pizza Haven',
     admins: [{ email: 'jonah@example.com' }],
   };
    mockConnection.execute.mockResolvedValueOnce([[]]);
    await expect(DB.createFranchise(testFranchise)).rejects.toThrow(
     'unknown user'
   );
    expect(mockConnection.execute).toHaveBeenCalledWith(
     'SELECT id, name FROM user WHERE email=?',
     ['jonah@example.com']
   );
    expect(mockConnection.end).toHaveBeenCalled();
 });
  });


 
 











