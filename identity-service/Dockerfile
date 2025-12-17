# use the official Node.js 18 image as the base image
FROM node:18-alpine

# set the working directory in the container
WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "src/server.js"]