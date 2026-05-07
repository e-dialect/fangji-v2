# 方辑 (Fangji v2) — 线上方言校对工坊

一个基于 **Vue.js + PocketBase** 的线上方言书籍校对平台，支持 PDF/CSV 上传、OCR 结果人工校对、IPA 音标输入和多角色审核流程。

## 项目结构

```
fangji-v2/
├── frontend/          # Vue 3 + Vite 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── AppNavbar.vue        # 导航栏
│   │   │   └── editor/
│   │   │       └── IpaKeyboard.vue  # IPA 音标虚拟键盘
│   │   ├── lib/
│   │   │   ├── pocketbase.js        # PocketBase 客户端
│   │   │   ├── csvParser.js         # CSV 解析工具
│   │   │   └── diff.js              # 文本对比工具
│   │   ├── services/                 # PocketBase 数据访问封装
│   │   ├── composables/              # 编辑器/PDF/任务导航复用逻辑
│   │   ├── constants/                # 页面状态、任务上限等常量
│   │   ├── utils/                    # 通用错误格式化等工具
│   │   ├── router/                  # Vue Router 路由配置
│   │   ├── stores/
│   │   │   └── auth.js              # Pinia 认证状态
│   │   └── views/
│   │       ├── LoginView.vue         # 登录页
│   │       ├── RegisterView.vue      # 注册页
│   │       ├── admin/               # 管理员视图
│   │       ├── proofreader/         # 校对员视图
│   │       └── reviewer/            # 审核员视图
└── backend/
    ├── pb_migrations/               # PocketBase 数据库迁移
    └── pb_hooks/                    # PocketBase 服务端钩子
```

## 部署 / 启动方式总览

| 方式 | 适用场景 | 前端地址 | 后端地址 |
|------|----------|----------|----------|
| Docker Compose 开发模式 | 推荐本地开发；一条命令启动前后端，支持热更新 | `http://localhost:5250` | `http://localhost:8090` |
| 手动本地开发 | 不使用 Docker；需要本机分别启动 PocketBase 和 Vite | `http://localhost:5173` | `http://127.0.0.1:8090` |
| 前端生产构建 | 检查前端是否可正式打包，或交给 Nginx/静态服务器部署 | 由部署环境决定 | 由 `VITE_PB_URL` 指定 |
| 仅启动后端 | 只调试 PocketBase 迁移、权限、hooks 或接入已有前端 | - | `http://127.0.0.1:8090` |

> 首次启动后端时，都需要访问 PocketBase Admin UI 创建管理员账号。Docker 方式访问 `http://localhost:8090/_/`，手动方式通常访问 `http://127.0.0.1:8090/_/`。

## 快速开始

### 方式一：Docker Compose（推荐，一键启动）

确保已安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)，然后在项目根目录运行：

```bash
docker compose up --build
```

启动后：
- 前端访问地址：`http://localhost:5250`
- 后端（PocketBase Admin UI）：`http://localhost:8090/_/`

> Windows 上 `5173` 可能落在系统保留端口范围内，导致 Docker 无法绑定端口。Compose 开发模式默认使用 `5250`，对应配置见 `docker-compose.yml` 中的 `VITE_DEV_SERVER_PORT=5250`。

停止服务：

```bash
docker compose down
```

后台启动：

```bash
docker compose up -d --build
```

首次启动时，访问 `http://localhost:8090/_/` 创建管理员账号（参见下方"首次设置"步骤）。

> **注意**：PocketBase 数据（数据库、上传文件）通过 Docker Volume `pb_data` 持久化，重建容器不会丢失数据。

---

### 方式二：手动本地开发

适合不使用 Docker、或需要单独调试前端/后端的情况。需要开两个终端：一个启动 PocketBase，一个启动 Vite。

#### 1. 启动后端 (PocketBase)

```bash
# 下载 PocketBase: https://pocketbase.io/docs/
# 将 pocketbase 二进制文件放到 backend/ 目录下

cd backend
./pocketbase serve
```

PocketBase 默认运行在 `http://127.0.0.1:8090`。

**首次设置（重要）**：

1. 访问 `http://127.0.0.1:8090/_/` 创建管理员账号
2. 以下 Collections 由 `backend/pb_migrations/1_init_schema.js` 迁移脚本自动创建，**无需在 Admin UI 手动新建或添加字段**：
   - `users`：使用内置 Auth 集合，包含 PocketBase 自带的 `name` 字段，并通过迁移脚本扩展了 `role: select[admin,proofreader,reviewer]` 字段
   - `projects`：项目基本信息（name, description, admin→users）
   - `project_files`：项目文件（project→projects, file, original_filename, status）
   - `pages`：页面内容与状态（project, project_file, page_number, image, ocr_text, proofread_text, status, proofreader→users, reviewer→users, proofread_at, reviewed_at）
3. Collections API Rules 已由迁移脚本 `backend/pb_migrations/2_apply_access_rules.js` 自动写入，**无需在 Admin UI 手动配置权限规则**
4. 如果需要调整权限规则，请新增一个新的迁移文件（例如 `3_xxx.js`），不要修改已执行过的迁移文件；PocketBase 不会重复执行同名已应用迁移

#### 2. 启动前端

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

前端运行在 `http://localhost:5173`。

`.env` 中的 `VITE_PB_URL` 应指向后端地址，例如：

```env
VITE_PB_URL=http://127.0.0.1:8090
```

### 方式三：前端生产构建 / 本地预览

适合验证生产包是否能正常生成，或将 `dist/` 交给 Nginx、静态服务器、对象存储等环境托管。

```bash
cd frontend
npm install
npm run build
```

构建产物位于 `frontend/dist/`。

本地预览生产包：

```bash
npm run preview
```

> 生产部署时，前端仍需要通过 `VITE_PB_URL` 指向可访问的 PocketBase 后端。Vite 环境变量会在构建时写入，因此不同环境请在构建前设置对应 `.env`。

### 方式四：仅启动后端

适合只检查 PocketBase 数据结构、权限规则、hooks，或前端已经部署在其他地方时使用。

```bash
cd backend
./pocketbase serve
```

后端启动后：
- Admin UI：`http://127.0.0.1:8090/_/`
- API：`http://127.0.0.1:8090/api/`

## 功能概览

### 角色与权限

| 角色 | 功能 |
|------|------|
| **管理员** (admin) | 创建项目、上传 PDF/CSV、查看进度 |
| **校对员** (proofreader) | 认领任务、在线校对、使用 IPA 键盘 |
| **审核员** (reviewer) | 审核校对结果、通过/打回 |

### 核心功能

1. **用户系统**：注册、登录、登出，三种角色
2. **项目管理**：创建项目、上传 PDF 或 CSV 文件
3. **任务大厅**：校对员认领待校对条目，审核员认领待审核条目
4. **在线校对/审核编辑器**：
   - 左栏：项目对应 PDF 预览（支持上下滚动查看）
   - 右栏：可编辑文本 + IPA 虚拟键盘
5. **IPA 键盘**：支持莆仙方言默认皮肤，包含：
   - 国际音标辅音、元音、鼻化符号
   - 数字上标（⁰¹²³⁴⁵⁶⁷⁸）
   - 大词典拼音方案（ü ñ ệ ẹ ê ô）
   - 平话字 BUC（大小写完整集）
6. **审核流程**：高亮显示修改差异、通过/打回
7. **管理员条目管理**：支持范围选中（如 `1-33`）、批量下移、批量删除；删除后自动重排条号

### CSV 文件格式

上传 CSV 时**不再要求固定列名**。系统按“非空行”逐条导入，每一行作为一条待校对文本，并自动生成连续条号（`page_number`）。

示例（任意结构均可）：
```csv
第一条待校对文本
第二条待校对文本
第三条待校对文本
```

编码兼容：`UTF-8`、`GB18030`、`GBK`（自动识别）。

## 今日更新（2026-04-09）

1. 固化并补齐权限迁移，避免依赖手工配置 Collection API Rules。
2. CSV 导入改为“任意 CSV 每行一条任务”，并支持中文常见编码自动识别。
3. 管理员项目详情页新增待校对条目管理：范围选中、批量下移、批量删除、删除后自动重排条号。
4. 校对端与审核端大厅修复并发请求被自动取消问题（auto-cancellation），并补充可见错误提示。
5. 校对编辑页与审核编辑页左侧统一改为项目 PDF 预览（可滚动查看）。

## 技术栈

- **前端**：Vue 3 + Vite + Vue Router + Pinia
- **后端**：PocketBase (Go)
- **样式**：纯 CSS（无框架依赖）
