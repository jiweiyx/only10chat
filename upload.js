// upload.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { checkMd5Hash } = require('./db');

const uploadRouter = express.Router();
const uploadFolder = path.join(__dirname, 'public', 'upload');

// Ensure upload folder exists
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}

// Store active uploads with their file IDs
const activeUploads = new Map();

uploadRouter.use(express.raw({
    type: 'application/octet-stream',
    limit: '1024mb'
}));

// Cancel upload endpoint
uploadRouter.delete('/cancel/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    const uploadInfo = activeUploads.get(fileId);

    if (uploadInfo && uploadInfo.filename) {
            // Delete all already uploaded chunks
            for (let i = 0; i < uploadInfo.uploadedChunks; i++) {
                const chunkPath = path.join(uploadFolder, `${uploadInfo.filename}.part${i}`);
                try {
                    if (fs.existsSync(chunkPath)) {
                        fs.unlinkSync(chunkPath);
                    }
                } catch (error) {
                    console.error('Error deleting chunk:', error);
                }
            }
            // If the file was fully uploaded, delete the final file
            const filePath = path.join(uploadFolder, uploadInfo.filename);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath); // Delete final file
                }
            } catch (error) {
                console.error('Error deleting file:', error);
            }
            activeUploads.delete(fileId); // Clean up the record from activeUploads
            return res.status(200).json({ message: 'Upload cancelled and chunks deleted' });
        
    } else {
        res.status(200).json({ message: 'Upload cancelled successfully (no file found)' });
    }
});
uploadRouter.get('/check', async (req, res) => {
    const md5Hash = req.query.md5hash;
    if (!md5Hash) {
        return res.status(400).json({ error: 'MD5 hash is required' });
    }

    try {
        const filelink = await checkMd5Hash(md5Hash);
        if (filelink) {
            return res.json({ content: filelink });
        } else {
            return res.status(200).json({ content: '' }); // 空内容表示文件未找到
        }
    } catch (err) {
        console.error('Error checking file MD5:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


uploadRouter.post('/', async (req, res) => {
    try {
        const filename = decodeURIComponent(req.headers['filename']);
        const filesize = parseInt(req.headers['filesize']);
        const contentRange = req.headers['content-range'];
        const fileId = req.headers['x-file-id'];
        if (!filename || !filesize || !fileId) {
            return res.status(400).json({ error: 'Missing required headers' });
        }

        if (!req.body || !req.body.length) {
            return res.status(400).json({ error: 'No file data received' });
        }

        let startByte = 0;
        if (contentRange) {
            const matches = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
            if (matches) {
                startByte = parseInt(matches[1]);
            }
        }

        // Get or create unique filename
        let uniqueFilename;
        if (startByte === 0) {
            uniqueFilename = generateUniqueFilename(filename);
            activeUploads.set(fileId, {
                filename: uniqueFilename,
                originalName: filename,
                size: filesize,
                uploadedChunks: 0,
                currentSize: 0 
            });
        } else {
            const uploadInfo = activeUploads.get(fileId);
            if (!uploadInfo) {
                return res.status(400).json({ error: 'Upload session not found' });
            }
            uniqueFilename = uploadInfo.filename;
        }

        const uploadInfo = activeUploads.get(fileId);

        const chunkFilename = `${uniqueFilename}.part${uploadInfo.uploadedChunks}`;
        const chunkPath = path.join(uploadFolder, chunkFilename);
        const writeStream = fs.createWriteStream(chunkPath, {
            flags: 'w', // Always overwrite chunks
        });
        await new Promise((resolve, reject) => {
            writeStream.write(req.body, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            writeStream.end((error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        uploadInfo.uploadedChunks++;
        uploadInfo.currentSize += req.body.length;
        const currentSize = uploadInfo.currentSize;
        if (currentSize === filesize) {
            let allChunksExist = true;
            for (let i = 0; i < uploadInfo.uploadedChunks; i++) {
                const chunkPath = path.join(uploadFolder, `${uniqueFilename}.part${i}`);
                if (!fs.existsSync(chunkPath)) {
                    allChunksExist = false;
                    break;
                }
            }
            if (allChunksExist) {
                const finalFilePath = path.join(uploadFolder, uniqueFilename);
                const finalWriteStream = fs.createWriteStream(finalFilePath, { flags: 'w' });

                try {
                    for (let i = 0; i < uploadInfo.uploadedChunks; i++) {
                        const chunkPath = path.join(uploadFolder, `${uniqueFilename}.part${i}`);
                        const chunkData = fs.readFileSync(chunkPath); // 读取分片数据
                        finalWriteStream.write(chunkData); // 写入最终文件
                        fs.unlinkSync(chunkPath); // 删除分片文件
                    }
                    finalWriteStream.end();
                } catch (error) {
                    console.error('Error combining chunks:', error);
                }
                

    activeUploads.delete(fileId);
    res.json({
        status: 'complete',
        uploadedSize: currentSize,
        link: `/upload/${uniqueFilename}`
    });
        }else{
            res.status(500).json({ error: 'Some chunks are missing, upload failed' });
        }
        } else {
            res.status(206).json({
                status: 'partial',
                uploadedSize: currentSize
            });
        }

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

function generateUniqueFilename(originalFilename) {
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext);
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(4).toString('hex');
    return `${baseName}_${timestamp}_${randomString}${ext}`;
}

module.exports = uploadRouter;
