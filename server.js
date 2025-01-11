const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const path = require('path');
const app = express();
const crc32 = require('crc-32');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const { MongoClient, ObjectId } = require('mongodb');
// MongoDB 连接配置
const url = 'mongodb://localhost:27017';
const dbName = 'chatdb';  // 使用 'chatDb' 数据库
const collectionName = 'chatCollection'; // 集合名称

const MessageType = {
    TEXT: 'text',
    IMAGE: 'image',
    AUDIO: 'audio',
    SYSTEM: 'system',
    ERROR: 'error'
};

const clients = new Map();

app.get('/', (req, res) => {
    chatId = req.query.id;
    if (!chatId) {
        const newChatID = uuidv4();
        return res.redirect(`/?id=${newChatID}`);
    }

    // 返回 chat.html 文件
    res.sendFile('chat.html', { root: path.join(__dirname, 'public') }, (err) => {
        if (err) {
            console.error('Error serving chat.html:', err);
            res.status(500).send('Internal Server Error');
        }
    });
});
app.get('/history', async (req, res) => {
    const { chatId, before } = req.query;
    if (!chatId) {
        return res.status(400).send({ error: "chatId is required" });
    }

    try {
        const olderMessages = await findOlderMessages(chatId, before, 10);
        res.json(olderMessages);
    } catch (err) {
        console.error("Error fetching chat history:", err);
        res.status(500).send({ error: "Failed to fetch chat history" });
    }
});
app.use(express.static(path.join(__dirname, 'public')));



// WebSocket server
wss.on('connection', (ws,req) => {
    const chatId = req.url.split('?id=')[1] || uuidv4();  // 如果没有 chatId，则生成一个新的
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const combinedInfo = ip + userAgent;
    const hash = (crc32.str(combinedInfo) >>> 0).toString(16); // CRC32 校验和,非负数
    const clientInfo = {
        id: hash,
        chatId: chatId,
        lastActivity: new Date()
    };
    
    clients.set(ws, clientInfo);
    console.log(`Client ${clientInfo.id} connected,chatid:${clientInfo.chatId}`);
    
    const onlineUsers = [];
    clients.forEach((clientInfo) => {
        if (clientInfo.chatId === chatId) {
            onlineUsers.push(clientInfo.id);
        }
    });
    sendSystemMessage(ws,`YourID:${clientInfo.id}`);
    sendSystemMessageToOthers(clientInfo.chatId,`${clientInfo.id}Join,Onlines:${clients.size}(${onlineUsers.join(', ')})`);
    ws.on('message', (message) => handleMessage(ws, message, clientInfo));
    ws.on('close', () => handleDisconnection(ws, clientInfo));
    ws.on('error', (error) => handleError(ws, error, clientInfo));
});

async function connectToDB() {
  // 创建 MongoClient 实例并连接到 MongoDB
  const client = await MongoClient.connect(url);
  console.log('MongoDB is running!');
  const db = client.db(dbName);
  const collection = db.collection(collectionName);  // 获取集合
  return { client, collection };
}
// 增：插入新数据
async function insertChat(newChat) {
    const { client, collection } = await connectToDB();
    try {
      const result = await collection.insertOne(newChat);
      console.log('Inserted user:', result);
      return result.insertedId;  // 使用 insertedId 获取插入文档的 _id
    } catch (err) {
      console.error('Failed to insert new chat', err);
    } finally {
      await client.close();
    }
  }
  async function findOlderMessages(chatId, beforeId=null, limit = 10) {
    const { client, collection } = await connectToDB();
    console.log(`Finding messages for chatId: ${chatId}, beforeId: ${beforeId}, limit: ${limit}`);
    try {
        // 构造查询条件
        const query = { chatId };

        // 如果提供了 beforeId，则添加 _id 小于 beforeId 的条件
        if (beforeId !== null && ObjectId.isValid(beforeId)) {
            if (ObjectId.isValid(beforeId)) {
                query._id = { $lt: new ObjectId(beforeId) };
            } else {
                console.warn(`Invalid beforeId provided: ${beforeId}`);
                throw new Error(`Invalid beforeId: ${beforeId}`);
            }
        }

        // 查询数据，按 _id 降序排序并限制返回数量
        const chatHistory = await collection
            .find(query)
            .sort({ _id: -1 }) // 最新记录在前
            .limit(limit)
            .toArray();

        // 结果翻转以确保客户端按时间升序显示
        return chatHistory.reverse();
    } catch (err) {
        console.error(`Error finding messages for chatId: ${chatId}, beforeId: ${beforeId}:`, err);
        return [];
    } finally {
        // 确保数据库连接关闭
        if (client) {
            await client.close();
        }
    }
}

  function broadcast(chatId, message, sender = null) {
    const messageString = JSON.stringify(message);

    // 遍历所有客户端
    clients.forEach((clientInfo, ws) => {
        // 如果 sender 是 null 或者 sender 不是当前客户端
        if (sender !== ws && ws.readyState === WebSocket.OPEN && clientInfo.chatId === chatId) {
            // 发送消息给对应的 WebSocket 客户端
            ws.send(messageString);
        }
    });
}
function handleMessage(ws, message, clientInfo) {
    try {
        clientInfo.lastActivity = new Date();

        // Try to parse the message as JSON first
        let parsedMessage;
        const messageString = message.toString();

        try {
            parsedMessage = JSON.parse(messageString);
            parsedMessage.clientId = clientInfo.id;
        } catch (e) {
            // If parsing fails, treat it as a plain text message
            parsedMessage = {
                type: MessageType.TEXT,
                content: messageString
            };
        }
        chatId = parsedMessage.chatId;
        // Handle different message types
        switch (parsedMessage.type) {
            case MessageType.TEXT:
                console.log(`Received text message from chatroom ${chatId},client ${clientInfo.id}:`, parsedMessage.content);
                broadcast(chatId,{
                    type: MessageType.TEXT,
                    senderId: clientInfo.id,
                    content: parsedMessage.content,
                    timestamp: new Date().toISOString()
                }, ws);
                break;

            case MessageType.IMAGE:
                console.log(`Received image from chatroom ${chatId},client ${clientInfo.id}`);
                broadcast(chatId,{
                    type: MessageType.IMAGE,
                    senderId: clientInfo.id,
                    content: parsedMessage.content,
                    timestamp: new Date().toISOString()
                }, ws);
                break;

            case MessageType.AUDIO:
                console.log(`Received audio chatroom ${chatId},from client ${clientInfo.id}`);
                broadcast(chatId,{
                    type: MessageType.AUDIO,
                    senderId: clientInfo.id,
                    content: parsedMessage.content,
                    timestamp: new Date().toISOString()
                }, ws);
                break;

            default:
                console.warn(`Unknown message type from client ${clientInfo.id}`);
                sendErrorMessage(ws, 'Invalid message type');
        }
        //save message to database
        insertChat({
            chatId: chatId,
            senderId: clientInfo.id,
            content: parsedMessage.content,
            type: parsedMessage.type,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error processing message:', error);
        sendErrorMessage(ws, 'Error processing message');
    }
}

function handleDisconnection(ws, clientInfo) {
    console.log(`Client ${clientInfo.id} disconnected`);
    chatId = clientInfo.chatId;
    clients.delete(ws);
    const onlineUsers = [];
    clients.forEach((clientInfo) => {
        if (clientInfo.chatId === chatId) {
            onlineUsers.push(clientInfo.id);
        }
    });
    sendSystemMessageToOthers(chatId,`${clientInfo.id}leave,online:${clients.size}(${onlineUsers.join(', ')})`);
}

function handleError(ws, error, clientInfo) {
    console.error(`Error from client ${clientInfo.id}:`, error);
    clients.delete(ws);
}

function sendSystemMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: MessageType.SYSTEM,
            content: message,
            timestamp: new Date().toISOString()
        }));
    }
}
function sendSystemMessageToOthers(chatId,message) {
    clients.forEach((clientInfo, ws) => {
        if (clientInfo.chatId == chatId){sendSystemMessage(ws, message);}
    });
}

function sendErrorMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: MessageType.ERROR,
            content: message,
            timestamp: new Date().toISOString()
        }));
    }
}

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});