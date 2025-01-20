
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs').promises; // 引入 fs 模块
const cron = require('node-cron');  // 引入 node-cron 模块


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
async function checkMd5Hash(md5Hash) {
    try {
        const { collection } = await connectToDB();

        // 查找 md5Hash 是否存在
        const existingRecord = await collection.findOne({ md5Hash });

        if (existingRecord) {
            // 如果找到匹配的记录，返回文件的 content (链接)
            return existingRecord.content;
        }

        // 如果没有找到匹配的记录，返回 null
        return null;
    } catch (err) {
        console.error('Error checking md5Hash:', err);
        return null;
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

                // if file type is file or image, delete at file at same time
                if ((oldestMessage.type === 'file' || oldestMessage.type === 'image')) {
                    const fileName = path.basename(oldestMessage.content); // 提取文件名
                    const filePath = path.join(__dirname, 'public', 'upload', fileName);
                    try {
                        await fs.unlink(filePath); // 删除文件
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
// 定时任务：每天检查并删除超过30天的记录
cron.schedule('0 0 * * *', async () => {
    const { collection } = await connectToDB();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

    try {
        // 查找超过30天的消息
        const oldMessages = await collection.find({ timestamp: { $lt: thirtyDaysAgo } }).toArray();

        for (const message of oldMessages) {
            // 如果是文件或图片类型，删除对应文件
            if (message.type === 'file' || message.type === 'image') {
                const fileName = path.basename(message.content); // 提取文件名
                const filePath = path.join(__dirname, 'public', 'upload', fileName);
                try {
                    await fs.unlink(filePath); // 删除文件
                } catch (fileErr) {
                    console.error(`Failed to delete file: ${filePath}`, fileErr);
                }
            }

            // 删除过期的消息
            await collection.deleteOne({ _id: message._id });
        }
    } catch (err) {
        console.error('Error during scheduled cleanup:', err);
    }
});

module.exports = {
    insertChat,
    showHistory,
    closeDBConnection,
    checkMd5Hash,
};