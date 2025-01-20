# Use the official Node.js image (with Node.js v20)
FROM node:20

# Set the working directory
WORKDIR /app

# Install required dependencies and MongoDB from the official MongoDB repo
RUN apt-get update && \
    apt-get install -y gnupg wget && \
    wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | apt-key add - && \
    echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/debian buster/mongodb-org/4.4 main" | tee /etc/apt/sources.list.d/mongodb-org-4.4.list && \
    apt-get update && \
    apt-get install -y mongodb-org && \
    apt-get clean

# Expose the required ports (8080 for Node.js, 27017 for MongoDB)
EXPOSE 8080 27017

# Install dependencies for your Node.js app
COPY package.json .
RUN npm install

# Copy the rest of your application code
COPY . .

# Start MongoDB and your Node.js application
CMD service mongodb start && npm start
