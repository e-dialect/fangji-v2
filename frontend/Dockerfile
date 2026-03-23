FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# --host exposes the Vite dev server to all network interfaces inside the container
CMD ["npm", "run", "dev", "--", "--host"]
