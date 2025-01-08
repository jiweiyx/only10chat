const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Server Configuration
const CONFIG = {
    PORT: process.env.PORT || 8080,
    PING_INTERVAL: 30000,
    PING_TIMEOUT: 10000,
    MAX_PAYLOAD: 10 * 1024 * 1024, // 10 MB
    MAX_CONNECTIONS: 100
};

// Create HTTP server
const server = http.createServer((req, res) => {
    // Handle HTML request
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Length': data.length
            });
            res.end(data);
        });
    } 
    // Handle CSS request
    else if (req.url === '/style.css') {
        fs.readFile(path.join(__dirname, 'style.css'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading style.css');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/css',
                'Content-Length': data.length
            });
            res.end(data);
        });
    } 
    // Handle script request
    else if (req.url === '/script.js') {
        fs.readFile(path.join(__dirname, 'script.js'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading script.js');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/script',
                'Content-Length': data.length
            });
            res.end(data);
        });
    }
    // Handle 404 for other routes
    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});
// Create WebSocket Server attached to HTTP server
const wss = new WebSocket.Server({
    server,
    clientTracking: true,
    pingInterval: CONFIG.PING_INTERVAL,
    pingTimeout: CONFIG.PING_TIMEOUT,
    maxPayload: CONFIG.MAX_PAYLOAD,
    maxConnections: CONFIG.MAX_CONNECTIONS
});

// Client management
const clients = new Map();

// Message types
const MessageType = {
    TEXT: 'text',
    IMAGE: 'image',
    SYSTEM: 'system'
};

// Broadcast message to all clients
function broadcast(message, sender = null) {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    
    wss.clients.forEach(client => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr);
            } catch (error) {
                console.error('Error broadcasting message:', error);
            }
        }
    });
}

// Handle client connection
function handleConnection(ws) {
    const clientId = uuidv4().slice(-8);
    const clientInfo = {
        id: clientId,
        connectionTime: new Date(),
        lastActivity: new Date()
    };

    // Store client information
    clients.set(ws, clientInfo);
    
    console.log(`Client connected - ID: ${clientId}`);
    
    // Send welcome message
    sendSystemMessage(ws, '畅所欲言吧，兄弟');
    
    // Setup ping-pong for connection health check
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
        clientInfo.lastActivity = new Date();
    });

    // Handle incoming messages
    ws.on('message', (message) => handleMessage(ws, message, clientInfo));
    
    // Handle client disconnection
    ws.on('close', () => handleDisconnection(ws, clientInfo));
    
    // Handle errors
    ws.on('error', (error) => handleError(ws, error, clientInfo));
}

// Handle incoming messages
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

        // Handle different message types
        switch (parsedMessage.type) {
            case MessageType.TEXT:
                console.log(`Received text message from client ${clientInfo.id}:`, parsedMessage.content);
                broadcast({
                    type: MessageType.TEXT,
                    senderId: clientInfo.id,
                    content: parsedMessage.content,
                    timestamp: new Date().toISOString()
                }, ws);
                break;

            case MessageType.IMAGE:
                console.log(`Received image from client ${clientInfo.id}`);
                broadcast({
                    type: MessageType.IMAGE,
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

// Handle client disconnection
function handleDisconnection(ws, clientInfo) {
    console.log(`Client disconnected - ID: ${clientInfo.id}`);
    clients.delete(ws);
    
    // Notify other clients
    broadcast({
        type: MessageType.SYSTEM,
        content: `${clientInfo.id}离开了聊天室`,
        timestamp: new Date().toISOString()
    });
}

// Handle errors
function handleError(ws, error, clientInfo) {
    console.error(`Error for client ${clientInfo.id}:`, error);
    sendErrorMessage(ws, 'An error occurred');
}

// Send system message to specific client
function sendSystemMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: MessageType.SYSTEM,
            content: message,
            timestamp: new Date().toISOString()
        }));
    }
}

// Send error message to specific client
function sendErrorMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: MessageType.SYSTEM,
            error: true,
            content: message,
            timestamp: new Date().toISOString()
        }));
    }
}

// Setup connection health checks
const healthCheck = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            clients.delete(ws);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    });
}, CONFIG.PING_INTERVAL);

// Clean up on server close
wss.on('close', () => {
    clearInterval(healthCheck);
});

// Handle new connections
wss.on('connection', handleConnection);

// Start server
server.listen(CONFIG.PORT, () => {
    console.log(`Server is running on http://localhost:${CONFIG.PORT}`);
    console.log(`WebSocket server is available on ws://localhost:${CONFIG.PORT}`);
});

// Error handling for the server
server.on('error', (error) => {
    console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    server.close(() => {
        wss.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
});
