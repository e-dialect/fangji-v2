# Changelog

本文件记录项目级别的部署、配置和功能变更。日常开发细节请优先看 Git 历史。

## Unreleased

- 将生产 Docker Compose 默认入口调整为 Traefik，由 Traefik 路由到 `frontend` 容器的 `80` 端口。
- 保留但默认注释 `frontend` 和 `backend` 的宿主机 `ports` 映射，便于无 Traefik 或本机调试时手动启用。
- 将 PocketBase 数据从 Docker named volume 改为本地目录 `./pb_data`，便于备份和迁移。
- 拆分环境变量示例：
  - `.env.example` 用于生产 `docker-compose.yml`。
  - `.env.dev.example` 用于开发 `docker-compose.dev.yml`。
- 生产配置统一使用 `BACKEND_URL` 表示浏览器可访问的后端地址，移除生产 compose 中的旧 `PB_URL` 兼容变量。
