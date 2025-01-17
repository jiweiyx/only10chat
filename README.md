# PrivateChat 项目

## 项目背景

PrivateChat 是一个简洁的匿名聊天与文件传输平台，旨在为用户提供一个便捷的即时通讯环境。通过网页浏览器即可直接使用，支持文字、语音、图片、视频等多种形式的消息传递。用户无需注册，直接通过访问聊天室即可与他人进行匿名对话，每个会话仅保留最新的十条记录，确保了简洁与隐私。

本项目支持跨平台使用，无论你使用的是 iOS、Android、Windows、Linux，只要通过浏览器访问，就能与其他用户进行实时聊天和文件传输。

你完全可以根据自己的需要自行搭建该项目并分享给他人， PrivateChat 是一个开源项目，欢迎大家参与和改进。

## 项目实现路径

PrivateChat 采用前后端分离的设计，前端通过浏览器与后端服务交互。后端基于 Node.js，数据库使用 MongoDB 来存储用户的匿名聊天记录和文件信息。

### 技术栈：
- **前端**：HTML, CSS, JavaScript (Vue.js 或 React)
- **后端**：Node.js
- **数据库**：MongoDB
- **文件上传**：支持最大 1GB 文件上传，带有断点续传功能
- **聊天功能**：文字、图片、语音消息的实时传输
- **聊天室管理**：每个聊天室最多只保留 10 条聊天记录，超过时自动清除

## 功能介绍

### 1. **匿名聊天室**
- 每个聊天室会生成一个唯一的 ID，用户通过 `/chat` 路径进入聊天室时，系统会自动创建一个新的聊天室。
- 进入聊天室的用户会根据其 IP 地址和浏览器类型生成一个唯一的代号，确保用户在同一设备上的代号一致且不暴露身份信息。
- 支持文字、语音、图片等内容的发送，用户可以方便地与其他人进行即时交流。

### 2. **记录管理**
- 每个聊天室仅保留 10 条最新的聊天记录，超过 10 条后，最老的记录会被自动删除，保持聊天室的简洁性。
- 同时，服务器端会对过期的聊天记录进行自动清理，以避免数据库膨胀。

### 3. **文件上传与传输**
- 支持文件上传，最大文件大小为 1GB，并且支持断点续传功能。
- 上传的图片和视频会自动显示或播放，方便用户查看共享的文件。
- 该平台适用于快速的文件共享，用户可以轻松实现跨设备、跨平台的文件传输。

### 4. **跨平台支持**
- PrivateChat 支持通过任何设备的浏览器进行访问，无论是手机、平板、还是桌面系统（Windows/Linux），都能轻松访问并进行文件传输。
- 用户可以方便地在不同设备间进行文件传输、聊天，支持任何操作系统平台。

## 安装与配置

### 服务器配置要求：
- **操作系统**：Ubuntu 或其他类 Unix 操作系统
- **内存**：建议1GB以上
- **CPU**：1 核即可
- **数据库**：MongoDB（需要先安装并启动数据库）
- **Node.js**：用于后端服务的运行

### 安装步骤：
1. 克隆项目：
   ```bash
   git clone https://github.com/jiweiyx/privatechat.git
   cd privatechat
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 启动 MongoDB 服务（如果尚未启动）：
   ```bash
   sudo service mongod start
   ```

4. 启动 Node.js 服务：
   ```bash
   npm start
   ```

5. 在浏览器中访问：
   - 主页：`http://<your-server-ip>:8080`
   - 聊天室：`http://<your-server-ip>:8080/chat`

## 使用说明

1. 访问主页后，用户会看到一个简洁的介绍页面，并了解如何使用聊天功能。
2. 用户点击进入聊天室时，系统会自动生成一个唯一的聊天室 ID，进入聊天室后即可开始聊天。
3. 用户可匿名发送文字、语音、图片等消息，同时也可以上传文件（最大 1GB），支持断点续传。
4. 所有聊天室仅保留 10 条聊天记录，超出后会自动删除最旧记录，保持聊天室的清洁和简洁。

## 贡献与自行搭建

欢迎任何有兴趣的人分享和改进。
如果你对搭建、定制或改进项目有任何疑问，欢迎提出 Issue 或 Pull Request，我们非常欢迎任何形式的参与！

## Demo

[十条](https://shitiao.info)

## License

本项目采用 MIT 开源协议，详见 [LICENSE](./LICENSE) 文件。