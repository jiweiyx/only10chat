# 1. 使用 Node.js 官方镜像（Ubuntu版本）
FROM node:20-buster

# 2. 安装 MongoDB 和其他依赖
RUN apt-get update && apt-get install -y \
  gnupg \
  wget \
  ca-certificates \
  lsb-release \
  sudo \
  && wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | apt-key add - \
  && echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/debian $(lsb_release -cs)/mongodb-org/4.4 main" | tee /etc/apt/sources.list.d/mongodb-org-4.4.list \
  && apt-get update \
  && apt-get install -y mongodb-org \
  && rm -rf /var/lib/apt/lists/*  # 清理缓存以减少镜像大小

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
