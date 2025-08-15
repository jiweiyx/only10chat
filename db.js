const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises; // 引入 fs 模块
const cron = require('node-cron');  // 引入 node-cron 模块

// SQLite3 数据库文件路径
const dbFilePath = path.join(__dirname, 'chatdb.sqlite');

// 创建或连接数据库
const db = new sqlite3.Database(dbFilePath, (err) => {
    if (err) {
        console.error('Database connection error:', err);
    }
});
db.on('error', (err) => {
    console.error('Database error:', err);
});
// 创建聊天记录表（如果没有创建过）
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS chatCollection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        senderId TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        type TEXT,
        md5Hash TEXT
    )`);

    // 为 chatId 和 md5Hash 创建索引以优化查询性能
    db.run(`CREATE INDEX IF NOT EXISTS idx_chatId ON chatCollection (chatId)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_md5Hash ON chatCollection (md5Hash)`);
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
                console.error('Failed to insert chat:', err);
                reject(err);
            } else {
                // 检查是否需要清理旧消息
                cleanOldMessages(newChat.chatId);
                resolve(this.lastID);  // 返回插入的 ID
            }
        });
        stmt.finalize();
    });
}

// 优化后的清理函数 - 使用单个查询删除多余消息
async function cleanOldMessages(chatId) {
    try {
        const messagesToDelete = await new Promise((resolve, reject) => {
            db.all(
                "SELECT id, content, type FROM chatCollection WHERE chatId = ? ORDER BY timestamp DESC LIMIT -1 OFFSET 10",
                [chatId],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        if (messagesToDelete.length > 0) {
            const ids = messagesToDelete.map(msg => msg.id);
            const deletePromises = messagesToDelete
                .filter(msg => ['file', 'image'].includes(msg.type))
                .map(msg => {
                    const fileName = path.basename(msg.content);
                    const filePath = path.join(__dirname, 'public', 'upload', fileName);
                    return fs.unlink(filePath).catch(err => {
                        console.error(`Failed to delete file: ${filePath}`, err);
                    });
                });

            await Promise.all(deletePromises);
            
            db.run(
                `DELETE FROM chatCollection WHERE id IN (${ids.map(() => '?').join(',')})`,
                ids,
                (err) => {
                    if (err) {
                        console.error('Error deleting old messages:', err);
                    }
                }
            );
        }
    } catch (error) {
        console.error('Error in cleanOldMessages:', error);
    }
}

// 查询聊天记录
async function showHistory(chatId) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM chatCollection WHERE chatId = ? ORDER BY timestamp ASC", [chatId], (err, rows) => {
            if (err) {
                console.error('Error retrieving chat history:', err);
                reject(err);
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
                console.error('Error checking md5Hash:', err);
                reject(err);
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
