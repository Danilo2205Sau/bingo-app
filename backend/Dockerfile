FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production --legacy-peer-depsgit add Dockerfile

COPY . .

EXPOSE 3000

CMD ["node", "src/app.js"]
