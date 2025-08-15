(() => {
    //常量声明
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB in bytes
    let MAX_RECONNECT_ATTEMPTS = 5;
    const isPaused = new Map();
    const lastUploadedPart = new Map();
    const currentFileId = new Map();

    //变量声明
    let socket;
    let mediaRecorder;
    let audioChunks;
    let isRecording = false;
    let myID;
    let chatId;
    let reconnectAttempts = 0;
   //获取界面操作button
    const messageInput = document.getElementById('message-input');
    const submitButton = document.getElementById('submit-message');
    const chatBox = document.getElementById('chat-box');
    const fileInput = document.getElementById('file-input');
    const submitImageButton = document.getElementById('submit-image');
    const recordButton = document.getElementById('record-audio');
    const connectionStatus = document.getElementById('connection-status');
    const submitFileButton = document.getElementById('submit-file');
    //绑定事件
    submitButton.addEventListener('click', handleTextSubmit);
    recordButton.addEventListener('click', toggleRecording);  
    fileInput.addEventListener('change', handleFileSelect);
    submitImageButton.addEventListener('click', () => {
        fileInput.accept = 'image/*,video/*'; 
        fileInput.click();
    });
    submitFileButton.addEventListener('click', () => {
        fileInput.accept = '';
        fileInput.click();
    });
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleTextSubmit();
        }
    });
    chatBox.addEventListener('dragover', (event) => {
        event.preventDefault(); 
        chatBox.classList.add('dragover');
    });
    chatBox.addEventListener('dragleave', () => {
        chatBox.classList.remove('dragover');
    });
    chatBox.addEventListener('drop', (event) => {
        event.preventDefault();
        chatBox.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                handleFileUpload(files[i]);
            }
        }
    });
    //定义各函数
    function escapeHtml(unsafe) {
        if (/^https?:\/\/[^\s]+$/.test(unsafe)) {
            const escapedUrl = unsafe.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
            return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${escapedUrl}</a>`;
        }    
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // 补齐两位
        const day = String(date.getDate()).padStart(2, '0');
        
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    function generateLocalUploadId() {
        return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
    function formatFileSize(sizeInBytes) {
        if (sizeInBytes < 1024) {
          return `${sizeInBytes} B`;
        } else if (sizeInBytes < 1024 * 1024) {
          return `${(sizeInBytes / 1024).toFixed(2)} KB`;
        } else if (sizeInBytes < 1024 * 1024 * 1024) {
          return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
        } else {
          return `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
      }  
    async function startRecording(e) {
        if (e) e.preventDefault();
        if (isRecording) return;
        
        try {
            // 检查是否在安全上下文中运行（HTTPS或localhost）
            if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                console.warn('媒体设备访问需要安全上下文（HTTPS或localhost）');
                toast('Chrome浏览器要求在HTTPS或localhost环境下才能访问麦克风。请使用localhost访问或配置HTTPS。', true);
                return;
            }
            
            // 检查navigator.mediaDevices是否存在
            if (!navigator.mediaDevices) {
                console.warn('navigator.mediaDevices不存在，尝试使用旧版API');
                // 尝试使用旧版API
                navigator.mediaDevices = {};
            }

            // 检查getUserMedia方法是否存在
            if (!navigator.mediaDevices.getUserMedia) {
                console.warn('getUserMedia方法不存在，尝试使用旧版API');
                navigator.mediaDevices.getUserMedia = function(constraints) {
                    // 首先尝试使用旧版的navigator.getUserMedia
                    const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
                    
                    if (!getUserMedia) {
                        console.error('浏览器不支持任何版本的getUserMedia API');
                        return Promise.reject(new Error('浏览器不支持getUserMedia API'));
                    }
                    
                    // 将旧版API包装成Promise
                    return new Promise(function(resolve, reject) {
                        getUserMedia.call(navigator, constraints, resolve, reject);
                    });
                };
            }
            
            // iOS兼容性：使用更宽松的音频约束
            const constraints = {
                audio: {
                    sampleRate: 44100,
                    channelCount: 1,
                    volume: 1.0
                }
            };
            
            console.log('尝试访问麦克风...');
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('麦克风访问成功');
            
            // 检查MediaRecorder是否存在
            if (typeof MediaRecorder === 'undefined') {
                console.error('浏览器不支持MediaRecorder API');
                throw new Error('浏览器不支持MediaRecorder API');
            }
            
            // 统一使用MP4格式以确保跨平台兼容性
            const mimeType = 'audio/mp4;codecs=mp4a.40.2';
            
            // 检查浏览器是否支持选定的MIME类型
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                console.warn(`${mimeType} not supported, falling back to default`);
                mediaRecorder = new MediaRecorder(stream);
            } else {
                mediaRecorder = new MediaRecorder(stream, { mimeType });
            }
            
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                try {
                    const audioBlob = new Blob(audioChunks, { type: mimeType });
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = () => {
                        const base64Audio = reader.result;
                        sendMessage(base64Audio, 'audio');
                    };
                    stream.getTracks().forEach(track => track.stop());
                } catch (error) {
                    console.error('Error processing audio:', error);
                    toast('处理音频时出错', true);
                }
            };
            
            // 统一timeslice设置
            const timeSlice = 1000;
            mediaRecorder.start(timeSlice);
            
            isRecording = true;
            recordButton.classList.add('recording');
            recordButton.textContent = "发出";
            
            // 设置最大录音时间为60秒
            recordingTimeout = setTimeout(() => {
                if (isRecording) {
                    stopRecording();
                }
            }, 60000);
            
        } catch (err) {
            console.error('Recording error:', err);
            
            // 错误处理
            if (err.name === 'NotAllowedError') {
                toast('请先在设置中允许麦克风访问权限', true);
            } else if (err.name === 'NotFoundError') {
                toast('未找到麦克风设备', true);
            } else if (err.name === 'SecurityError') {
                toast('安全错误：Chrome浏览器要求在HTTPS或localhost环境下才能访问麦克风', true);
            } else if (err.message && err.message.includes('getUserMedia')) {
                toast('浏览器不支持或禁用了麦克风访问。如果使用Chrome，请确保使用localhost或HTTPS访问。', true);
            } else {
                toast('无法访问麦克风: ' + err.message, true);
            }
            
            isRecording = false;
            recordButton.classList.remove('recording');
            recordButton.textContent = "语音";
        }
    }
    function stopRecording() {
        if (!isRecording || !mediaRecorder) return;
        
            mediaRecorder.stop();
            clearTimeout(recordingTimeout);
            recordButton.classList.remove('recording');
            recordButton.textContent = "语音";
            isRecording = false;
    }
    function toggleRecording(e){
        if (isRecording){
            stopRecording();
        }else{
            startRecording(e);
        }
    }
    function handleFileSelect(event) {
        const fileInput = event.target;
        const file = fileInput.files[0];
        handleFileUpload(file);
    }
    function handleFileUpload(file){
    
        if (!file) {
            toast('请选择一个文件', true);
            return;
        }
    
        if (file.size > MAX_FILE_SIZE) {
            toast('文件太大了, 都超过了1个G, 选个小点的.', true);
            fileInput.value = '';
            return;
        }
        let fileType;
        if (file.type.startsWith('image/')) {
            fileType = 'image';
        } else if (file.type.startsWith('video/')) {
            fileType = 'video';
        } else {
            fileType = 'file';
        }
        let localUploadId = generateLocalUploadId(); // 生成本地唯一上传编号
        lastUploadedPart.set(localUploadId,0);
        currentFileId.set(localUploadId, file);
        let fileUrl = URL.createObjectURL(file);
        switch (fileType) {
        case 'image':
            displayImage(fileUrl, 'sent', new Date().toISOString(), myID, localUploadId);
            break;
        case 'video':
            displayVideo(fileUrl, 'sent', new Date().toISOString(), myID, localUploadId);
            break;

        case 'file':
            displayMessage(`名称：${file.name}</br>大小：${formatFileSize(file.size)}</br>进度：<span id='progress_${localUploadId}'>0%</span>`, 'sent', new Date().toISOString(), myID, localUploadId);
            break;
    }
    uploadFileInBackground(localUploadId);        
    }
    function calculateFileMD5(file) {
        return new Promise((resolve, reject) => {
            const worker = new Worker('/md5-worker.js');
            
            worker.onmessage = (e) => {
                if (e.data.md5) {
                    resolve(e.data.md5);
                } else if (e.data.error) {
                    reject(new Error(e.data.error));
                }
                worker.terminate();
            };
    
            worker.onerror = (err) => {
                reject(err);
                worker.terminate();
            };
    
            worker.postMessage({ file });
        });
    }
    async function uploadFileInBackground(localUploadId) {
        const file = currentFileId.get(localUploadId);
        const currentUpload = { file, uploadedSize: 0 };
        const encodedFileName = encodeURIComponent(file.name);
        const totalParts = Math.ceil(file.size / CHUNK_SIZE);       
        const progressDisplayBar = document.getElementById(localUploadId);
        isPaused.set(localUploadId, false);
        const md5Hash = await calculateFileMD5(file);
        try {
            const md5Response = await fetch(`/upload/check?md5hash=${md5Hash}`, {
                method: 'GET',
            });
            if (!md5Response.ok) {
                throw new Error(`Unexpected response status: ${md5Response.status}`);
            } else {
                const md5Result = await md5Response.json();
                if (md5Result) {
                    if (md5Result.content !== '') {
                        const fullUrl = md5Result.content;
                        progressDisplayBar.parentElement.remove();
                        sendMessage(fullUrl, 'file', localUploadId, md5Hash);
                        isPaused.delete(localUploadId);
                        lastUploadedPart.delete(localUploadId);
                        currentFileId.delete(localUploadId);
                        fileInput.value = '';
                        return;
                    }
                } else {
                    console.error('MD5 result is missing content');
                    return;
                }
            }
        } catch (error) {
            console.error('Error checking file MD5:', error);
        }
        
        try{
            let partIndex;
            for (partIndex = lastUploadedPart.get(localUploadId); partIndex < totalParts; partIndex++) {
                if (isPaused.get(localUploadId)) {
                    lastUploadedPart.set(localUploadId, partIndex);
                    const progressButtonContainer = progressDisplayBar.closest('.progress-container');
                    const pauseButton = progressButtonContainer.querySelector('.progress-pause-button');
                    const cancelButton = progressButtonContainer.querySelector('.progress-cancel-button');
                    pauseButton.textContent = "继续";
                    cancelButton.style.visibility = "visible";
                    return;
                }
    
                const start = partIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
    
                const response = await fetch('/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
                        'filename': encodedFileName,
                        'filesize': file.size.toString(),
                        'X-File-Id': localUploadId,
                    },
                    body: chunk,
                });
    
                if (!response.ok) {
                    throw new Error(`上传失败: ${response.status} ${response.statusText}`);
                }
    
                const result = await response.json();
                currentUpload.uploadedSize = result.uploadedSize || (start + chunk.size);
                const progress = (currentUpload.uploadedSize / file.size) * 100;
                const progressContainer = progressDisplayBar?.parentElement;
                const progessSpan = document.getElementById(`progress_${localUploadId}`);
                if (progressDisplayBar) {
                    progressDisplayBar.style.width = `${progress}%`;
                    if (progessSpan) {
                        progessSpan.textContent = `${progress.toFixed(2)}%`;
                    }
                }
    
                if (result.status === 'complete') {
                    // 上传完成后的处理
                    progressContainer.remove();
                    const fullUrl = window.location.protocol + '//' + window.location.host + result.link;
                    sendMessage(fullUrl, 'file', localUploadId,md5Hash);
                    isPaused.delete(localUploadId);
                    lastUploadedPart.delete(localUploadId);
                    currentFileId.delete(localUploadId);
                    fileInput.value = '';
                }
            }
        } catch (error) {
            // 错误处理：显示文件上传失败消息
            toast(`上传失败: ${error.message}`, true);
            const progressContainer = progressDisplayBar?.parentElement;
            if (progressContainer) {
                const pauseButton = progressContainer.querySelector('.progress-pause-button');
                const cancelButton = progressContainer.querySelector('.progress-cancel-button');
                if (pauseButton) pauseButton.style.display = 'none'; 
                if (cancelButton) cancelButton.textContent = '清除';
            }
        }
    }    
    function handleTextSubmit() {
        const content = messageInput.value.trim();
        if (content) {
            sendMessage(content, 'text');
            messageInput.value = '';
            messageInput.focus();
        }
    }
    function isValidImageURL(url) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
        try {
            const urlObj = new URL(url);
            const extension = urlObj.pathname.split('.').pop().toLowerCase();
            return imageExtensions.includes(extension);
        } catch (e) {
            return false;
        }
    }
    function isSupportedMedia(content) {
        if (typeof content !== 'string') return false;
        // 支持的视频格式
        const supportedFormats = ['.mp4', '.webm', '.ogg'];
        // 判断是否是视频格式
        return supportedFormats.some(extension => content.toLowerCase().endsWith(extension));
    }
    function handleMessage(message) {
        const senderType = message.senderId === myID ? 'sent' : 'received';
        const displayActions = {
            file: (msg) => {
                let fileUrl = msg.content;
                if (fileUrl.startsWith('/upload/')) {
                    fileUrl = `${window.location.protocol}//${window.location.host}${fileUrl}`;
                }

                if (isValidImageURL(fileUrl)) {
                    displayImage(fileUrl, senderType, msg.timestamp, msg.senderId);
                } else if (isSupportedMedia(fileUrl)) {
                    displayVideo(fileUrl, senderType, msg.timestamp, msg.senderId);
                } else {
                    displayMessage(fileUrl, senderType, msg.timestamp, msg.senderId);
                }
            },
            text: (msg) => displayMessage(msg.content, senderType, msg.timestamp, msg.senderId),
            image: (msg) => {
                let imageUrl = msg.content;
                if (imageUrl.startsWith('/upload/')) {
                    imageUrl = `${window.location.protocol}//${window.location.host}${imageUrl}`;
                }
                displayImage(imageUrl, senderType, msg.timestamp, msg.senderId);
            },
            audio: (msg) => {
                let audioUrl = msg.content;
                if (audioUrl.startsWith('/upload/')) {
                    audioUrl = `${window.location.protocol}//${window.location.host}${audioUrl}`;
                }
                displayAudio(audioUrl, senderType, msg.timestamp, msg.senderId);
            },
            system: (msg) => {
                if (msg.content.startsWith('YourID')) {
                    myID = msg.content.split(':')[1].trim();
                }
                displayOnTop(msg.content, false);
            },
            error: (msg) => displayOnTop(msg.content, true),
        };

        try {
            const action = displayActions[message.type];
            if (action) {
                action(message);
            } else {
                toast(`消息类型不支持：${message.type}`, true);
            }
        } catch (error) {
            toast(`显示消息出错${error}`, true);
        }
    }
    function sendMessage(content, type = 'text',fileID,md5Hash) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            toast('Connection not available', true);
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const chatId = urlParams.get('id');
        const message = {
            chatId,
            type,
            content,
            timestamp: new Date().toISOString(),
            md5Hash
        };

        socket.send(JSON.stringify(message));
        
        switch(type){
            case 'text':
                displayMessage(content, 'sent', message.timestamp, myID);
                break;
            case 'audio':
                displayAudio(content, 'sent', message.timestamp, myID);
                break;
            case 'file':
                if(fileID != 'null'){
                    fileElement = document.getElementById(`progress_${fileID}`);
                    if(fileElement){
                        fileElement.parentElement.innerHTML=`<a href='${content}' target="_blank"'>${content}</a>`;
                    }
                }
        }
    }
    function displayUploadProgressBar(uploadID, containerDiv) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.id = uploadID;
        progressContainer.appendChild(progressBar);
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'progress-button-container';
        const pauseButton = document.createElement('button');
        pauseButton.className = 'progress-pause-button';
        pauseButton.textContent = '暂停';
        pauseButton.onclick = () => handlePause(uploadID,pauseButton);
        buttonContainer.appendChild(pauseButton);
        const cancelButton = document.createElement('button');
        cancelButton.className = 'progress-cancel-button';
        cancelButton.textContent = '取消';
        cancelButton.style.visibility = "hidden";
        cancelButton.onclick = () => handleCancel(uploadID, progressContainer);
        buttonContainer.appendChild(cancelButton);
        progressContainer.appendChild(buttonContainer);
        containerDiv.appendChild(progressContainer);
    }  
    function displayMessage(content, type, timestamp, sender,localUploadId='null') {
        const messageDiv = createMessageElement(type);
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender || 'Anonymous';
        messageDiv.appendChild(senderDiv);
        
        const textBody = document.createElement('div');
        textBody.className = 'message-text-body';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        if (type === 'sent' && localUploadId !== 'null')  {
            textDiv.innerHTML = content;
        }else{
            textDiv.innerHTML = escapeHtml(content);
        }
        textBody.appendChild(textDiv);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = formatTimestamp(timestamp);
        textBody.appendChild(timeDiv);

        if (type === 'sent' && localUploadId !== 'null')  {
            const uploadStatus = document.createElement('div');
            displayUploadProgressBar(localUploadId, uploadStatus);
            textBody.appendChild(uploadStatus);
        }
        messageDiv.appendChild(textBody);
        appendMessage(messageDiv);
    }
    function displayImage(content, type, timestamp, sender, localUploadId = null) {
        if (!content) {
            toast('图片格式错误', true);
            return;
        }
        const chatBox = document.querySelector('.chat-box'); 
        const messageDiv = createMessageElement(type);
    
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender || 'Anonymous';
        messageDiv.appendChild(senderDiv);
    
        const textBody = document.createElement('div');
        textBody.className = 'message-text-body';
    
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';
    
        const img = document.createElement('img');
        img.className = 'chat-image thumbnail';
        
        // 先将图片容器添加到DOM中
        imageContainer.appendChild(img);
        textBody.appendChild(imageContainer);
        
        // 设置图片加载事件
        img.onload = () => {
            // 图片加载成功，移除任何加载指示
            const loadingIndicator = imageContainer.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        };
    
        img.onerror = () => {
            // 移除加载指示
            const loadingIndicator = imageContainer.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }

            if (!imageContainer.querySelector('.retry-button')) {
                img.alt = 'Image failed to load';
                const errorText = document.createElement('span');
                errorText.textContent = 'Failed to load image.';
                errorText.style.color = '#ff4d4f';
                errorText.style.display = 'block';
                errorText.style.padding = '5px';
                imageContainer.appendChild(errorText);
                
                // 添加重试按钮
                const retryButton = document.createElement('button');
                retryButton.textContent = '重试加载';
                retryButton.className = 'retry-button';
                retryButton.onclick = (e) => {
                    e.stopPropagation();
                    // 移除错误信息和重试按钮
                    errorText.remove();
                    retryButton.remove();
                    // 添加加载指示
                    const newLoadingIndicator = document.createElement('span');
                    newLoadingIndicator.className = 'loading-indicator';
                    newLoadingIndicator.textContent = 'Loading...';
                    imageContainer.appendChild(newLoadingIndicator);
                    // 重新加载图片
                    img.src = content + '?t=' + new Date().getTime(); // 添加时间戳避免缓存
                };
                imageContainer.appendChild(retryButton);
            }
        };

        // 添加加载指示
        const loadingIndicator = document.createElement('span');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.textContent = 'Loading...';
        imageContainer.appendChild(loadingIndicator);
    
        img.onclick = () => {
            const fullImage = document.createElement('div');
            fullImage.className = 'full-image-overlay';
    
            const imgFull = document.createElement('img');
            imgFull.src = content;
            imgFull.className = 'full-image';
            imgFull.style.maxWidth = '90vw';
            imgFull.style.maxHeight = '90vh';
    
            fullImage.appendChild(imgFull);
            document.body.appendChild(fullImage);
    
            document.body.style.overflow = 'hidden';
            fullImage.onclick = () => {
                document.body.style.overflow = '';
                fullImage.remove();
            };
        };
        
        // 设置图片源，放在最后以确保事件处理程序已设置
        img.src = content;
    
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = formatTimestamp(timestamp);
        textBody.appendChild(timeDiv);
    
        if (type === 'sent' && localUploadId) {
            const uploadStatus = document.createElement('div');
            displayUploadProgressBar(localUploadId, uploadStatus);
            textBody.appendChild(uploadStatus);
        }
    
        messageDiv.appendChild(textBody);
        appendMessage(messageDiv);
    }      
    function displayAudio(content, type, timestamp, sender) {
        const messageDiv = createMessageElement(type);
        
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender || 'Anonymous';
        messageDiv.appendChild(senderDiv);

        const textBody = document.createElement('div');
        textBody.className = 'message-text-body';

        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = content;
        textBody.appendChild(audio);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = formatTimestamp(timestamp);
        textBody.appendChild(timeDiv);

        messageDiv.appendChild(textBody);
        
        appendMessage(messageDiv);
    }
    function displayVideo(content, type, timestamp, sender,localUploadId='null') {
        const messageDiv = createMessageElement(type);
    
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender || 'Anonymous';
        messageDiv.appendChild(senderDiv);
    
        const textBody = document.createElement('div');
        textBody.className = 'message-text-body';
    
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
    
        const video = document.createElement('video');
        video.src = content;
        video.className = 'chat-video thumbnail';
        video.controls = true; // 添加视频控制按钮
    
        video.onclick = () => {
            const fullVideo = document.createElement('div');
            fullVideo.className = 'full-video-overlay';
            fullVideo.onclick = () => fullVideo.remove();
    
            const videoFull = document.createElement('video');
            videoFull.src = content;
            videoFull.className = 'full-video';
            videoFull.controls = true;
    
            fullVideo.appendChild(videoFull);
            document.body.appendChild(fullVideo);
    
            // 自动播放全屏视频
            videoFull.play();
        };
    
        videoContainer.appendChild(video);
        textBody.appendChild(videoContainer);
    
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = formatTimestamp(timestamp);
        textBody.appendChild(timeDiv);
        if (type === 'sent' && localUploadId !== 'null') {
            const uploadStatus = document.createElement('div');
            displayUploadProgressBar(localUploadId, uploadStatus);
            textBody.appendChild(uploadStatus);
        }
        messageDiv.appendChild(textBody);
        appendMessage(messageDiv);
    }
    function displayOnTop(content, isError = false) {
        const messageDiv = document.getElementById('systemDiv');
        messageDiv.className = `system-message ${isError ? 'error' : ''}`;
        messageDiv.textContent = content;
    }
    function toast(content, isError = false) {
        const toast = document.getElementById('toast');
        toast.textContent = content;
        toast.classList.remove('error', 'success'); 
        toast.classList.add(isError ? 'error' : 'success');
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    function createMessageElement(type) {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        return div;
    }
    function appendMessage(messageDiv) {
        chatBox.appendChild(messageDiv);
        if (chatBox.children.length > 10) {
            chatBox.removeChild(chatBox.firstChild); 
        }
        chatBox.scrollTop = chatBox.scrollHeight;
        setTimeout(() => {
            chatBox.scrollTop = chatBox.scrollHeight;
        }, 100);
    }
    async function handleCancel(localUploadId,progressBar) {
        if (!currentFileId.get(localUploadId)) return;
        isPaused.set(localUploadId, true); 
        try {
            const response = await fetch(`/upload/cancel/${localUploadId}`, {
                method: 'DELETE'
            });
    
            if (!response.ok) {
                throw new Error('取消上传失败');
            }else{
                progressBar.parentElement.parentElement.parentElement.remove();
                toast('取消上传成功', false);
                fileInput.value='';
            }
        } catch (error) {
            toast(`取消上传失败: ${error.message}`, true);
        } 
    }
    async function handlePause(localUploadId,button) {
        isPaused.set(localUploadId, !isPaused.get(localUploadId)); 
        if (!isPaused.get(localUploadId)) {
            //继续上传
            button.textContent="暂停";
            const cancelButton = button.nextElementSibling;
            cancelButton.style.visibility = "hidden";
            await uploadFileInBackground(localUploadId);
        }
    }
    function connect() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            displayOnTop('重联多次没有成功,已停止.', true);
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        chatId = urlParams.get('id');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/?id=${chatId}`; 
        socket = new WebSocket(wsUrl);
        socket.onopen = () => {
            connectionStatus.className = `connection-status connected`;
            reconnectAttempts = 0;
        };
        
        socket.onclose = () => {
            connectionStatus.className = `connection-status disconnected`;
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            setTimeout(connect, delay);
        };
        
        socket.onerror = () => {
            connectionStatus.className = `connection-status error`;
        };
        socket.onmessage = (event) => handleMessage(JSON.parse(event.data));    
    }
    connect();
})();