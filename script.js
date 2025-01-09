(() => {
    let socket;
    let mediaRecorder;
    let audioChunks;
    let isRecording = false;
    
    const messageInput = document.getElementById('message-input');
    const submitButton = document.getElementById('submit-message');
    const chatBox = document.getElementById('chat-box');
    const fileInput = document.getElementById('file-input');
    const submitFileButton = document.getElementById('submit-file');
    const recordButton = document.getElementById('record-audio');
    const connectionStatus = document.getElementById('connection-status');
    const imagePreview = document.getElementById('image-preview');
    
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
    recordButton.addEventListener('mousedown', startRecording);
    recordButton.addEventListener('mouseup', stopRecording);
    recordButton.addEventListener('mouseleave', stopRecording);
    recordButton.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent scrolling while recording
        startRecording(e);
    }, { passive: false }); // Explicitly set passive to false to ensure preventDefault works
    recordButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopRecording();
    }, { passive: false });
    recordButton.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        stopRecording();
    }, { passive: false });

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
                document.body.appendChild(imagePreview);
    
                // Create send button
                const sendImageBtn = document.createElement('button');
                sendImageBtn.textContent = '确认发送';
                sendImageBtn.className = 'send-image-btn';
                sendImageBtn.onclick = () => {
                    sendMessage(e.target.result, 'image');
                    imagePreview.style.display = 'none';
                    sendImageBtn.remove();
                    cancelImageBtn.remove();
                    fileInput.value = '';
                };
    
                // Create cancel button
                const cancelImageBtn = document.createElement('button');
                cancelImageBtn.textContent = '取消';
                cancelImageBtn.className = 'cancel-image-btn';
                cancelImageBtn.onclick = () => {
                    imagePreview.style.display = 'none';
                    sendImageBtn.remove();
                    cancelImageBtn.remove();
                    fileInput.value = '';  // Clear the file input
                };
    
                // Append buttons to the body or parent element
                document.body.appendChild(sendImageBtn);
                document.body.appendChild(cancelImageBtn);
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

    // Connect to WebSocket server
    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            showConnectionStatus('Connected', 'connected');
        };
        
        socket.onclose = () => {
            showConnectionStatus('Disconnected', 'disconnected');
            setTimeout(connect, 5000);
        };
        
        socket.onerror = () => {
            showConnectionStatus('Connection error', 'error');
        };
        
        socket.onmessage = handleMessage;
    }
    
    function handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'text':
                    displayMessage(message.content, 'received', message.timestamp, message.sender);
                    break;
                case 'image':
                    displayImage(message.content, 'received', message.timestamp, message.sender);
                    break;
                case 'audio':
                    displayAudio(message.content, 'received', message.timestamp, message.sender);
                    break;
                case 'system':
                    displaySystemMessage(message.content);
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

        const message = {
            type,
            content,
            timestamp: new Date().toISOString()
        };

        socket.send(JSON.stringify(message));
        
        if (type === 'text') {
            displayMessage(content, 'sent', message.timestamp, 'You');
        } else if (type === 'image') {
            displayImage(content, 'sent', message.timestamp, 'You');
        } else if (type === 'audio') {
            displayAudio(content, 'sent', message.timestamp, 'You');
        }
    }

    function displayMessage(content, type, timestamp, sender) {
        const messageDiv = createMessageElement(type);
        
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender || 'Anonymous';
        messageDiv.appendChild(senderDiv);
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.innerHTML = escapeHtml(content);
        messageDiv.appendChild(textDiv);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = formatTimestamp(timestamp);
        messageDiv.appendChild(timeDiv);
        
        appendMessage(messageDiv);
    }

    function displayImage(content, type, timestamp, sender) {
        const messageDiv = createMessageElement(type);
        
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender || 'Anonymous';
        messageDiv.appendChild(senderDiv);
        
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';
        
        const img = document.createElement('img');
        img.src = content;
        img.className = 'chat-image thumbnail';
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
        messageDiv.appendChild(imageContainer);
        messageDiv.appendChild(imageContainer);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = formatTimestamp(timestamp);
        messageDiv.appendChild(timeDiv);
        
        appendMessage(messageDiv);
    }

    function displayAudio(content, type, timestamp, sender) {
        const messageDiv = createMessageElement(type);
        
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender || 'Anonymous';
        messageDiv.appendChild(senderDiv);
        
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = content;
        messageDiv.appendChild(audio);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'timestamp';
        timeDiv.textContent = formatTimestamp(timestamp);
        messageDiv.appendChild(timeDiv);
        
        appendMessage(messageDiv);
    }

    function displaySystemMessage(content, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `system-message ${isError ? 'error' : ''}`;
        messageDiv.textContent = content;
        appendMessage(messageDiv);
    }

    function createMessageElement(type) {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        return div;
    }

    function appendMessage(messageDiv) {
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function showConnectionStatus(message, type) {
        connectionStatus.textContent = message;
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