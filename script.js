(() => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const RECONNECT_DELAY = 3000;

    const elements = {
        chatBox: document.getElementById('chat-box'),
        messageInput: document.getElementById('message-input'),
        fileInput: document.getElementById('file-input'),
        connectionStatus: document.getElementById('connection-status')
    };

    let socket;
    let reconnectAttempts = 0;

    function connect() {
        socket = new WebSocket('wss://solarfun.online');

        socket.onopen = () => {
            showConnectionStatus('已连接', 'success');
            reconnectAttempts = 0;
        };

        socket.onclose = () => {
            showConnectionStatus('连接断开，重新尝试中...', 'error');
            setTimeout(connect, RECONNECT_DELAY);
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            showConnectionStatus('连接错误：', 'error');
        };

        socket.onmessage = handleMessage;
    }

    function handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case 'text':
                    displayMessage({ content: data.content, clientId: data.senderId }, 'received', data.timestamp);
                    break;
                case 'image':
                    displayImage(data.content, 'received', data.timestamp);
                    break;
                case 'system':
                    displaySystemMessage(data.content, data.error);
                    break;
                default:
                    console.warn('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            displaySystemMessage('Error processing message', true);
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
            displayMessage(content, 'sent', message.timestamp);
        } else if (type === 'image') {
            displayImage(content, 'sent', message.timestamp);
        }
    }

    function displayMessage(content, type, timestamp) {
        const messageDiv = createMessageElement(type);
        //const clientId = content.senderId || 'Anonymous';
        const clientId = type === 'received' ? content.clientId || 'Anonymous' : 'You';
        messageDiv.innerHTML = `
            <div class="message-content">${escapeHtml(typeof content === 'object' ? content.content : content)}</div>
            <div class="message-info">
                <span class="message-sender">${clientId}</span>
                <span class="message-timestamp">${formatTimestamp(timestamp)}</span>
            </div>
        `;
        appendMessage(messageDiv);
    }

    function displayImage(content, type, timestamp) {
        const messageDiv = createMessageElement(type);
        messageDiv.innerHTML = `
            <img src="${content}" alt="Chat image">
            <div class="message-timestamp">${formatTimestamp(timestamp)}</div>
        `;
        appendMessage(messageDiv);
    }

    function displaySystemMessage(content, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('system-message');
        if (isError) messageDiv.classList.add('error');
        messageDiv.textContent = content;
        appendMessage(messageDiv);
    }

    function createMessageElement(type) {
        const div = document.createElement('div');
        div.classList.add('message', type);
        return div;
    }

    function appendMessage(messageDiv) {
        elements.chatBox.appendChild(messageDiv);
        elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
    }

    function showConnectionStatus(message, type) {
        elements.connectionStatus.textContent = message;
        elements.connectionStatus.style.display = 'block';
        elements.connectionStatus.style.backgroundColor = 
            type === 'success' ? '#28a745' : '#dc3545';
        
        if (type === 'success') {
            setTimeout(() => {
                elements.connectionStatus.style.display = 'none';
            }, 3000);
        }
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
        return new Date(timestamp).toLocaleTimeString();
    }

    // Function to handle message sending
    function handleMessageSend() {
        const preview = document.getElementById('image-preview');
        if (preview.style.display === 'block') {
            sendMessage(preview.src, 'image');
            preview.style.display = 'none';
            elements.fileInput.value = '';
        } else {
            const message = elements.messageInput.value.trim();
            if (message) {
                sendMessage(message);
                elements.messageInput.value = '';
            }
        }
    }

    // Event Listeners
    document.getElementById('submit-message').addEventListener('click', handleMessageSend);
    
    // Add Enter key support
    elements.messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleMessageSend();
        }
    });
    elements.messageInput.addEventListener('input', (event) => {
        const input = event.target;
        const maxLength = 100;
        if (input.value.length > maxLength) {
            input.value = input.value.slice(0, maxLength);
        }
    });

    document.getElementById('submit-file').addEventListener('click', () => {
        elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
            displaySystemMessage(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`, true);
            return;
        }

        const preview = document.getElementById('image-preview');
        const reader = new FileReader();
        reader.onload = () => {
            preview.src = reader.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('submit-message').addEventListener('click', handleMessageSend);

    // Add click event for image enlargement
    document.getElementById('chat-box').addEventListener('click', (event) => {
        if (event.target.tagName === 'IMG') {
            const overlay = document.getElementById('overlay');
            if (!event.target.classList.contains('enlarged')) {
                event.target.classList.add('enlarged');
                overlay.style.display = 'block';
            } else {
                event.target.classList.remove('enlarged');
                overlay.style.display = 'none';
            }
        }
    });

    document.getElementById('overlay').addEventListener('click', () => {
        const enlargedImage = document.querySelector('.enlarged');
        if (enlargedImage) {
            enlargedImage.classList.remove('enlarged');
        }
        document.getElementById('overlay').style.display = 'none';
    });

    // Initialize connection
    connect();
})();