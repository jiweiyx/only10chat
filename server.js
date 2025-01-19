
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const path = require('path');
const uploadRouter = require('./upload');

const { closeDBConnection } = require('./db');
const {setupWebSocket,closeWsConnection} = require('./websocket'); 

const app = express();
const server = http.createServer(app);

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
            res.status(500).send('Internal Server Error');
        }
    });
});
app.use(express.static(path.join(__dirname, 'public')));

app.use('/upload', uploadRouter);  // 挂载路由

setupWebSocket(server);

async function gracefulShutdown() {
    console.log('Starting graceful shutdown...');
    
    //close All Websocket connection
    closeWsConnection();
    
    // Close MongoDB connection
    await closeDBConnection();
    
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