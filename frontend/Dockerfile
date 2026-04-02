FROM node:20.19-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

EXPOSE 5173

# 代码由 docker-compose 挂载，这里只负责启动 dev server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]