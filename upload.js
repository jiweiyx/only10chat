// upload.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
        const filePath = path.join(uploadFolder, uploadInfo.filename);
        
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${uploadInfo.filename}`);
            }
            activeUploads.delete(fileId);
            res.status(200).json({ message: 'Upload cancelled and file deleted' });
        } catch (error) {
            console.error('Error deleting file:', error);
            res.status(500).json({ error: 'Failed to delete file' });
        }
    } else {
        res.status(404).json({ error: 'Upload not found' });
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
                size: filesize
            });
        } else {
            const uploadInfo = activeUploads.get(fileId);
            if (!uploadInfo) {
                return res.status(400).json({ error: 'Upload session not found' });
            }
            uniqueFilename = uploadInfo.filename;
        }

        const filePath = path.join(uploadFolder, uniqueFilename);

        const writeStream = fs.createWriteStream(filePath, {
            flags: startByte === 0 ? 'w' : 'r+',
            start: startByte
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

        const stats = fs.statSync(filePath);
        const currentSize = stats.size;

        console.log('Chunk written:', {
            filename: uniqueFilename,
            currentSize,
            totalSize: filesize,
            chunkStart: startByte,
            chunkSize: req.body.length
        });

        if (currentSize === filesize) {
            activeUploads.delete(fileId);
            res.json({
                status: 'complete',
                uploadedSize: currentSize,
                link: `/upload/${uniqueFilename}`
            });
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

// Clean up incomplete uploads periodically
setInterval(() => {
    const now = Date.now();
    activeUploads.forEach((uploadInfo, fileId) => {
        const filePath = path.join(uploadFolder, uploadInfo.filename);
        try {
            const stats = fs.statSync(filePath);
            // Remove uploads older than 1 hour
            if (now - stats.mtime.getTime() > 3600000) {
                fs.unlinkSync(filePath);
                activeUploads.delete(fileId);
                console.log(`Cleaned up stale upload: ${uploadInfo.filename}`);
            }
        } catch (error) {
            // If file doesn't exist, remove from active uploads
            activeUploads.delete(fileId);
        }
    });
}, 3600000); // Check every hour

function generateUniqueFilename(originalFilename) {
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext);
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(4).toString('hex');
    return `${baseName}_${timestamp}_${randomString}${ext}`;
}

module.exports = uploadRouter;
