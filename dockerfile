# 1. 使用 Node.js 官方镜像（使用 Node.js v20）
FROM node:20

# 2. 安装 MongoDB
RUN apt-get update && apt-get install -y mongodb

# 3. 设置工作目录
WORKDIR /app

# 4. 复制 package.json 和 package-lock.json
COPY package*.json ./

# 5. 安装 Node.js 依赖
RUN npm install

# 6. 复制项目文件到容器
COPY . .

# 7. 暴露 Node.js 应用的端口
EXPOSE 8080

# 8. 启动 MongoDB 服务和 Node.js 应用
CMD mongod --fork --logpath /var/log/mongodb.log && node app.js
