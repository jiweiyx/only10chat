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

const clients = new Map();
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
            chatId: chatId,
            lastActivity: new Date()
        };
    
        clients.set(ws, clientInfo);
    
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
        if (Object.values(MessageType).includes(parsedMessage.type)) {
            broadcast(chatId, {
                type: parsedMessage.type,
                senderId: clientInfo.id,
                content: parsedMessage.content,
                timestamp: new Date().toISOString()
            }, ws);
        } else {
            console.warn(`Unknown message type from client ${clientInfo.id}`);
            sendErrorMessage(ws, 'Invalid message type');
        }
        //save message to database
        insertChat({
            chatId: chatId,
            senderId: clientInfo.id,
            content: parsedMessage.content,
            type: parsedMessage.type,
            timestamp: new Date().toISOString(),
            md5Hash: parsedMessage.md5Hash
        });

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
        chatId: clientInfo.chatId,
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

function broadcast(chatId, message, sender = null) {
    const messageString = JSON.stringify(message);

    clients.forEach((clientInfo, ws) => {
        if (sender !== ws && ws.readyState === WebSocket.OPEN && clientInfo.chatId === chatId) {
            try {
                ws.send(messageString);
            } catch (error) {
                console.error(`Failed to send message to client ${clientInfo.id}:`, error);
            }
        }
    });
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
