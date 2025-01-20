# 1. 使用 Node.js 官方镜像（Ubuntu版本）
FROM node:20-buster

# 2. 安装 MongoDB 和其他依赖
RUN apt-get update && \
    apt-get install -y mongodb && \
    apt-get clean

# 3. 设置工作目录
WORKDIR /app

# 4. 安装应用依赖
COPY package*.json ./
RUN npm install

# 5. 复制应用源代码
COPY . .

# 6. 暴露 8080 端口
EXPOSE 8080

# 7. 设置容器启动时的命令
CMD service mongod start && npm start
