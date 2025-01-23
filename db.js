const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises; // 引入 fs 模块
const cron = require('node-cron');  // 引入 node-cron 模块

// SQLite3 数据库文件路径
const dbFilePath = path.join(__dirname, 'chatdb.sqlite');

// 创建或连接数据库
const db = new sqlite3.Database(dbFilePath);

// 创建聊天记录表（如果没有创建过）
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS chatCollection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        senderId TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        type TEXT,
        md5Hash TEXT UNIQUE
    )`);
});

// 插入新聊天记录
async function insertChat(newChat) {
    return new Promise((resolve, reject) => {
        if (!newChat.content || !newChat.chatId || !newChat.senderId) {
            return reject('Invalid chat data');
        }
        newChat.content = newChat.content.trim();

        const stmt = db.prepare("INSERT INTO chatCollection (chatId, senderId, content, type, md5Hash) VALUES (?, ?, ?, ?, ?)");
        stmt.run(newChat.chatId, newChat.senderId, newChat.content, newChat.type, newChat.md5Hash, function (err) {
            if (err) {
                reject('Failed to insert chat: ' + err);
            } else {
                // 检查是否需要清理旧消息
                cleanOldMessages(newChat.chatId);
                resolve(this.lastID);  // 返回插入的 ID
            }
        });
        stmt.finalize();
    });
}

// 清理每个聊天室的消息数，保持最新的 10 条记录
function cleanOldMessages(chatId) {
    db.all("SELECT COUNT(*) as count FROM chatCollection WHERE chatId = ?", [chatId], (err, rows) => {
        if (err) {
            console.error('Error checking message count:', err);
            return;
        }
        if (rows[0].count > 10) {
            db.all("SELECT * FROM chatCollection WHERE chatId = ? ORDER BY timestamp ASC LIMIT 1", [chatId], (err, oldestMessages) => {
                if (err) {
                    console.error('Error fetching oldest messages:', err);
                    return;
                }
                if (oldestMessages.length > 0) {
                    const oldestMessage = oldestMessages[0];
                    // 如果是文件或图片类型，删除文件
                    if (oldestMessage.type === 'file' || oldestMessage.type === 'image') {
                        const fileName = path.basename(oldestMessage.content); // 提取文件名
                        const filePath = path.join(__dirname, 'public', 'upload', fileName);
                        fs.unlink(filePath)
                            .catch(fileErr => console.error(`Failed to delete file: ${filePath}`, fileErr));
                    }
                    // 删除旧的数据库记录
                    db.run("DELETE FROM chatCollection WHERE id = ?", [oldestMessage.id], (err) => {
                        if (err) {
                            console.error('Error deleting old message:', err);
                        }
                    });
                }
            });
        }
    });
}

// 查询聊天记录
async function showHistory(chatId) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM chatCollection WHERE chatId = ? ORDER BY timestamp ASC", [chatId], (err, rows) => {
            if (err) {
                reject('Error retrieving chat history: ' + err);
            } else {
                resolve(rows);
            }
        });
    });
}

// 检查 md5Hash 是否存在
async function checkMd5Hash(md5Hash) {
    return new Promise((resolve, reject) => {
        db.get("SELECT content FROM chatCollection WHERE md5Hash = ?", [md5Hash], (err, row) => {
            if (err) {
                reject('Error checking md5Hash: ' + err);
            } else {
                resolve(row ? row.content : null);  // 返回对应的 content 或 null
            }
        });
    });
}

// 定时任务：每天检查并删除超过30天的记录
cron.schedule('0 0 * * *', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    db.run("DELETE FROM chatCollection WHERE timestamp < ?", [thirtyDaysAgo.toISOString()], (err) => {
        if (err) {
            console.error('Error during scheduled cleanup:', err);
        } else {
            console.log('Old messages deleted successfully.');
        }
    });
});

// 关闭数据库连接
function closeDBConnection() {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
    });
}

module.exports = {
    insertChat,
    showHistory,
    closeDBConnection,
    checkMd5Hash,
};
