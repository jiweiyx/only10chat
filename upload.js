// upload.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { checkMd5Hash } = require('./db');

const uploadRouter = express.Router();
// 修改上传文件夹路径，确保在public目录下
const uploadFolder = path.join(__dirname, 'public', 'upload');

// Log the upload folder path for debugging
console.log('Upload folder path:', uploadFolder);
console.log('Current directory:', __dirname);
console.log('Public directory:', path.join(__dirname, 'public'));

// Ensure upload folder exists
if (!fs.existsSync(uploadFolder)) {
    console.log('Upload folder does not exist, creating it...');
    try {
        fs.mkdirSync(uploadFolder, { recursive: true });
        console.log('Upload folder created successfully');
    } catch (error) {
        console.error('Error creating upload folder:', error);
    }
} else {
    console.log('Upload folder already exists');
    // Check if the folder is writable
    try {
        const testFile = path.join(uploadFolder, 'test.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('Upload folder is writable');
    } catch (error) {
        console.error('Upload folder is not writable:', error);
    }
}

// 创建一个测试文件，确认文件夹确实可写
const testFilePath = path.join(uploadFolder, 'test_upload_works.txt');
try {
    fs.writeFileSync(testFilePath, 'This is a test file to confirm upload functionality works');
    console.log('Test file created successfully at:', testFilePath);
    // 确保只输出完整的路径，避免路径混淆
    if (fs.existsSync(testFilePath)) {
        console.log('Test file exists at:', testFilePath);
        // 清理测试文件，避免占用空间
        fs.unlinkSync(testFilePath);
        console.log('Test file removed after verification');
    } else {
        console.error('Test file does not exist at expected path:', testFilePath);
    }
} catch (error) {
    console.error('Failed to create test file:', error);
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
        console.log('File upload request received');
        console.log('Headers:', JSON.stringify(req.headers));
        
        const filename = decodeURIComponent(req.headers['filename']);
        const filesize = parseInt(req.headers['filesize']);
        const contentRange = req.headers['content-range'];
        const fileId = req.headers['x-file-id'];
        
        console.log('Filename:', filename);
        console.log('Filesize:', filesize);
        console.log('Content-Range:', contentRange);
        console.log('File ID:', fileId);
        
        if (!filename || !filesize || !fileId) {
            console.error('Missing required headers');
            return res.status(400).json({ error: 'Missing required headers' });
        }

        if (!req.body || !req.body.length) {
            console.error('No file data received');
            return res.status(400).json({ error: 'No file data received' });
        }
        
        console.log('File data received, length:', req.body.length);

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
                console.log('Creating final file at:', finalFilePath);
                
                try {
                    // 确保目录存在
                    if (!fs.existsSync(uploadFolder)) {
                        console.log('Upload folder does not exist, creating it...');
                        fs.mkdirSync(uploadFolder, { recursive: true });
                    }
                    
                    const finalWriteStream = fs.createWriteStream(finalFilePath, { flags: 'w' });
                    console.log('Final write stream created');
                    
                    // 使用Promise确保文件写入完成
                    const writePromises = [];
                    
                    for (let i = 0; i < uploadInfo.uploadedChunks; i++) {
                        const chunkPath = path.join(uploadFolder, `${uniqueFilename}.part${i}`);
                        console.log(`Reading chunk ${i} from: ${chunkPath}`);
                        
                        if (fs.existsSync(chunkPath)) {
                            const chunkData = fs.readFileSync(chunkPath); // 读取分片数据
                            console.log(`Chunk ${i} read, size: ${chunkData.length} bytes`);
                            
                            // 添加写入Promise
                            writePromises.push(new Promise((resolve, reject) => {
                                finalWriteStream.write(chunkData, (err) => {
                                    if (err) {
                                        console.error(`Error writing chunk ${i}:`, err);
                                        reject(err);
                                    } else {
                                        console.log(`Chunk ${i} written to final file`);
                                        resolve();
                                    }
                                });
                            }));
                            
                            try {
                                fs.unlinkSync(chunkPath); // 删除分片文件
                                console.log(`Chunk ${i} deleted`);
                            } catch (unlinkError) {
                                console.error(`Error deleting chunk ${i}:`, unlinkError);
                            }
                        } else {
                            console.error(`Chunk ${i} does not exist at: ${chunkPath}`);
                        }
                    }
                    
                    // 等待所有写入完成
                    Promise.all(writePromises).then(() => {
                        finalWriteStream.end();
                        console.log('Final file write completed');
                        
                        // Verify the final file exists
                        if (fs.existsSync(finalFilePath)) {
                            const stats = fs.statSync(finalFilePath);
                            console.log(`Final file created successfully, size: ${stats.size} bytes`);
                            console.log(`File can be accessed at: /upload/${uniqueFilename}`);
                        } else {
                            console.error('Final file was not created at:', finalFilePath);
                        }
                    }).catch(error => {
                        console.error('Error writing chunks to final file:', error);
                    });
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
    
    // iOS音频格式特殊处理
    const isIOSAudio = originalFilename.toLowerCase().includes('.m4a') || 
                      originalFilename.toLowerCase().includes('.mp4');
    
    let finalExt = ext;
    if (isIOSAudio && ext.toLowerCase() === '.mp4') {
        finalExt = '.m4a'; // 将iOS的mp4音频文件重命名为.m4a
    }
    
    return `${baseName}_${timestamp}_${randomString}${finalExt}`;
}

module.exports = uploadRouter;
