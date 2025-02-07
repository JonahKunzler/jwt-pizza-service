const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { DB, Role } = require('../database/database');
const { StatusCodeError } = require('../endpointHelper');

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

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('getting menu', async () => {
    const mockMenu = [{ id: 1, title: 'Pepperoni', description: 'Spicy', price: 10.99 }];
    mockConnection.execute.mockResolvedValue([mockMenu]);

    const result = await DB.getMenu();

    expect(result).toEqual(mockMenu);
    expect(mockConnection.execute).toHaveBeenCalledWith('SELECT * FROM menu');
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
  });

  test('adding user', async () => {
    const user = { name: 'User Test', email: 'test@example.com', password: 'secret', roles: [{ role: Role.Diner }] };
    bcrypt.hash.mockResolvedValue('password');
    mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

    const result = await DB.addUser(user);

    expect(result).toMatchObject({ ...user, id: 1, password: undefined });
    expect(bcrypt.hash).toHaveBeenCalledWith('secret', 10);
    expect(mockConnection.execute).toHaveBeenCalledWith(
      'INSERT INTO user (name, email, password) VALUES (?, ?, ?)',
      [user.name, user.email, 'password']
    );
  });


  test('getting user', async () => {
    mockConnection.execute.mockResolvedValueOnce([[]]);

    await expect(DB.getUser('me@example.com', 'secret')).rejects.toThrow('unknown user');
  });



  

  test('deleting franchise', async () => {
    mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

    await DB.deleteFranchise(300);

    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(mockConnection.execute).toHaveBeenCalledWith('DELETE FROM store WHERE franchiseId=?', [300]);
    expect(mockConnection.execute).toHaveBeenCalledWith('DELETE FROM userRole WHERE objectId=?', [300]);
    expect(mockConnection.execute).toHaveBeenCalledWith('DELETE FROM franchise WHERE id=?', [300]);
    expect(mockConnection.commit).toHaveBeenCalled();
  });
});
