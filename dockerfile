# 使用最新的 Alpine 作为基础镜像
FROM alpine:latest

# 安装 Node.js 和 MongoDB 及其依赖
RUN apk update && \
    apk add --no-cache \
    nodejs \
    npm \
    mongodb-tools \
    bash && \
    echo "http://dl-cdn.alpine-linux.org/alpine/v3.9/main" >> /etc/apk/repositories && \
    echo "http://dl-cdn.alpine-linux.org/alpine/v3.9/community" >> /etc/apk/repositories && \
    apk add --no-cache mongodb=4.0.3-r0 && \
    rm -rf /var/cache/apk/*

# 创建目录用于存储 MongoDB 数据
RUN mkdir -p /data/db

# 设置工作目录
WORKDIR /app

# 将 package.json 和 package-lock.json 复制到容器中
COPY package*.json ./

# 安装 Node.js 应用的依赖
RUN npm install --production

# 复制应用代码到容器
COPY . .

# 暴露 Node.js 端口
EXPOSE 8080

# 启动 MongoDB 和 Node.js 应用
CMD ["sh", "-c", "mongod & node server.js"]
