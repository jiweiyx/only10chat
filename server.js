const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const path = require('path');
const uploadRouter = require('./upload');

const app = express();
const crc32 = require('crc-32');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const { MongoClient, ObjectId } = require('mongodb');
const { clear } = require('console');
const fs = require('fs').promises; // 引入 fs 模块

// MongoDB 连接配置
const url = 'mongodb://localhost:27017';
const dbName = 'chatdb';  // 使用 'chatDb' 数据库
const collectionName = 'chatCollection'; // 集合名称
let clientConnection = null;
let dbCollection = null;

const MessageType = {
    TEXT: 'text',
    FILE: 'file',
    IMAGE: 'image',
    AUDIO: 'audio',
    SYSTEM: 'system',
    ERROR: 'error'
};

const clients = new Map();

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: path.join(__dirname, 'public') });
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

app.use('/upload', uploadRouter);  // 挂载路由

// WebSocket server
wss.on('connection', (ws, req) => { 
    const chatId = req.url.split('?id=')[1];
    if (!chatId) {
        ws.close(1008, 'ChatId is required');
        return;
    }
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const combinedInfo = ip + userAgent;
    const hash = (crc32.str(combinedInfo) >>> 0).toString(16).slice(0,2).toUpperCase(); // CRC32 校验和,非负数
    const clientInfo = {
        id: hash,
        chatId: chatId,
        lastActivity: new Date()
    };

    clients.set(ws, clientInfo);
    console.log(`Client ${clientInfo.id} connected, chatid: ${clientInfo.chatId}`);

    const onlineUsers = [];
    clients.forEach((clientInfo) => {
        if (clientInfo.chatId === chatId) {
            onlineUsers.push(clientInfo.id);
        }
    });
    sendSystemMessage(ws, `YourID:${hash}`);
    sendSystemMessageToOthers(clientInfo.chatId, `${clientInfo.id}加入,当前在线${onlineUsers.length}人，代号：${onlineUsers.join(', ')}`);

    showHistory(chatId)
        .then(messages => {
            // Add null check and ensure messages is an array
            if (messages && Array.isArray(messages)) {
                messages.forEach(message => {
                    ws.send(JSON.stringify(message));
                });
            } else {
                console.error('Messages is not an array:', messages);
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
            }
        })
        .catch(error => {
            console.error('Error fetching messages:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to fetch messages.' }));
        });

    // 设置其他事件监听
    ws.on('message', (message) => handleMessage(ws, message, clientInfo));
    ws.on('close', () => {
        clearInterval(interval);
        clients.delete(ws);
        sendSystemMessageToOthers(clientInfo.chatId, `${clientInfo.id}离开,当前在线${onlineUsers.length}人，代号${onlineUsers.join(', ')}`);
        });
    ws.on('error', (error) => handleError(ws, error, clientInfo));

    //add heartbeat to monitor connection health
    ws.isAlive = true;
    ws.on('pong', ()=>{
        ws.isAlive = true;
    });
    const interval = setInterval(() => {
        if (!ws.isAlive) {
            ws.terminate();
            clearInterval(interval);
            return;
        }
        ws.isAlive = false;
        ws.ping();
    }, 30000);
});



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
            if(!parsedMessage.content){
                sendErrorMessage(ws, 'Invalid message format');
                return;
            }
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
            case MessageType.FILE:
            case MessageType.TEXT:
                broadcast(chatId,{
                    type: MessageType.TEXT,
                    senderId: clientInfo.id,
                    content: parsedMessage.content,
                    timestamp: new Date().toISOString()
                }, ws);
                break;

            case MessageType.IMAGE:
                broadcast(chatId,{
                    type: MessageType.IMAGE,
                    senderId: clientInfo.id,
                    content: parsedMessage.content,
                    timestamp: new Date().toISOString()
                }, ws);
                break;

            case MessageType.AUDIO:
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
async function gracefulShutdown() {
    console.log('Starting graceful shutdown...');
    
    // Close all WebSocket connections
    wss.clients.forEach((client) => {
        client.close();
    });
    
    // Close MongoDB connection
    if (clientConnection) {
        await clientConnection.close();
        console.log('MongoDB connection closed');
    }
    
    // Close HTTP server
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);