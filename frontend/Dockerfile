FROM node:20.19-alpine AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM dependencies AS dev

COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM dependencies AS build

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/pocketbase-admin-disabled.conf /opt/fangji/nginx/pocketbase-admin-disabled.conf
COPY nginx/pocketbase-admin-enabled.conf /opt/fangji/nginx/pocketbase-admin-enabled.conf
COPY docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN mkdir -p /etc/nginx/snippets \
  && cp /opt/fangji/nginx/pocketbase-admin-disabled.conf /etc/nginx/snippets/pocketbase-admin.conf \
  && chmod +x /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
