FROM node:22-alpine
WORKDIR /app
RUN npm init -y && npm install ws
COPY server.js .
USER node
CMD ["node", "server.js"]