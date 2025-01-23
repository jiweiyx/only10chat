FROM node:22 AS build
WORKDIR /app
COPY package*.json ./ 
RUN npm install --production
COPY . .

FROM gcr.io/distroless/nodejs
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
CMD ["server.js"]