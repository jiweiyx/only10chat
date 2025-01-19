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
            toast('没得到麦克风使用权限', true);
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
            displayMessage(`文件${file.name}`, 'sent', new Date().toISOString(), myID, localUploadId);
            break;
    }
    uploadFileInBackground(localUploadId);        
    }
    async function uploadFileInBackground(localUploadId) {
        file = currentFileId.get(localUploadId);
        const currentUpload = { file, uploadedSize: 0 };
        const encodedFileName = encodeURIComponent(file.name);
        const totalParts = Math.ceil(file.size / CHUNK_SIZE);       
        const progressDisplayBar = document.getElementById(localUploadId);
        isPaused.set(localUploadId,false);
        try {
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
                // 更新进度条显示
                const progressContainer = progressDisplayBar?.parentElement;
                
                if (progressDisplayBar) {
                    progressDisplayBar.style.width = `${progress}%`;
                }
                if (result.status === 'complete') {
                    // 上传完成后的处理
                    progressContainer.remove(); 
                    const fullUrl = window.location.protocol + '//' + window.location.host + result.link;
                    sendMessage(fullUrl, 'file');
                    isPaused.delete(localUploadId);
                    lastUploadedPart.delete(localUploadId);
                    currentFileId.delete(localUploadId);
                    fileInput.value='';

                }
            }
        } catch (error) {
            // 错误处理：显示文件上传失败消息
            toast(`上传失败: ${error.message}`, true);
            if (progressDisplayBar) {
                progressDisplayBar.textContent = '上传失败';
            }
        }
    }     
    function handleTextSubmit() {
        const content = messageInput.value.trim();
        if (content) {
            sendMessage(content, 'text');
            messageInput.value = '';
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
        try {
            switch (message.type) {
                case 'file':
                    if (isValidImageURL(message.content)) {
                        displayImage(message.content, senderType, message.timestamp, message.senderId);
                    } else if (isSupportedMedia(message.content)) {
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
                    displayOnTop(message.content, false);
                    break;
    
                case 'error':
                    displayOnTop(message.content, true);
                    break;
    
                default:
                    toast(`消息类型不支持：${message.type}`, true);
                    break;
            }
        } catch (error) {
            toast(`显示消息出错${error}`, true);
        }
    }     
    function sendMessage(content, type = 'text') {
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
            timestamp: new Date().toISOString()
        };

        socket.send(JSON.stringify(message));
        
        switch(type){
            case 'text':
                displayMessage(content, 'sent', message.timestamp, myID);
                break;
            case 'audio':
                displayAudio(content, 'sent', message.timestamp, myID);
                break;
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
        textDiv.innerHTML = escapeHtml(content);
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
        img.src = content;
        img.className = 'chat-image thumbnail';
    
        img.onload = () => {
            imageContainer.appendChild(img);
        };
    
        img.onerror = () => {
            if (!imageContainer.querySelector('span')) {
                img.alt = 'Image failed to load';
                const errorText = document.createElement('span');
                errorText.textContent = 'Failed to load image.';
                imageContainer.appendChild(errorText);
            }
        };
    
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
    
        textBody.appendChild(imageContainer);
    
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