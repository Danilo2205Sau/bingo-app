FROM node:18-alpine

RUN apk add --no-cache \
    fontconfig \
    freetype \
    ttf-dejavu

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000

CMD ["node", "src/app.js"]
