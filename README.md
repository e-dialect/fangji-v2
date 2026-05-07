# 方辑 (Fangji v2)

线上方言校对工坊。项目基于 **Vue 3 + Vite + PocketBase**，用于把方言书籍、词表或 OCR 文本拆成可认领任务，支持管理员建项、校对员逐条校对、审核员复核通过或打回。

## 目录

- [功能概览](#功能概览)
- [部署与启动](#部署与启动)
- [首次配置](#首次配置)
- [网站使用指南](#网站使用指南)
- [CSV 文件格式](#csv-文件格式)
- [项目结构](#项目结构)
- [开发说明](#开发说明)
- [常见问题](#常见问题)

## 功能概览

| 角色 | 入口 | 主要功能 |
|------|------|----------|
| 管理员 `admin` | `/admin` | 创建项目、上传 PDF、导入 CSV、管理条目顺序、删除待校对条目、导出校对结果 |
| 校对员 `proofreader` | `/tasks` | 查看待校对任务、认领任务、编辑结构化文本、使用 IPA 键盘、提交校对 |
| 审核员 `reviewer` | `/review` | 查看待审核任务、接取审核、修订校对结果、通过或打回 |

核心能力：

- 用户注册、登录、登出和角色路由分流。
- PDF 原文预览，校对/审核时支持按条目映射查看对应 PDF 页。
- CSV 结构化导入，每列在编辑器里以表格字段展示。
- IPA 虚拟键盘，支持国际音标、数字上标、大词典拼音方案和平话字 BUC。
- 任务并发保护：同一任务不会被多人同时认领或审核。
- 每位校对员/审核员最多同时接取 10 个活跃任务。

## 部署与启动

### 启动方式总览

| 方式 | 适用场景 | 前端地址 | 后端地址 |
|------|----------|----------|----------|
| Docker Compose 开发模式 | 推荐本地开发；一条命令启动前后端，支持热更新 | `http://localhost:5250` | `http://localhost:8090` |
| 手动本地开发 | 不使用 Docker；本机分别启动 PocketBase 和 Vite | `http://localhost:5173` | `http://127.0.0.1:8090` |
| 前端生产构建 | 检查正式包，或将 `dist/` 交给 Nginx/静态服务器部署 | 由部署环境决定 | 由 `VITE_PB_URL` 指定 |
| 仅启动后端 | 只调试 PocketBase 迁移、权限、hooks，或接入已有前端 | - | `http://127.0.0.1:8090` |

### 方式一：Docker Compose 开发模式

前置条件：安装 Docker Desktop 或 Docker Engine + Compose Plugin。

```bash
docker compose up --build
```

启动后访问：

- 前端：`http://localhost:5250`
- PocketBase Admin UI：`http://localhost:8090/_/`
- PocketBase API：`http://localhost:8090/api/`

常用命令：

```bash
# 后台启动
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f frontend
docker compose logs -f backend

# 停止并删除容器
docker compose down
```

说明：

- Docker 模式下 PocketBase 数据通过 volume `pb_data` 持久化，重建容器不会清空数据库和上传文件。
- Windows 上 `5173` 可能落在系统保留端口范围内，导致 Docker 无法绑定端口。本项目 Docker 开发模式默认使用 `5250`，配置位于 `docker-compose.yml` 的 `VITE_DEV_SERVER_PORT=5250`。

### 方式二：手动本地开发

适合不使用 Docker 或需要单独调试前后端。请开两个终端。

终端 1：启动后端。

```bash
# 下载 PocketBase: https://pocketbase.io/docs/
# 将 pocketbase 二进制文件放到 backend/ 目录下
cd backend
./pocketbase serve
```

终端 2：启动前端。

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

### 方式三：前端生产构建 / 本地预览

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

注意：`VITE_PB_URL` 会在构建时写入前端包。不同部署环境请在构建前设置对应的后端地址。

### 方式四：仅启动后端

```bash
cd backend
./pocketbase serve
```

访问：

- Admin UI：`http://127.0.0.1:8090/_/`
- API：`http://127.0.0.1:8090/api/`

## 首次配置

1. 启动后端。
2. 打开 PocketBase Admin UI：
   - Docker：`http://localhost:8090/_/`
   - 手动：`http://127.0.0.1:8090/_/`
3. 按页面提示创建 PocketBase 管理员账号。
4. 确认迁移已自动创建以下 collections：
   - `users`：内置 Auth 集合，扩展 `role` 字段。
   - `projects`：校对项目。
   - `project_files`：项目 PDF 文件。
   - `pages`：待校对/待审核条目。
5. 创建业务用户：
   - 普通注册入口创建的用户会被后端 hook 固定为 `proofreader`。
   - `admin` 和 `reviewer` 账号建议在 PocketBase Admin UI 中创建或修改 `users.role`。

不要手动修改已经执行过的迁移文件。如果需要调整 schema 或权限，请新增迁移文件。

## 网站使用指南

### 1. 登录与角色跳转

打开前端地址后进入登录页。

- 未登录用户只能访问登录页和注册页。
- 登录后系统会按角色自动跳转：
  - `admin` 跳转到管理员控制台。
  - `proofreader` 跳转到任务大厅。
  - `reviewer` 跳转到审核大厅。
- 如果访问了需要登录的页面，登录成功后会回到原页面。

### 2. 管理员：创建项目

1. 使用 `admin` 账号登录。
2. 进入“控制台”。
3. 点击“创建新项目”。
4. 填写项目名称和简介。
5. 创建成功后进入项目详情页。

项目详情页会显示：

- 总条目数。
- 已校对数量。
- 已审核通过数量。
- 审核进度。

### 3. 管理员：上传 PDF

1. 进入项目详情页。
2. 在“上传文件”区域选择 PDF 文件。
3. 点击“上传 PDF”。

PDF 用于校对员和审核员编辑时预览原文。当前系统不会自动 OCR；文本任务主要通过 CSV 导入。

### 4. 管理员：导入 CSV 任务

1. 准备 CSV 文件，必须包含 `PDF页码` 列。
2. 进入项目详情页。
3. 在“上传 CSV 文件”区域选择 CSV。
4. 点击“导入 CSV”。

导入规则：

- 每一行生成一条待校对任务。
- `PDF页码` 用于编辑器左侧 PDF 预览定位。
- 除 `PDF页码` 外的所有列都会作为结构化校对字段展示。
- 空内容行会被拒绝。
- 编码支持 `UTF-8`、`GB18030`、`GBK` 自动识别。

### 5. 管理员：管理待校对条目

项目详情页底部会展示文本条目列表。

可用操作：

- 勾选待校对条目。
- 输入范围选择，例如 `1-33` 或 `1,3,5-8`。
- 全选待校对条目。
- 批量下移所选条目。
- 批量删除所选条目。
- 单条上移或下移。

限制：

- 只有 `pending` 待校对条目可被选择、移动和删除。
- 删除后系统会自动重排条号。

### 6. 校对员：认领任务

1. 使用 `proofreader` 账号登录。
2. 进入“任务大厅”。
3. 在“全部待校对任务”中点击“认领任务”。
4. 认领后切换到“我的任务”，点击“进入校对”。

说明：

- 每位校对员最多同时接取 10 个活跃任务。
- 如果任务已被他人认领，系统会提示失败并刷新任务列表。

### 7. 校对员：编辑并提交

校对编辑页分为左右两栏：

- 左侧：项目 PDF 预览。
- 右侧：按 CSV 栏目生成的校对表格和 IPA 键盘。

操作流程：

1. 查看左侧 PDF 原文。
2. 在右侧表格中逐字段修订文本。
3. 点击 IPA 键盘插入特殊音标或字符。
4. 可用“上一条任务 / 下一条任务”在自己的活跃任务中切换。
5. 点击“提交校对”。

提交后任务状态变为 `proofread`，进入审核员的待审核列表。

### 8. 审核员：接取并审核任务

1. 使用 `reviewer` 账号登录。
2. 进入“审核大厅”。
3. 在“全部待审核任务”中点击“开始审核”。

进入审核页后：

- 如果任务仍是 `proofread`，系统会把它标记为 `reviewing` 并绑定当前审核员。
- 如果已被其他审核员占用，页面会提示无法操作。
- 审核员可直接修改校对后的结构化字段。

### 9. 审核员：通过或打回

审核页支持两种结果：

- “通过”：任务状态变为 `approved`。
- “打回修改”：任务状态变为 `rejected`，校对员可在“我的任务”中重新进入并提交。

审核员也最多同时接取 10 个审核中任务。

### 10. 管理员：导出校对结果

1. 进入项目详情页。
2. 点击“导出校对结果 CSV”。

导出规则：

- 按条号顺序导出。
- 优先导出审核/校对后的结构化字段。
- 如果没有校对结果，则回退到原始 OCR/CSV 内容。
- 导出的第一列为 `PDF页码`。

## CSV 文件格式

当前 CSV 必须包含表头，且必须包含 `PDF页码` 字段。其他字段名不限，会在校对编辑器中作为栏目展示。

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
| `PDF页码` | 是 | 正整数，用于定位 PDF 预览页 |
| 其他字段 | 至少一个非空 | 作为校对表格栏目导入 |

编码兼容：`UTF-8`、`GB18030`、`GBK`。

## 项目结构

```text
fangji-v2/
├── README.md
├── docker-compose.yml
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   └── pdfjs/                  # PDF.js 静态资源
│   └── src/
│       ├── components/             # 通用组件和编辑器组件
│       ├── composables/            # PDF、结构化行、任务导航复用逻辑
│       ├── constants/              # 页面状态、任务上限等常量
│       ├── lib/                    # PocketBase 客户端、CSV、diff 工具
│       ├── router/                 # Vue Router
│       ├── services/               # PocketBase 数据访问封装
│       ├── stores/                 # Pinia 状态
│       ├── utils/                  # 错误格式化等工具
│       └── views/                  # 登录、注册、管理员、校对员、审核员页面
└── backend/
    ├── Dockerfile
    ├── pb_hooks/                   # PocketBase hooks
    └── pb_migrations/              # PocketBase schema 和权限迁移
```

## 开发说明

### 技术栈

- 前端：Vue 3、Vite、Vue Router、Pinia
- 后端：PocketBase
- 样式：纯 CSS
- 部署：Docker Compose

### 前端分层

- `views/`：页面和交互流程。
- `services/`：集中封装 PocketBase collection 读写。
- `composables/`：可复用页面逻辑，例如 PDF 预览、结构化行编辑、上一条/下一条任务。
- `constants/pageStatus.js`：任务状态、状态标签、活跃任务集合和上限。
- `utils/pbErrors.js`：PocketBase 错误信息格式化。

### 状态流转

```text
pending
  -> claimed
  -> proofreading
  -> proofread
  -> reviewing
  -> approved

reviewing
  -> rejected
  -> proofreading
  -> proofread
```

后端 hooks 会校验关键并发场景：

- `pending -> claimed` 时任务必须仍为 `pending`。
- `proofread -> reviewing` 时任务必须仍为 `proofread`。
- 校对员和审核员活跃任务均限制为 10 个。

## 常见问题

### Docker Compose 启动后访问不到前端

请先检查容器状态：

```bash
docker compose ps
docker compose logs -f frontend
```

本项目 Docker 前端默认使用 `http://localhost:5250`。如果你访问 `5173`，那是手动本地开发模式的默认端口。

### 后端能启动，但没有业务数据表

确认 PocketBase 启动目录包含：

- `backend/pb_migrations/`
- `backend/pb_hooks/`

迁移只会执行一次。如果已用旧数据启动过，可在确认不需要旧数据后删除对应 `pb_data` volume，再重新启动。

### 注册后不是管理员

这是预期行为。公开注册会被后端 hook 固定为 `proofreader`，防止用户自行注册管理员或审核员。请在 PocketBase Admin UI 中创建或调整 `admin` / `reviewer` 用户。

### 任务大厅提示请求被 autocancelled

PocketBase JS SDK 默认会自动取消同 key 的并发请求。任务大厅的列表请求已经通过 `requestKey: null` 关闭自动取消。如果仍出现该错误，请确认前端容器已热更新，或重启：

```bash
docker compose restart frontend
```

### CSV 导入提示缺少 PDF页码

当前实现要求 CSV 必须包含 `PDF页码` 列。请检查表头是否完全匹配，推荐保存为 UTF-8 CSV。
