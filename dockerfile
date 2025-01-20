# 使用官方的 Node.js 镜像（Node.js v20）
FROM node:20

# 设置工作目录
WORKDIR /app

# 安装应用程序的依赖项
COPY package.json .
RUN npm install

# 复制应用程序的其余代码
COPY . .

# 开放应用服务的端口（8080）
EXPOSE 8080

# 启动 Node.js 应用
CMD ["npm", "start"]
