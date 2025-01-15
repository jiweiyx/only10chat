
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs').promises; // 引入 fs 模块


// MongoDB 连接配置
const url = 'mongodb://localhost:27017';
const dbName = 'chatdb';  // 使用 'chatDb' 数据库
const collectionName = 'chatCollection'; // 集合名称
let clientConnection = null;
let dbCollection = null;

async function connectToDB() {
    if (clientConnection && dbCollection) {
        return { collection: dbCollection };
    }

    try {
        clientConnection = await MongoClient.connect(url);
        const db = clientConnection.db(dbName);
        dbCollection = db.collection(collectionName);
        return { collection: dbCollection };
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

async function insertChat(newChat) {
    try {
        const { collection } = await connectToDB();

        // 验证新聊天数据是否有效
        if (!newChat.content || !newChat.chatId || !newChat.senderId) {
            throw new Error('Invalid chat data');
        }
        newChat.content = newChat.content.trim();

        // 插入新聊天记录
        const result = await collection.insertOne(newChat);

        // 检查是否需要清理旧消息
        if (await collection.countDocuments({ chatId: newChat.chatId }) > 10) {
            const oldestMessages = await collection
                .find({ chatId: newChat.chatId })
                .sort({ _id: 1 })
                .limit(1)
                .toArray();

            if (oldestMessages.length > 0) {
                const oldestMessage = oldestMessages[0];

                // 如果类型是 file，删除文件
                if ((oldestMessage.type === 'file')) {
                    const fileName = path.basename(oldestMessage.content); // 提取文件名
                    const filePath = path.join(__dirname, 'public', 'upload', fileName);
                    try {
                        await fs.unlink(filePath); // 删除文件
                        console.log(`File deleted: ${filePath}`);
                    } catch (fileErr) {
                        console.error(`Failed to delete file: ${filePath}`, fileErr);
                    }
                }

                // 删除旧的数据库记录
                await collection.deleteOne({ _id: oldestMessage._id });
            }
        }

        return result.insertedId;
    } catch (err) {
        console.error('Failed to insert new chat', err);
        throw err;
    }
}

async function showHistory(chatId) {
    try {
        const { collection } = await connectToDB();
        const chatHistory = await collection
            .find({chatId: chatId})
            .toArray();
        return chatHistory;
    } catch (err) {
        console.error(`Error finding messages for chatId: ${chatId}, ${err}`);
        return [];
    }
    // Remove the finally block that closes the connection
}

async function closeDBConnection() {
    try {
        if (clientConnection) {
            console.log('Closing MongoDB connection...');
            await clientConnection.close(); // 异步关闭连接
            console.log('MongoDB connection closed.');
            clientConnection = null; // 清理引用
        } else {
            console.warn('MongoDB connection is already closed or not initialized.');
        }
    } catch (error) {
        console.error('Error while closing MongoDB connection:', error);
    }
}

module.exports = {
    insertChat,
    showHistory,
    closeDBConnection,
};