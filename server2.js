const { MongoClient, ObjectId } = require('mongodb');

// MongoDB 连接配置
const url = 'mongodb://localhost:27017';
const dbName = 'test';  // 使用 'test' 数据库
const collectionName = 'users'; // 集合名称

async function connectToDB() {
  // 创建 MongoClient 实例并连接到 MongoDB
  const client = await MongoClient.connect(url);
  console.log('MongoDB is running!');
  const db = client.db(dbName);
  const collection = db.collection(collectionName);  // 获取集合
  return { client, collection };
}

// 增：插入新文档
async function insertUser(newUser) {
  const { client, collection } = await connectToDB();
  try {
    const result = await collection.insertOne(newUser);
    console.log('Inserted user:', result);
    return result.insertedId;  // 使用 insertedId 获取插入文档的 _id
  } catch (err) {
    console.error('Failed to insert user:', err);
  } finally {
    client.close();
  }
}

// 查：查询所有文档
async function findAllUsers() {
  const { client, collection } = await connectToDB();
  try {
    const users = await collection.find().toArray();
    console.log('All users:', users);
  } catch (err) {
    console.error('Failed to find users:', err);
  } finally {
    client.close();
  }
}

// 查：按条件查询
async function findUserByName(name) {
  const { client, collection } = await connectToDB();
  try {
    const user = await collection.findOne({ name });
    console.log(`User with name '${name}':`, user);
  } catch (err) {
    console.error(`Failed to find user with name ${name}:`, err);
  } finally {
    client.close();
  }
}

// 改：更新文档
async function updateUser(userId, updatedData) {
  const { client, collection } = await connectToDB();
  try {
    const result = await collection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: updatedData }
    );
    if (result.matchedCount === 1) {
      console.log('Successfully updated user:', result);
    } else {
      console.log('No matching user found.');
    }
  } catch (err) {
    console.error('Failed to update user:', err);
  } finally {
    client.close();
  }
}

// 删：删除文档
async function deleteUser(userId) {
  const { client, collection } = await connectToDB();
  try {
    const result = await collection.deleteOne({ _id: new ObjectId(userId) });
    if (result.deletedCount === 1) {
      console.log('Successfully deleted user with ID:', userId);
    } else {
      console.log('No matching user found to delete.');
    }
  } catch (err) {
    console.error('Failed to delete user:', err);
  } finally {
    client.close();
  }
}

// 示例：执行增、查、改、删操作
async function runCRUDOperations() {
  // 插入新用户
  const newUser = {
    name: 'John Doe',
    age: 25,
    city: 'New York',
    timestamp: new Date(),
  };
  const insertedUserId = await insertUser(newUser);  // 获取插入的用户的 _id

  // 查：查询所有用户
  await findAllUsers();

  // 查：按姓名查询
  await findUserByName('John Doe');

  // 改：更新用户信息
  const updatedData = {
    age: 26,
    city: 'Los Angeles',
  };
  await updateUser(insertedUserId, updatedData);  // 使用插入时获得的 _id 更新

  // 删：删除用户
  await deleteUser(insertedUserId);  // 使用插入时获得的 _id 删除

  // 查：查询删除后的所有用户
  await findAllUsers();
}

// 运行 CRUD 操作
runCRUDOperations();
