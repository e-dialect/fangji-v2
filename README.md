# 方辑 Fangji v2

方辑 v2 是一个面向方言材料整理的在线校对系统。项目使用 **Vue 3 + Vite + PocketBase** 构建，支持管理员创建项目、上传 PDF 原文、导入 CSV 条目，并由校对员按项目进行两轮独立校对。

当前版本采用“双人二校”流程：同一条目先由一位校对员完成第一次校对，再由另一位校对员完成第二次校对。两次结果完全一致时条目自动完成；若不一致，条目会回到待校对队列并重新进入两轮校对。

## 目录

- [功能概览](#功能概览)
- [快速启动](#快速启动)
- [首次配置](#首次配置)
- [使用流程](#使用流程)
- [CSV 格式](#csv-格式)
- [项目结构](#项目结构)
- [开发说明](#开发说明)
- [常见问题](#常见问题)

## 功能概览

| 角色 | 入口 | 主要功能 |
|------|------|----------|
| 管理员 `admin` | `/admin` | 创建项目、上传 PDF、导入 CSV、查看进度、调整待校对条目顺序、删除待校对条目、导出结果 |
| 校对员 `proofreader` | `/tasks` | 查看项目队列、接取项目下一条任务、校对结构化字段、使用 IPA/BUC 键盘、查看个人统计 |

核心能力：

- 基于 PocketBase 的注册、登录、角色权限控制。
- 管理员维护项目、PDF 文件和 CSV 条目。
- CSV 每行对应一条校对任务，`PDF页码` 用于定位原文页。
- 编辑器左右分栏显示 PDF 原文和结构化校对表格。
- 内置莆仙方言 IPA 键盘，包含音标、数字上标、大词典拼音方案和平话字 BUC 字符。
- 项目大厅按项目汇总总条目、一校待处理、二校待处理、我的进行中、完成进度和不一致退回次数。
- 二校任务必须由不同于一校的校对员完成。
- 两次校对一致自动标记为 `approved`；不一致会清空本轮结果并回到 `pending`。
- 个人主页展示参与项目数、校对条目数、双评通过条目、正确率和排行。

## 快速启动

### Docker Compose 一键运行

推荐云服务器部署使用。当前生产 compose 默认由 Traefik 暴露公网入口；本机没有 Traefik 时，请取消注释 `docker-compose.yml` 里的 `frontend.ports` 后再访问宿主机端口。

```bash
cp .env.example .env
docker compose up -d --build
```

Windows 宿主机如果不适合直接挂载 `./pb_data`，用 Docker named volume 启动：

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.named-volume.yml up -d --build
```

生产 `.env` 里通常只需要先改：

- `TRAEFIK_HOST`：公网域名。
- `APP_ADMIN_EMAIL` / `APP_ADMIN_PASSWORD`：方辑业务管理员账号。
- `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`：需要创建 PocketBase 管理员时再改；生产入口默认不会公开 Admin UI。
- `ENABLE_POCKETBASE_ADMIN_UI`：默认 `false`。仅在受控维护窗口临时设为 `true`。

Traefik 部署时访问：

- 前端：`https://fangji.example.com`
- PocketBase Admin UI：默认对 `https://fangji.example.com/_/` 返回 404。
- PocketBase API：`https://fangji.example.com/api/`

生产模式下前端会先构建为静态文件，再由 Nginx 托管。默认同源访问 PocketBase：

```txt
https://fangji.example.com/      -> 前端
https://fangji.example.com/api/  -> PocketBase API
https://fangji.example.com/_/    -> 默认 404；显式启用后才代理 Admin UI
```

常用命令：

```bash
docker compose ps
docker compose logs -f frontend
docker compose logs -f backend
docker compose down
```

说明：

- `docker-compose.yml` 是生产/部署入口，不再使用 Vite dev server 对外服务，因此不需要维护 Vite `allowedHosts`。
- Traefik 只需要路由到 `frontend` 容器的 `80` 端口；`frontend` 内置 Nginx 会把 `/api/` 转发到 Docker 内部地址 `backend:8090`。
- 生产入口默认隐藏 PocketBase Admin UI。确需维护时，将 `ENABLE_POCKETBASE_ADMIN_UI=true` 后执行 `docker compose up -d --force-recreate frontend`；完成后改回 `false` 并再次重建前端容器。
- HTTPS/HSTS 应由 Traefik 或最外层 TLS 终止代理统一配置；应用 Nginx 始终通过容器内 HTTP 提供服务。
- Traefik 容器必须和 `frontend` 容器共享 Docker network；如果 Traefik 在另一个 compose 项目里，请把它接入本项目网络或给本项目增加 Traefik 的 external network。
- `BACKEND_URL` 留空时，前端自动使用 `window.location.origin`，适合同域名或同端口反向代理部署。
- `BACKEND_URL` 设置为完整后端地址时，前端容器会把构建产物里的 `VITE_BACKEND_URL_RUNTIME_REPLACEMENT` 替换成该地址，适合前后端不同域名部署。
- PocketBase 数据默认通过本地目录 `./pb_data` 持久化，重建容器不会清空数据库和上传文件。Windows 宿主机如果遇到 SQLite 或文件挂载问题，可叠加 `docker-compose.named-volume.yml` 改用 Docker named volume。
- PocketBase schema 和 API rules 由 `backend/pb_migrations` 自动应用。

### Docker Compose 开发模式

适合需要前端热更新的本地开发。

```bash
cp .env.dev.example .env
docker compose -f docker-compose.dev.yml up --build
```

Windows 宿主机可改用 named volume：

```bash
cp .env.dev.example .env
docker compose -f docker-compose.dev.yml -f docker-compose.named-volume.yml up --build
```

启动后访问：

- 前端：`http://localhost:5250`
- PocketBase Admin UI：`http://localhost:8090/_/`
- PocketBase API：`http://localhost:8090/api/`

常用命令：

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs -f frontend
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml down
```

说明：

- Docker 前端开发端口默认使用 `5250`，配置在 [.env.dev.example](.env.dev.example)。
- 前端代码挂载到容器内，支持热更新。
- PocketBase 数据默认写入项目根目录 `./pb_data`；Windows 宿主机可叠加 `docker-compose.named-volume.yml` 使用 Docker named volume。

### 手动本地开发

适合不使用 Docker 或需要分别调试前后端的场景。请分别打开两个终端。

后端：

```bash
cd backend
# 将 PocketBase 二进制文件放到 backend/ 目录后执行
./pocketbase serve
```

前端：

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

`.env` 示例：

```env
VITE_PB_URL=http://127.0.0.1:8090
```

手动开发默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://127.0.0.1:8090`

### 生产构建与预览

```bash
cd frontend
npm install
npm run build
npm run preview
```

构建产物位于 `frontend/dist/`。Docker 生产镜像支持运行时 `BACKEND_URL` 覆盖，因此同一份镜像可以部署到不同域名。

### 云服务器部署

1. 安装 Docker Engine 和 Compose Plugin。
2. 上传或拉取本项目代码到服务器。
3. 复制环境变量文件：

```bash
cp .env.example .env
```

4. 编辑 `.env`。

Traefik 同域名部署示例：

```env
TRAEFIK_ENABLE=true
TRAEFIK_HOST=fangji.example.com
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt
APP_ADMIN_EMAIL=admin@example.com
APP_ADMIN_PASSWORD=请换成强密码
APP_ADMIN_NAME=管理员
PB_ADMIN_EMAIL=pb-admin@example.com
PB_ADMIN_PASSWORD=请换成另一个强密码
ENABLE_POCKETBASE_ADMIN_UI=false
BACKEND_URL=
PB_ALLOWED_ORIGINS=
```

访问结构：

```txt
https://fangji.example.com/      -> 前端
https://fangji.example.com/api/  -> PocketBase API
https://fangji.example.com/_/    -> 默认 404；维护窗口可显式启用
```

如果本机没有 Traefik，只是想通过宿主机端口直接访问，请取消注释 `docker-compose.yml` 里的 `frontend.ports`；需要直连 PocketBase 调试时，再取消注释 `backend.ports`。

前后端不同域名需要另外给 `backend` 配 Traefik router。此时 `.env` 类似：

```env
TRAEFIK_ENABLE=true
TRAEFIK_HOST=fangji.example.com
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt
BACKEND_URL=https://api.fangji.example.com
PB_ALLOWED_ORIGINS=https://fangji.example.com
APP_ADMIN_EMAIL=admin@example.com
APP_ADMIN_PASSWORD=请换成强密码
APP_ADMIN_NAME=管理员
PB_ADMIN_EMAIL=pb-admin@example.com
PB_ADMIN_PASSWORD=请换成另一个强密码
ENABLE_POCKETBASE_ADMIN_UI=false
```

5. 启动服务：

```bash
docker compose up -d --build
```

6. 查看状态：

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

7. 首次登录应用：

- 使用 `.env` 里的 `APP_ADMIN_EMAIL` 和 `APP_ADMIN_PASSWORD` 登录网站。
- 如果需要进入 PocketBase Admin UI，先在受控维护窗口设置 `ENABLE_POCKETBASE_ADMIN_UI=true` 并重建前端容器，再使用 `.env` 里的 `PB_ADMIN_EMAIL` 和 `PB_ADMIN_PASSWORD`。完成后立即关闭入口并重建前端。
- PocketBase collections、字段和 API rules 会由迁移自动应用，不需要进后台手动配置业务规则。

如果服务器前面还有 Nginx/Caddy/宝塔反向代理而不是 Traefik，请取消注释 `frontend.ports` 并把域名代理到对应宿主机端口。默认不暴露 `backend` 到宿主机；如果确实需要本机直连 PocketBase 端口，可取消注释 `backend.ports`。

## 首次配置

1. 启动 PocketBase。
2. 确认迁移自动创建或更新以下 collections：
   - `users`：内置 Auth 集合，扩展 `role` 字段，当前有效角色为 `admin`、`proofreader`。
   - `projects`：校对项目。
   - `project_files`：项目 PDF 文件。
   - `pages`：待校对条目与两轮校对结果。
3. 创建业务用户：
   - Docker 部署时，设置 `APP_ADMIN_EMAIL` 和 `APP_ADMIN_PASSWORD` 后会自动创建业务管理员。
   - Docker 部署时，设置 `PB_ADMIN_EMAIL` 和 `PB_ADMIN_PASSWORD` 后会自动创建 PocketBase Admin UI 管理员。
   - 公开注册入口创建的用户会被后端 hook 固定为 `proofreader`。

不要直接修改已经执行过的迁移文件。需要调整 schema、权限或数据修复时，请新增迁移文件。

## 使用流程

### 1. 登录与路由

- 未登录用户只能访问 `/login` 和 `/register`。
- `admin` 登录后进入 `/admin`。
- `proofreader` 登录后进入 `/tasks`。
- 当前版本没有审核员工作台，旧迁移中的 `reviewer` 角色会在最新迁移中转为 `proofreader`。

### 2. 管理员创建项目

1. 使用 `admin` 账号登录。
2. 在管理员控制台点击“创建新项目”。
3. 填写项目名称和简介。
4. 创建成功后进入项目详情页。

项目详情页会展示总页数、已校对数、校对完成数和完成进度。

### 3. 管理员上传 PDF

1. 进入项目详情页。
2. 在“上传 PDF 文件”区域选择 PDF。
3. 点击“上传 PDF”。

PDF 用于校对员编辑时预览原文。当前代码只负责保存和展示 PDF，不会自动 OCR，也不会自动生成条目；待校对文本主要通过 CSV 导入。

### 4. 管理员导入 CSV

1. 准备包含表头的 CSV 文件。
2. 确保文件包含 `PDF页码` 列。
3. 在项目详情页选择 CSV 并点击“导入 CSV”。

导入规则：

- 每一行生成一条 `pending` 待校对条目。
- `PDF页码` 必须是正整数，用于编辑器定位 PDF 页。
- 除 `PDF页码` 外的列会作为结构化字段展示在校对表格中。
- 去掉 `PDF页码` 后内容全空的行会被拒绝。
- 支持 `UTF-8`、`GB18030`、`GBK` 编码识别。

### 5. 管理员管理条目

项目详情页底部显示条目列表。管理员可对 `pending` 状态的条目进行：

- 范围选择，例如 `1-33` 或 `1,3,5-8`。
- 全选待校对条目。
- 批量下移所选条目。
- 批量删除所选条目。
- 单条上移或下移。

已被认领、校对中、待二校或已完成的条目不会参与这些顺序和删除操作。

### 6. 校对员接取项目

1. 使用 `proofreader` 账号登录。
2. 进入“项目大厅”。
3. 查看各项目的一校待处理、二校待处理、我的进行中和完成进度。
4. 点击“接取项目”或“继续校对”。

系统会优先进入该项目中当前校对员自己的进行中任务；如果没有进行中任务，则按条号接取下一条可处理任务。

二校任务不能由一校同一人接取。如果某项目只剩自己一校过的二校条目，按钮会提示暂无可处理。

### 7. 校对员编辑并提交

编辑页左侧显示 PDF 原文，右侧显示 CSV 字段表格和 IPA 键盘。

操作流程：

1. 根据 `PDF页码` 查看对应 PDF 页；界面允许在当前页和下一页之间切换。
2. 在右侧表格中逐字段校对。
3. 使用 IPA/BUC 键盘插入特殊字符。
4. 在自己的进行中任务之间切换上一条/下一条。
5. 点击“提交校对”。

提交结果：

- 第一次校对后，条目状态变为 `proofread`，等待另一位校对员二校。
- 第二次校对与第一次完全一致时，条目状态变为 `approved`。
- 第二次校对与第一次不一致时，本轮一校/二校结果会清空，`mismatch_count` 增加，条目回到 `pending` 重新校对。

### 8. 校对员个人主页

校对员可在 `/tasks/profile` 查看：

- 参加项目数。
- 已校对条目数。
- 双评通过条目数。
- 校对正确率。
- 正确率排行和条目排行。

同一条目的一校和二校会分别计入参与记录。

### 9. 管理员导出结果

在项目详情页点击“导出校对结果 CSV”。

导出规则：

- 按条号顺序导出。
- `approved` 条目使用最终校对结果。
- 未完成条目回退到原始 CSV 内容。
- 导出的第一列为 `PDF页码`。
- 文件名格式为 `{项目名}_校对结果.csv`。

## CSV 格式

CSV 必须包含表头，且必须包含 `PDF页码` 字段。其他字段名不限，会在校对编辑器中作为栏目展示。

示例：

```csv
PDF页码,词条,读音,释义,例句
1,天光,tʰiŋ⁵⁵ kŋ̍⁴²,早晨,天光就起身
1,食饭,siaʔ⁵ puŋ⁵³,吃饭,转来食饭
2,厝边,t͡sʰuɔ⁵³ piŋ⁵⁵,邻居,厝边来坐
```

字段说明：

| 字段 | 是否必填 | 说明 |
|------|----------|------|
| `PDF页码` | 是 | 正整数，用于定位 PDF 原文页 |
| 其他字段 | 至少一个非空 | 作为校对表格栏目导入 |

## 项目结构

```text
fangji-v2/
├── README.md
├── CHANGELOG.md
├── .env.example
├── .env.dev.example
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.named-volume.yml
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   └── pdfjs/                  # PDF.js 静态资源
│   └── src/
│       ├── components/             # 导航、编辑器、PDF 预览、IPA 键盘
│       ├── composables/            # PDF、结构化字段、任务导航复用逻辑
│       ├── constants/              # 条目状态和状态标签
│       ├── lib/                    # PocketBase 客户端、CSV 解析、diff 工具
│       ├── router/                 # Vue Router 与角色路由守卫
│       ├── services/               # PocketBase 数据访问封装
│       ├── stores/                 # Pinia 登录状态
│       ├── utils/                  # PocketBase 错误格式化
│       └── views/                  # 登录、注册、管理员、校对员页面
└── backend/
    ├── Dockerfile
    ├── docker-entrypoint.sh
    ├── pb_hooks/                   # PocketBase hooks
    └── pb_migrations/              # Schema、权限和双人二校迁移
```

## 开发说明

### 技术栈

- 前端：Vue 3、Vite、Vue Router、Pinia
- 后端：PocketBase
- 样式：纯 CSS
- PDF 预览：静态引入 PDF.js
- 部署：Docker Compose

### 前端脚本

```bash
npm run dev
npm run build
npm run preview
```

当前项目未配置自动化测试脚本。

### 关键状态

```text
pending
  -> claimed
  -> proofreading
  -> proofread
  -> claimed
  -> proofreading
  -> approved

第二次校对不一致:
proofreading -> pending
```

状态含义：

| 状态 | 含义 |
|------|------|
| `pending` | 待第一次校对，或因两次结果不一致被退回重新校对 |
| `claimed` | 已被校对员接取，还未进入编辑态 |
| `proofreading` | 校对员正在编辑 |
| `proofread` | 第一次校对完成，等待另一位校对员二校 |
| `approved` | 两次校对一致，条目完成 |

`reviewing`、`rejected` 是旧流程遗留状态，当前路由和主要业务流程不再使用。

### 后端约束

后端 hook 会在认领时校验：

- 条目必须仍处于 `pending` 或 `proofread`。
- 二校不能由一校同一位校对员完成。
- 公开注册用户固定为 `proofreader`，避免注册时提权。

## 常见问题

### Docker Compose 启动后访问不到前端

本项目默认生产入口由 Traefik 暴露，例如 `https://fangji.example.com`。如果本机没有 Traefik，请取消注释 `docker-compose.yml` 里的 `frontend.ports` 后再访问对应宿主机端口。开发模式前端地址是 `http://localhost:5250`；如果访问 `5173`，那是手动本地开发的默认端口。

可先检查容器状态和日志：

```bash
docker compose ps
docker compose logs -f frontend
```

### 后端启动后没有业务表

确认 PocketBase 启动目录包含：

- `backend/pb_migrations/`
- `backend/pb_hooks/`

迁移只会执行一次。如果已用旧数据启动过，并确认不需要旧数据：默认本地目录模式可清空 `./pb_data` 后重新启动；如果叠加 `docker-compose.named-volume.yml`，则可用 `docker compose -f docker-compose.yml -f docker-compose.named-volume.yml down -v` 删除对应 named volume 后重新启动。

### 首次 Docker 部署后端报 `_collections` 不存在

这是 PocketBase 数据库没有完成初始化时读取 collections 造成的。当前 Dockerfile 会固定在 `/pb` 启动，并将数据库写入 `/pb/pb_data`，确保数据卷、迁移和 hooks 使用同一目录。

如果曾经用旧镜像首次启动失败，并且确认没有需要保留的数据，可清理旧数据后重新构建。

默认本地目录模式：

```bash
docker compose down
rm -rf pb_data/*
docker compose up --build
```

如果叠加 `docker-compose.named-volume.yml`：

```bash
docker compose -f docker-compose.yml -f docker-compose.named-volume.yml down -v
docker compose -f docker-compose.yml -f docker-compose.named-volume.yml up --build
```

### 注册后不是管理员

这是预期行为。公开注册用户会被后端 hook 固定为 `proofreader`。Docker 首次启动可通过 `APP_ADMIN_EMAIL`、`APP_ADMIN_PASSWORD` 创建业务管理员；如需使用 PocketBase Admin UI 修改 `users.role`，请按生产部署说明临时启用入口，完成后立即关闭。

### CSV 导入提示缺少 PDF页码

请确认表头字段完全为 `PDF页码`，并且不要写成 `PDF 页码`、`pdf_page` 或其他形式。推荐保存为 UTF-8 CSV。

### 二校项目显示暂无可处理

二校必须由不同于一校的校对员完成。如果项目中剩余待二校条目都是你一校过的，需要另一位校对员接取。

### 上传 PDF 后没有自动生成校对条目

当前实现中 PDF 只用于原文预览。请通过 CSV 导入待校对文本条目。
