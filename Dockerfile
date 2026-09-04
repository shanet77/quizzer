FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/quizzer.db
VOLUME ["/data"]
EXPOSE 3000
CMD ["node","server.js"]
