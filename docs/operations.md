# 单机运维与恢复

使用单实例 PocketBase/SQLite。正式启用前按以下步骤演练，记录版本、耗时和结果。

## 备份与恢复

目标 RPO 为 24 小时，目标 RTO 为 60 分钟；这是初始目标，实际应按数据量测量。
每日低流量窗口停写备份，升级前额外备份；保留 7 份日备份、4 份周备份和 6 份月备份。
备份目录包含全部数据库、WAL/SHM（若存在）、上传文件及其他 pb_data 元数据。
不要只复制 data.db，也不要在线逐个复制数据库和文件。

```sh
docker compose stop frontend backend
python3 backend/ops/backup.py backup ./pb_data /secure-backups/fangji-20260909 \
  --version '填写当前镜像digest或commit' --application-stopped
docker compose start backend frontend
```

工具拒绝已存在的备份目录、软链接及放在源目录内的备份，复制前后检查文件哈希，
验证 SQLite 完整性并记录版本。`--application-stopped` 是操作者对已停写的确认，
工具不能独立判断容器是否停止，文件变化检测也不能替代停写。
named volume 部署需先停止服务，再将卷内容完整复制到离线目录后运行同一命令。
备份成功后传到加密的异地存储，上传完成后验证 manifest；生产数据不得放入 Git。
每日调度应在任何命令非零退出、24 小时无新备份或异地校验失败时通知维护者。
异地存储目标和通知渠道由部署者配置，仓库不预置凭据或发送通知。

恢复到全新路径，保留当前目录供排查：

```sh
docker compose stop frontend backend
python3 backend/ops/backup.py restore /secure-backups/fangji-20260909 ./pb_data-restored
# 验证输出版本与将要运行的镜像匹配；将 Compose 数据挂载切换到恢复目录。
# 确认容器用户能读写该目录后，启动 backend 和 frontend。
```

工具检查完整清单、SHA-256 和 SQLite integrity_check，不覆盖现有目标目录。
启动后检查 `/healthz` 和 `/api/health`，管理员登录、项目/条目数、PDF 打开、
领取/提交、仲裁、CSV 导出，并对比备份前文件哈希。每季度和重要版本升级前重复演练。

## TLS、网络与管理入口

公网 TLS 在 Traefik 终止；只将 frontend 接入代理网络，backend 不发布公网端口。
按实际代理网段配置 TRUSTED_PROXY_CIDRS；外部伪造转发头不得成为限速身份。
仅 HTTPS 的 Traefik router 应设置 HSTS，不能在本机 HTTP 模式强制 HSTS。
当前本机 Compose 默认关闭 Admin UI；Traefik 入口为维护便利默认开启，
正式运营须显式 `ENABLE_POCKETBASE_ADMIN_UI=false`，需要维护时结合 VPN/IP 白名单临时开放。
健康检查和启动依赖已在 Compose 配置。PDF 最大 100 MiB，Nginx 请求上限 101 MiB，
异步校验可能持续数分钟；realtime 连接读取超时为 3600 秒。

## 日志与升级

应用和 Nginx 写 stdout/stderr，使用 `docker compose logs` 查看；生产 Compose
配置 Docker 日志轮转，每个容器最多 5 个 10 MB 文件。按需将脱敏日志集中保存 30 天。
不得记录密码、认证头、token、口令、完整 CSV/PDF 正文；审计记录保留操作者 ID、
资源 ID、时间、操作结果和 request_id。备份/恢复工具仅输出版本和文件数。

升级前确认 CI、阻断评审、镜像 digest、配置差异及迁移说明；停写备份，
先用备份副本演练新版本，再切换正式服务并完成上述烟雾检查。
失败时停止新服务，恢复旧镜像及升级前整目录备份；不能用旧程序直接打开新版本已迁移的数据。

## 本次演练边界

自动测试创建包含扩展汉字/音标的 SQLite 记录及 PDF/CSV 文件，完整备份后恢复到新目录，
验证数据库记录和全部文件 SHA-256 一致；损坏备份、软链接及覆盖现有数据均被拒绝。
这是可重复的离线工具演练，不等同于实际服务器的容量、异地传输及通知链路验收。
部署者仍须测量实际 RPO/RTO，验证容器非 root/最小权限和异地恢复。
