(() => {
    let socket;
    let mediaRecorder;
    let audioChunks;
    let isRecording = false;
    let myID;
    let chatId;

    const messageInput = document.getElementById('message-input');
    const submitButton = document.getElementById('submit-message');
    const chatBox = document.getElementById('chat-box');
    const fileInput = document.getElementById('file-input');
    const submitFileButton = document.getElementById('submit-file');
    const recordButton = document.getElementById('record-audio');
    const connectionStatus = document.getElementById('connection-status');
    // Event listeners for file input and preview
    fileInput.addEventListener('change', handleFileSelect);
    submitFileButton.addEventListener('click', () => {
        fileInput.click();
    });

    // Event listeners for message input
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleTextSubmit();
        }
    });
    
    submitButton.addEventListener('click', handleTextSubmit);

    // Audio recording event listeners
    recordButton.addEventListener('click', toggleRecording);         
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
            recordButton.textContent = "正在录音，点击发送";
            // 设置最大录音时间为 60 秒
            recordingTimeout = setTimeout(() => {
                if (isRecording) {
                    stopRecording();  // 超过 60 秒自动停止录音
                }
            }, 60000);  // 60秒
        } catch (err) {
            console.error('Error accessing microphone:', err);
            displaySystemMessage('Could not access microphone', true);
        }
    }

    function stopRecording() {
        if (!isRecording || !mediaRecorder) return;
        
        mediaRecorder.stop();
        isRecording = false;
        recordButton.classList.remove('recording');
        recordButton.textContent = "按住说话";
    }
    function toggleRecording(e){
        if (isRecording){
            stopRecording();
        }else{
            startRecording(e);
        }
    }
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Create an image preview element
                const imagePreview = document.createElement('img');
                imagePreview.src = e.target.result;
                imagePreview.className = 'image-preview';  // Apply custom class for styling
    
                // Create a container for the image and buttons
                const previewContainer = document.createElement('div');
                previewContainer.className = 'preview-container';  // Apply a container class
                previewContainer.appendChild(imagePreview);
                
                // Create send button
                const sendImageBtn = document.createElement('button');
                sendImageBtn.textContent = '发送';
                sendImageBtn.className = 'send-image-btn';
                sendImageBtn.onclick = () => {
                    sendMessage(e.target.result, 'image');
                    previewContainer.remove();  // Remove the entire preview container
                    fileInput.value = '';  // Clear the file input
                };
    
                // Create cancel button
                const cancelImageBtn = document.createElement('button');
                cancelImageBtn.textContent = '取消';
                cancelImageBtn.className = 'cancel-image-btn';
                cancelImageBtn.onclick = () => {
                    previewContainer.remove();  // Remove the preview container
                    fileInput.value = '';  // Clear the file input
                };
    
                // Create a container for buttons
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'button-container';  // Apply button container styling
                buttonContainer.appendChild(sendImageBtn);
                buttonContainer.appendChild(cancelImageBtn);
    
                // Add the button container to the preview container
                previewContainer.appendChild(buttonContainer);
    
                // Append preview container to the body (or any other element you wish)
                document.body.appendChild(previewContainer);
            };
            reader.readAsDataURL(file);
        }
    }
    
    
    function handleTextSubmit() {
        const content = messageInput.value.trim();
        if (content) {
            sendMessage(content, 'text');
            messageInput.value = '';
        }
    }

    function connect() {
        const urlParams = new URLSearchParams(window.location.search);
        chatId = urlParams.get('id');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/?id=${chatId}`; 
        socket = new WebSocket(wsUrl);
        socket.onopen = () => {
            connectionStatus.className = `connection-status connected`;
        };
        
        socket.onclose = () => {
            connectionStatus.className = `connection-status disconnected`;
            setTimeout(connect, 5000);
        };
        
        socket.onerror = () => {
            connectionStatus.className = `connection-status error`;
        };
        socket.onmessage = (event) => handleMessage(JSON.parse(event.data));    
    }
    
    function handleMessage(message) {
        try {
            switch (message.type) {
                case 'text':
                    if (message.senderId == myID){
                        console.log("Received text message:", message.content);
                        displayMessage(message.content, 'sent', message.timestamp, message.senderId);
                    }else{
                        displayMessage(message.content, 'received', message.timestamp, message.senderId);
                    }
                    break;
                case 'image':
                    if (message.senderId == myID){
                        displayImage(message.content, 'sent', message.timestamp, message.senderId);
                    }else{
                        displayImage(message.content, 'received', message.timestamp, message.senderId);
                    }
                    break;
                case 'audio':
                    if (message.senderId == myID){
                        displayAudio(message.content, 'sent', message.timestamp, message.senderId);
                    }else{
                        displayAudio(message.content, 'received', message.timestamp, message.senderId);
                    }
                    break;
                case 'system':
                    if (message.content.startsWith('YourID')) {
                        myID = message.content.split(':')[1].trim();
                        console.log('Received MyID',myID);
                    }
                    displaySystemMessage(message.content, false);
                    break;
                case 'error':
                    displaySystemMessage(message.content, true);
                    break;
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            displaySystemMessage('Error displaying message', true);
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
        
        if (type === 'text') {
            displayMessage(content, 'sent', message.timestamp, myID);
        } else if (type === 'image') {
            displayImage(content, 'sent', message.timestamp, myID);
        } else if (type === 'audio') {
            displayAudio(content, 'sent', message.timestamp, myID);
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

    function showConnectionStatus(type) {
        connectionStatus.className = `connection-status ${type}`;
    }

    function escapeHtml(unsafe) {
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

    // Initialize connection
    connect();
})();