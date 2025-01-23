# 1. 构建阶段
FROM node:22 AS build

WORKDIR /app

# 只复制 package.json 和 package-lock.json，安装生产依赖
COPY package*.json ./
RUN npm install --production

# 复制项目文件
COPY . .

# 2. 运行阶段
FROM node:22-alpine

WORKDIR /app

# 从构建阶段复制需要的文件
COPY --from=build /app ./

# 设置容器暴露端口为 8080
EXPOSE 8080

# 设置默认的容器启动命令
CMD ["node", "server.js"]
