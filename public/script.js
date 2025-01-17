(() => {
    //常量声明
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB in bytes
    let MAX_RECONNECT_ATTEMPTS = 5;
    //变量声明
    let socket;
    let mediaRecorder;
    let audioChunks;
    let isRecording = false;
    let myID;
    let chatId;
    let isPaused = false;
    let currentUpload = null;
    let lastUploadedChunk = 0;
    let currentFileId = null;
    let showUploadArea = false;
    let reconnectAttempts = 0;
   //获取界面操作button
    const messageInput = document.getElementById('message-input');
    const submitButton = document.getElementById('submit-message');
    const chatBox = document.getElementById('chat-box');
    const fileInput = document.getElementById('file-input');
    const submitFileButton = document.getElementById('submit-file');
    const recordButton = document.getElementById('record-audio');
    const connectionStatus = document.getElementById('connection-status');
    const showUpload = document.getElementById('show-upload');
    const uploadFileInput = document.getElementById('upload-file-input');
    const uploadStatus = document.getElementById('upload-status');
    const uploadBtn = document.getElementById('uploadBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const statusText = document.getElementById('statusText');
    //绑定事件
    showUpload.addEventListener('click',displayUploadBar);
    uploadBtn.addEventListener('click',uploadFile);
    pauseBtn.addEventListener('click', togglePause);
    cancelBtn.addEventListener('click', cancelUpload);
    submitButton.addEventListener('click', handleTextSubmit);
    recordButton.addEventListener('click', toggleRecording);  
    fileInput.addEventListener('change', handleFileSelect);
    submitFileButton.addEventListener('click', () => {
        fileInput.click();
    });
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleTextSubmit();
        }
    });
    //定义各函数
    async function startRecording(e) {
        if (e) e.preventDefault();
        if (isRecording) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = reader.result;
                    sendMessage(base64Audio, 'audio');
                };
                    stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start(10); // Start recording with 10ms timeslice for smoother chunks
            isRecording = true;
            recordButton.classList.add('recording');
            recordButton.textContent = "发出";
            // 设置最大录音时间为 60 秒
            recordingTimeout = setTimeout(() => {
                if (isRecording) {
                    stopRecording();  // 超过 60 秒自动停止录音
                }
            }, 60000);  // 60秒
        } catch (err) {
            displaySystemMessage('没得到麦克风使用权限', true);
            isRecording = false;
            recordButton.classList.remove('recording');
            recordButton.textContent = "录音";
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
    
        if (!file) {
            displaySystemMessage('请选择一个文件', true);
            return;
        }
    
        if (file.size > MAX_FILE_SIZE) {
            displaySystemMessage('文件太大了, 都超过了1个G, 选个小点的.', true);
            fileInput.value = '';
            return;
        }
    
        if (file.type.startsWith('image/')) {
            // 创建预览元素
            const previewContainer = document.createElement('div');
            previewContainer.className = 'preview-container';
    
            const imagePreview = document.createElement('img');
            imagePreview.src = URL.createObjectURL(file);
            imagePreview.className = 'image-preview';
    
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';
    
            const sendImageBtn = document.createElement('button');
            sendImageBtn.textContent = '发送';
            sendImageBtn.className = 'send-image-btn';
    
            const cancelImageBtn = document.createElement('button');
            cancelImageBtn.textContent = '取消';
            cancelImageBtn.className = 'cancel-image-btn';
    
            // 追加元素
            previewContainer.appendChild(imagePreview);
            buttonContainer.appendChild(sendImageBtn);
            buttonContainer.appendChild(cancelImageBtn);
            previewContainer.appendChild(buttonContainer);
            document.body.appendChild(previewContainer);
    
            // 取消按钮功能
            cancelImageBtn.onclick = () => {
                previewContainer.remove();
                fileInput.value = '';
            };
            
            // 发送按钮功能
            sendImageBtn.onclick = () => {
                previewContainer.remove();
                fileInput.value = '';
                displaySystemMessage('图片正在后台上传',false);

                // 启动后台上传
                uploadFileInBackground(file);

                //显示发送消息
                displayImage(URL.createObjectURL(file), 'sent', new Date().toISOString(), myID);
            };
        }
    }
    async function uploadFileInBackground(file) {
        currentFileId = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 11);
        currentUpload = { file, uploadedSize: 0 };
        lastUploadedChunk = 0;
        isPaused = false;

                
    
        try {
            const encodedFileName = encodeURIComponent(file.name);
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
    
                const response = await fetch('/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
                        'filename': encodedFileName,
                        'filesize': file.size.toString(),
                        'X-File-Id': currentFileId,
                    },
                    body: chunk,
                });
    
                if (!response.ok) {
                    throw new Error(`上传失败: ${response.status} ${response.statusText}`);
                }
    
                const result = await response.json();
                currentUpload.uploadedSize = result.uploadedSize || (start + chunk.size);
                const progress = (currentUpload.uploadedSize / file.size) * 100;
                displaySystemMessage(`图片正在上传: ${progress.toFixed(2)}%`, false);
    
                if (result.status === 'complete') {
                    displaySystemMessage('图片上传完成！', false);
                    fullUrl = window.location.protocol + '//' + window.location.host + result.link;
                    sendMessage(fullUrl,'image');
                    break;
                }
            }
        } catch (error) {
            displaySystemMessage(`后台上传失败: ${error.message}`, true);
        } finally {
            resetUploadState();
        }
    }  
    function handleTextSubmit() {
        const content = messageInput.value.trim();
        if (content) {
            sendMessage(content, 'text');
            messageInput.value = '';
        }
    }
    function handleMessage(message) {
        try {
            const isImage = (content) =>
                typeof content === 'string' && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(content);
            const isMp4 = (content) =>
                typeof content === 'string' && content.toLowerCase().endsWith('.mp4');
    
            const senderType = message.senderId === myID ? 'sent' : 'received';
    
            switch (message.type) {
                case 'file':
                    if (isImage(message.content)) {
                        displayImage(message.content, senderType, message.timestamp, message.senderId);
                    } else if (isMp4(message.content)) {
                        displayVideo(message.content, senderType, message.timestamp, message.senderId);
                    } else {
                        displayMessage(message.content, senderType, message.timestamp, message.senderId);
                    }
                    break;
    
                case 'text':
                    displayMessage(message.content, senderType, message.timestamp, message.senderId);
                    break;
    
                case 'image':
                    displayImage(message.content, senderType, message.timestamp, message.senderId);
                    break;
    
                case 'audio':
                    displayAudio(message.content, senderType, message.timestamp, message.senderId);
                    break;
    
                case 'system':
                    if (message.content.startsWith('YourID')) {
                        myID = message.content.split(':')[1].trim();
                    }
                    displaySystemMessage(message.content, false);
                    break;
    
                case 'error':
                    displaySystemMessage(message.content, true);
                    break;
    
                default:
                    displaySystemMessage(`消息类型不支持：${message.type}`, true);
                    break;
            }
        } catch (error) {
            displaySystemMessage('显示消息出错', true);
        }
    }     
    function sendMessage(content, type = 'text') {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            displaySystemMessage('Connection not available', true);
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const chatId = urlParams.get('id');
        const message = {
            chatId,
            type,
            content,
            timestamp: new Date().toISOString()
        };

        socket.send(JSON.stringify(message));
        
        switch(type){
            case 'file':
                const isImage = (content) => typeof content === 'string' && content.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/) !== null;
                const isMp4 = (content) => typeof content === 'string' && content.toLowerCase().endsWith('.mp4');

                if (isImage(content)) {
                    displayImage(content, 'sent', message.timestamp, myID);
                } else if (isMp4(content)) {
                    displayVideo(content, 'sent', message.timestamp, myID);
                } else {
                    displayMessage(content, 'sent', message.timestamp, myID);
                }
                break;            
            case 'text':
                displayMessage(content, 'sent', message.timestamp, myID);
                break;
            case 'audio':
                displayAudio(content, 'sent', message.timestamp, myID);
                break;
        }
    }
    function displayMessage(content, type, timestamp, sender) {
        const messageDiv = createMessageElement(type);
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender || 'Anonymous';
        messageDiv.appendChild(senderDiv);
        
        const textBody = document.createElement('div');
        textBody.className = 'message-text-body';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.innerHTML = escapeHtml(content);
        textBody.appendChild(textDiv);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = new Date(timestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/\//g, '-');
        textBody.appendChild(timeDiv);

        messageDiv.appendChild(textBody);
        appendMessage(messageDiv);
    }
    function displayImage(content, type, timestamp, sender) {
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
        img.src = content;
        img.className = 'chat-image thumbnail';
        img.onload = () => {
            chatBox.scrollTop = chatBox.scrollHeight;
        };
        img.onclick = () => {
            const fullImage = document.createElement('div');
            fullImage.className = 'full-image-overlay';
            fullImage.onclick = () => fullImage.remove();
            
            const imgFull = document.createElement('img');
            imgFull.src = content;
            imgFull.className = 'full-image';
            
            fullImage.appendChild(imgFull);
            document.body.appendChild(fullImage);
        };
        
        imageContainer.appendChild(img);
        textBody.appendChild(imageContainer);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = formatTimestamp(timestamp);
        textBody.appendChild(timeDiv);
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
    function displayVideo(content, type, timestamp, sender) {
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
        video.onloadeddata = () => {
            chatBox.scrollTop = chatBox.scrollHeight;
        };
    
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
        messageDiv.appendChild(textBody);
    
        appendMessage(messageDiv);
    }
    function displaySystemMessage(content, isError = false) {
        const messageDiv = document.getElementById('systemDiv');
        messageDiv.className = `system-message ${isError ? 'error' : ''}`;
        messageDiv.textContent = content;
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
    }
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
        return date.toLocaleTimeString();
    }
    function resetUploadState() {

        currentUpload = null;
        lastUploadedChunk = 0;
        currentFileId = null;
        isPaused = false;
        
        uploadFileInput.value = '';
        uploadBtn.disabled = false;
        pauseBtn.disabled = true;
        cancelBtn.disabled = true;
    }
    async function cancelUpload() {
        if (!currentFileId) return;

        try {
            const response = await fetch(`/upload/cancel/${currentFileId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Cancel request failed');
            }

            statusText.textContent = '传输取消';
            resetUploadState();
        } catch (error) {
            statusText.textContent = `取消出错: ${error.message}`;
        }
    }
    function togglePause() {
        isPaused = !isPaused;
        
        if (isPaused) {
            pauseBtn.textContent = '⏩';
        } else {
            pauseBtn.textContent = '⏸️';
            if (currentUpload) {
                continueUpload();
            }
        }
    }
    async function uploadFile() {
        
        const file = uploadFileInput.files[0];
        if (!file) {
            displaySystemMessage('请选择一个文件', true);
            return;
        }
        // Add file size check at start of uploadFile function 
        if (file.size > MAX_FILE_SIZE) {
            displaySystemMessage('文件太大了, 都超过了1个G, 选个小点的.', true);
        return;
        }           
        // Generate a unique file ID
        currentFileId = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 11);
        currentUpload = {
            file: file,
            uploadedSize: 0
        };

        lastUploadedChunk = 0;
        isPaused = false;
        
        uploadBtn.disabled = true;
        pauseBtn.disabled = false;
        cancelBtn.disabled = false;
        pauseBtn.textContent = '⏸️';
        await continueUpload();
    }
    async function continueUpload() {
        if (!currentUpload || !currentUpload.file) return;
       
        const file = currentUpload.file;
        const encodedFileName = encodeURIComponent(file.name); 
        
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        try {
            for (let chunkIndex = lastUploadedChunk; chunkIndex < totalChunks; chunkIndex++) {
                if (isPaused) {
                    lastUploadedChunk = chunkIndex;
                    return;
                }

                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                const response = await fetch('/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Range': `bytes ${start}-${end-1}/${file.size}`,
                        'filename': encodedFileName,
                        'filesize': file.size.toString(),
                        'X-File-Id': currentFileId
                    },
                    body: chunk
                });

                if (!response.ok) {
                    throw new Error(`上传出错: ${response.status} ${response.statusText}`);
                }

                const result = await response.json();
                currentUpload.uploadedSize = result.uploadedSize || (start + chunk.size);
                
                const progress = (currentUpload.uploadedSize / file.size) * 100;
                statusText.textContent = `${progress.toFixed(2)}%`;

                if (result.status === 'complete') {

                    statusText.textContent = ``;
                    fullUrl = window.location.protocol + '//' + window.location.host + result.link;
                    sendMessage(fullUrl,'file');
                    resetUploadState();
                    showUpload.style.backgroundColor = 'white';
                    showUploadArea = false;
                    uploadStatus.style.display = 'none';
                    break;
                }
            }
        } catch (error) {
            statusText.textContent = `错误: ${error.message}`;
            resetUploadState();
        }
    }
    function displayUploadBar(){
        if(showUploadArea){
            uploadStatus.style.display = 'none';
            showUpload.style.backgroundColor = 'white';
            showUploadArea = false;
        }else{
            uploadStatus.style.display = 'flex';
            showUpload.style.backgroundColor ='#8BC34A';
            showUploadArea = true;
        }
    }
    function connect() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            displaySystemMessage('重联多次没有成功,已停止.', true);
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