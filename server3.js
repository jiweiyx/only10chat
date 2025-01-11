const { MongoClient } = require('mongodb');

// MongoDB 连接配置
const url = 'mongodb://localhost:27017';
const dbName = 'test';  // 使用 'test' 数据库

async function connectToDB() {
  // 创建 MongoClient 实例并连接到 MongoDB
  const client = await MongoClient.connect(url);
  console.log('MongoDB is running!');
  const db = client.db(dbName);
  return { client, db };
}

async function connectToDB() {
    // 创建 MongoClient 实例并连接到 MongoDB
    const client = await MongoClient.connect(url);
    console.log('MongoDB is running!');
    const db = client.db(dbName);
    return { client, db };
  }
async function insertSampleData() {
    const { client, db } = await connectToDB();
    try {
      const collection = db.collection('users');
      const result = await collection.insertOne({
        name: 'John Doe',
        age: 25,
        city: 'New York',
        timestamp: new Date()
      });
      console.log(`Inserted document with _id: ${result.insertedId}`);
    } catch (err) {
      console.error('Failed to insert document:', err);
    } finally {
      client.close();
    }
  }
// 查：查询集合中的所有文档
async function findAllDocuments(collectionName) {
  const { client, db } = await connectToDB();
  try {
    const collection = db.collection(collectionName);
    const docs = await collection.find().toArray();
    console.log(`Documents in ${collectionName}:`, docs);
  } catch (err) {
    console.error(`Failed to find documents in ${collectionName}:`, err);
  } finally {
    client.close();
  }
}

// 改：更新集合中的所有文档
async function updateAllDocuments(collectionName, updatedData) {
  const { client, db } = await connectToDB();
  try {
    const collection = db.collection(collectionName);
    const result = await collection.updateMany({}, { $set: updatedData });
    console.log(`Updated ${result.modifiedCount} documents in ${collectionName}`);
  } catch (err) {
    console.error(`Failed to update documents in ${collectionName}:`, err);
  } finally {
    client.close();
  }
}

// 删：删除集合中的所有文档
async function deleteAllDocuments(collectionName) {
  const { client, db } = await connectToDB();
  try {
    const collection = db.collection(collectionName);
    const result = await collection.deleteMany({});
    console.log(`Deleted ${result.deletedCount} documents in ${collectionName}`);
  } catch (err) {
    console.error(`Failed to delete documents in ${collectionName}:`, err);
  } finally {
    client.close();
  }
}

// 示例：执行查、改、删操作
async function runCollectionOperations() {

    // 插入示例数据
  await insertSampleData();

  const collectionName = 'users';  // 选择集合名称

  // 查：查询集合中的所有文档
  await findAllDocuments(collectionName);

  // 改：更新集合中的所有文档（例如更新所有用户的城市）
  const updatedData = { city: 'Los Angeles' }; // 更新城市字段
  await updateAllDocuments(collectionName, updatedData);

  // 查：再次查询集合中的所有文档，查看更新效果
  await findAllDocuments(collectionName);

  // 删：删除集合中的所有文档
  await deleteAllDocuments(collectionName);

  // 查：再次查询集合中的所有文档，查看删除效果
  await findAllDocuments(collectionName);
}

// 运行集合操作
runCollectionOperations();
