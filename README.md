# only10chat Project

## Project Background

only10chat is a simple anonymous chat and file transfer platform designed to provide users with an easy-to-use instant messaging environment. It can be accessed directly via a web browser and supports various message formats such as text, voice, images, and videos. No registration is required; users can join a chat room directly to have anonymous conversations. Each session only retains the latest ten messages, ensuring both simplicity and privacy.

This project supports cross-platform use, whether you're using iOS, Android, Windows, or Linux. As long as you access it through a browser, you can chat and transfer files in real-time with other users.

You can also set up this project yourself and share it with others. only10chat is an open-source project, and contributions are welcome.

## Project Implementation Path

only10chat uses a frontend-backend separation design, where the frontend interacts with the backend service via a web browser. The backend is based on Node.js, and MongoDB is used to store users' anonymous chat records and file information.

### Technology Stack:
- **Frontend**: HTML, CSS, JavaScript (Vue.js or React)
- **Backend**: Node.js
- **Database**: MongoDB
- **File Upload**: Supports file uploads up to 1GB with breakpoint resume functionality
- **Chat Functionality**: Real-time transmission of text, images, and voice messages
- **Chat Room Management**: Each chat room only retains 10 chat messages, and older messages are automatically deleted when exceeded

## Features

### 1. **Anonymous Chat Room**
- Each chat room generates a unique ID. When a user enters via the `/chat` path, a new chat room is automatically created.
- Users entering the chat room will have a unique code generated based on their IP address and browser type, ensuring that the code is consistent on the same device and does not expose personal information.
- Supports sending text, voice, images, and other content, allowing users to chat in real-time.

### 2. **Message Management**
- Each chat room only keeps the latest 10 chat messages. Older messages are automatically deleted once the limit is exceeded, maintaining the simplicity of the chat room.
- The server will also automatically clean up expired chat records to avoid database bloat.

### 3. **File Upload and Transfer**
- Supports file uploads up to 1GB, with breakpoint resume functionality.
- Uploaded images and videos will automatically be displayed or played, making it easy for users to view shared files.
- The platform is suitable for quick file sharing, enabling users to easily transfer files across devices and platforms.

### 4. **Cross-Platform Support**
- only10chat can be accessed through any browser, whether on mobile phones, tablets, or desktop systems (Windows/Linux), allowing easy access and file transfer.
- Users can easily transfer files and chat across different devices and platforms.

## Installation and Configuration

### Server Requirements:
- **Operating System**: Ubuntu or other Unix-based OS
- **Memory**: At least 1GB recommended
- **CPU**: 1 core is sufficient
- **Database**: MongoDB (requires installation and running)
- **Node.js**: For backend service

### Installation Steps:
1. Clone the project:
   ```bash
   git clone https://github.com/jiweiyx/only10chat.git
   ```
   and than:
   ```bash
   cd only10chat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start MongoDB service (if not already running):
   ```bash
   sudo service mongod start
   ```

4. Start Node.js service:
   ```bash
   npm start
   ```

5. Access via browser:
   - Homepage: `http://<your-server-ip>:8080`
   - Chat Room: `http://<your-server-ip>:8080/chat`

## Usage Instructions

1. After accessing the homepage, users will see a simple introductory page that explains how to use the chat functionality.
2. When users click to enter a chat room, the system will automatically generate a unique chat room ID, and they can start chatting immediately.
3. Users can anonymously send text, voice, images, and other messages, and also upload files (up to 1GB), with support for breakpoint resume.
4. All chat rooms retain only 10 chat messages. Older messages are automatically deleted, keeping the chat room clean and simple.

## Contribution and Self-Deployment

Everyone interested is welcome to share and improve the project.
If you have any questions about setting up, customizing, or improving the project, feel free to raise an Issue or submit a Pull Request. We welcome any form of participation!

## Demo

[only10.chat](https://only10.chat)

## License

This project is licensed under the MIT Open Source License. See the [LICENSE](./LICENSE) file for more details.