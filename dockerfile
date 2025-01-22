# 使用 Node.js 官方镜像作为基础镜像
FROM node:22

# 创建并设置工作目录
WORKDIR /usr/src/app

# 拷贝 package.json 和 package-lock.json
COPY package*.json ./

# 安装项目的依赖
RUN npm install

# 拷贝整个项目文件到工作目录
COPY . .

# 启动 Node.js 应用
CMD ["node", "server.js"]

# 暴露应用运行端口
EXPOSE 8080
