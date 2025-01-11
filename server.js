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

// Serve static files
app.get('/',(req,res)=>{
    res.redirect(`/chat`);
})
app.get('/chat', (req, res) => {
    chatId = req.query.id;
    if (!chatId) {
        const newChatID = uuidv4();
        return res.redirect(`/chat?id=${newChatID}`);
    }

    // 返回 chat.html 文件
    res.sendFile('chat.html', { root: path.join(__dirname, 'public') }, (err) => {
        if (err) {
            console.error('Error serving chat.html:', err);
            res.status(500).send('Internal Server Error');
        }
    });
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
    const onlineUsers = Array.from(clients.values()).map(clientInfo => clientInfo.id);
    sendSystemMessage(ws,`YourID:${clientInfo.id}`);
    sendSystemMessageToAll(`${clientInfo.id}加入,当前在线人数：${clients.size}(${onlineUsers.join(', ')})`);
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
  // 查：按条件查询
async function findUserByChatID(chatId) {
    const { client, collection } = await connectToDB();
    try {
      const chatHistory = await collection.findOne({ chatId });
      return chatHistory;
    } catch (err) {
      console.error(`Failed to find chatHistory with chatId: ${chatId}:`, err);
    } finally {
      await client.close();
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
                console.log(`Received image from client ${clientInfo.id}`);
                broadcast(chatId,{
                    type: MessageType.IMAGE,
                    senderId: clientInfo.id,
                    content: parsedMessage.content,
                    timestamp: new Date().toISOString()
                }, ws);
                break;

            case MessageType.AUDIO:
                console.log(`Received audio from client ${clientInfo.id}`);
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
    } catch (error) {
        console.error('Error processing message:', error);
        sendErrorMessage(ws, 'Error processing message');
    }
}

function handleDisconnection(ws, clientInfo) {
    console.log(`Client ${clientInfo.id} disconnected`);
    clients.delete(ws);
    // 获取所有在线的用户ID
    const onlineUsers = [];
    clients.forEach((clientInfo) => {
        onlineUsers.push(clientInfo.id); // 收集所有客户端的ID
    });
    sendSystemMessageToAll(`${clientInfo.id}离开了, 当前在线人数：${clients.size}(${onlineUsers.join(', ')})`);
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
function sendSystemMessageToAll(message) {
    clients.forEach((clientInfo, ws) => {
        sendSystemMessage(ws, message);
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