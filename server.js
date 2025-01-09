const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const MessageType = {
    TEXT: 'text',
    IMAGE: 'image',
    AUDIO: 'audio',
    SYSTEM: 'system',
    ERROR: 'error'
};

const clients = new Map();
let nextClientId = 1;

// Serve static files
app.use(express.static(path.join(__dirname)));

// WebSocket server
wss.on('connection', (ws) => {
    const clientInfo = {
        id: nextClientId++,
        lastActivity: new Date()
    };
    
    clients.set(ws, clientInfo);
    console.log(`Client ${clientInfo.id} connected`);
    
    handleConnection(ws);
    
    ws.on('message', (message) => handleMessage(ws, message, clientInfo));
    ws.on('close', () => handleDisconnection(ws, clientInfo));
    ws.on('error', (error) => handleError(ws, error, clientInfo));
});

function broadcast(message, sender = null) {
    const messageString = JSON.stringify(message);
    
    wss.clients.forEach((client) => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(messageString);
        }
    });
}

function handleConnection(ws) {
    sendSystemMessage(ws, 'Connected to chat server');
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

            case MessageType.AUDIO:
                console.log(`Received audio from client ${clientInfo.id}`);
                broadcast({
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