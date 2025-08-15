const WebSocket = require('ws');
const {insertChat,showHistory} = require('./db');
const MessageType = {
    TEXT: 'text',
    FILE: 'file',
    IMAGE: 'image',
    AUDIO: 'audio',
    SYSTEM: 'system',
    ERROR: 'error'
};

const clientsByChatId = new Map();
let wss; 
const crc32 = require('crc-32');


function setupWebSocket(server) {
    wss = new WebSocket.Server({ server });
    console.log('WebSocket server is set up');
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
            ws: ws,
            lastActivity: new Date()
        };
    
        if (!clientsByChatId.has(chatId)) {
            clientsByChatId.set(chatId, new Set());
        }
        clientsByChatId.get(chatId).add(clientInfo);
    
        const onlineUsers = Array.from(clientsByChatId.get(chatId)).map(c => c.id);

        sendSystemMessage(ws, `YourID:${hash}`);
        sendSystemMessageToOthers(chatId, `${clientInfo.id}加入,当前在线${onlineUsers.length}人`);
    
        showHistory(chatId)
            .then(messages => {
                // Add null check and ensure messages is an array
                if (messages && Array.isArray(messages)) {
                    messages.forEach(message => {
                        // 处理文件路径，确保它们是完整的URL
                        if ((message.type === 'file' || message.type === 'image' || message.type === 'audio') && 
                            message.content && message.content.startsWith('/upload/')) {
                            // 不在这里修改数据库中的内容，只在发送前处理
                            const fullMessage = {...message};
                            // 在WebSocket中不能直接访问window.location，所以使用请求的host
                            const host = req.headers.host;
                            const protocol = req.headers['x-forwarded-proto'] || 'http';
                            fullMessage.content = `${protocol}://${host}${message.content}`;
                            ws.send(JSON.stringify(fullMessage));
                        } else {
                            ws.send(JSON.stringify(message));
                        }
                    });
                } else {
                    ws.send(JSON.stringify({ type: 'error', content: 'Invalid message format.', timestamp: new Date().toISOString() }));
                }
            })
            .catch(error => {
                ws.send(JSON.stringify({ type: 'error', content: 'Failed to fetch messages.', timestamp: new Date().toISOString() }));
            });
    
        // 设置其他事件监听
        ws.on('message', (message) => handleMessage(ws, message, clientInfo, chatId));
        ws.on('close', () => {
            clearInterval(interval);
            const chatClients = clientsByChatId.get(chatId);
            if (chatClients) {
                chatClients.delete(clientInfo);
                if (chatClients.size === 0) {
                    clientsByChatId.delete(chatId);
                }
            }
            const onlineUsers = chatClients ? Array.from(chatClients).map(c => c.id) : [];
            sendSystemMessageToOthers(chatId, `${clientInfo.id}离开,当前在线${onlineUsers.length}人`);
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
}

function handleMessage(ws, message, clientInfo, chatId) {
    try {
        clientInfo.lastActivity = new Date();

        let parsedMessage;
        const messageString = message.toString();

        try {
            parsedMessage = JSON.parse(messageString);
        } catch (e) {
            // If parsing fails, treat it as a plain text message
            parsedMessage = {
                type: MessageType.TEXT,
                content: messageString,
            };
        }

        // Validate message structure
        if (!parsedMessage.type || !parsedMessage.content) {
            sendErrorMessage(ws, 'Invalid message format: type and content are required.');
            return;
        }

        // Ensure chatId is part of the message for broadcasting and storage
        parsedMessage.chatId = chatId;
        parsedMessage.senderId = clientInfo.id;
        parsedMessage.timestamp = new Date().toISOString();


        if (Object.values(MessageType).includes(parsedMessage.type)) {
            // Broadcast the message to other clients
            broadcast(chatId, {
                type: parsedMessage.type,
                senderId: clientInfo.id,
                content: parsedMessage.content,
                timestamp: parsedMessage.timestamp
            }, ws);

            // Save message to database
            insertChat({
                chatId: parsedMessage.chatId,
                senderId: parsedMessage.senderId,
                content: parsedMessage.content,
                type: parsedMessage.type,
                timestamp: parsedMessage.timestamp,
                md5Hash: parsedMessage.md5Hash
            });
        } else {
            console.warn(`Unknown message type from client ${clientInfo.id}: ${parsedMessage.type}`);
            sendErrorMessage(ws, `Invalid message type: ${parsedMessage.type}`);
        }

    } catch (error) {
        console.error('Error processing message:', error);
        sendErrorMessage(ws, 'Error processing message');
    }
}

function handleError(ws, error, clientInfo) {
   
    // Log more detailed error information
    const errorDetails = {
        timestamp: new Date().toISOString(),
        clientId: clientInfo.id,
        chatId: chatId,
        errorMessage: error.message,
        errorStack: error.stack
    };
    console.error('Detailed error information:', errorDetails);
    // Notify client with more specific error message
    sendErrorMessage(ws, 'Connection error occurred. Please refresh the page.');
    
    // Cleanup
    if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Internal Server Error');
    }
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
    const chatClients = clientsByChatId.get(chatId);
    if (chatClients) {
        chatClients.forEach(client => {
            sendSystemMessage(client.ws, message);
        });
    }
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

function broadcast(chatId, message, sender = null) {
    const messageString = JSON.stringify(message);
    const chatClients = clientsByChatId.get(chatId);

    if (chatClients) {
        chatClients.forEach(client => {
            if (client.ws !== sender && client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(messageString);
                } catch (error) {
                    console.error(`Failed to send message to client ${client.id}:`, error);
                }
            }
        });
    }
}

let shuttingDown = false;

function closeWsConnection() {
    shuttingDown = true;

    wss.clients.forEach((client) => {
        try {
            if (client.readyState === WebSocket.OPEN) {
                client.close();
            }
        } catch (error) {
            console.error('Error closing client connection:', error);
        }
    });

    try {
        wss.close(() => {
            console.log('WebSocket server closed.');
        });
    } catch (error) {
        console.error('Error closing WebSocket server:', error);
    }
}


module.exports = {
    setupWebSocket,
    closeWsConnection,    
};
