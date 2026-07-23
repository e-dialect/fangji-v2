# Changelog

本文件记录项目级别的部署、配置和功能变更。日常开发细节请优先看 Git 历史。

## Unreleased

- 新增 `proofreading_attempts` 校对历史集合，永久保留每轮一校、二校和管理员仲裁结果。
- 将任务认领、提交、两次结果比较和仲裁改为后端事务接口，校对员不能再直接修改任务状态。
- 二校只能读取原始条目和自己的校对历史，无法通过集合 API 读取一校内容。
- 两次结果不一致时进入 `arbitration`，管理员可逐字段对比并提交最终结果。
- 个人统计改为基于校对尝试计算双校一致率，不一致记录不再因重置任务而消失。
- 新增第一阶段端到端集成测试，覆盖权限、盲校、一致通过、不一致仲裁和统计。
- 将生产 Docker Compose 默认入口调整为 Traefik，由 Traefik 路由到 `frontend` 容器的 `80` 端口。
- 保留但默认注释 `frontend` 和 `backend` 的宿主机 `ports` 映射，便于无 Traefik 或本机调试时手动启用。
- 将 PocketBase 数据默认持久化到本地目录 `./pb_data`，便于备份和迁移；Windows 宿主机可叠加 `docker-compose.named-volume.yml` 切换为 Docker named volume。
- 拆分环境变量示例：
  - `.env.example` 用于生产 `docker-compose.yml`。
  - `.env.dev.example` 用于开发 `docker-compose.dev.yml`。
- 生产配置统一使用 `BACKEND_URL` 表示浏览器可访问的后端地址，移除生产 compose 中的旧 `PB_URL` 兼容变量。
