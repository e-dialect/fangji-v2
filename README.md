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

### Docker Compose 开发模式

推荐本地开发使用。需要先安装 Docker Desktop 或 Docker Engine + Compose Plugin。

```bash
docker compose up --build
```

启动后访问：

- 前端：`http://localhost:5250`
- PocketBase Admin UI：`http://localhost:8090/_/`
- PocketBase API：`http://localhost:8090/api/`

常用命令：

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f frontend
docker compose logs -f backend
docker compose down
```

说明：

- Docker 前端开发端口使用 `5250`，配置在 [docker-compose.yml](docker-compose.yml)。
- PocketBase 数据通过 Docker volume `pb_data` 持久化，重建容器不会清空数据库和上传文件。
- 前端代码挂载到容器内，支持热更新。

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

构建产物位于 `frontend/dist/`。`VITE_PB_URL` 会在构建时写入前端包，部署到不同环境前请设置正确的后端地址。

## 首次配置

1. 启动 PocketBase。
2. 打开 PocketBase Admin UI：
   - Docker：`http://localhost:8090/_/`
   - 手动：`http://127.0.0.1:8090/_/`
3. 按页面提示创建 PocketBase 管理员账号。
4. 确认迁移自动创建或更新以下 collections：
   - `users`：内置 Auth 集合，扩展 `role` 字段，当前有效角色为 `admin`、`proofreader`。
   - `projects`：校对项目。
   - `project_files`：项目 PDF 文件。
   - `pages`：待校对条目与两轮校对结果。
5. 创建业务用户：
   - 公开注册入口创建的用户会被后端 hook 固定为 `proofreader`。
   - `admin` 用户建议在 PocketBase Admin UI 中创建或修改 `users.role`。

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
├── docker-compose.yml
├── frontend/
│   ├── Dockerfile
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

本项目 Docker 开发模式前端地址是 `http://localhost:5250`。如果访问 `5173`，那是手动本地开发的默认端口。

可先检查容器状态和日志：

```bash
docker compose ps
docker compose logs -f frontend
```

### 后端启动后没有业务表

确认 PocketBase 启动目录包含：

- `backend/pb_migrations/`
- `backend/pb_hooks/`

迁移只会执行一次。如果已用旧数据启动过，并确认不需要旧数据，可删除对应 `pb_data` volume 后重新启动。

### 注册后不是管理员

这是预期行为。公开注册用户会被后端 hook 固定为 `proofreader`。管理员账号请在 PocketBase Admin UI 中创建或修改 `users.role`。

### CSV 导入提示缺少 PDF页码

请确认表头字段完全为 `PDF页码`，并且不要写成 `PDF 页码`、`pdf_page` 或其他形式。推荐保存为 UTF-8 CSV。

### 二校项目显示暂无可处理

二校必须由不同于一校的校对员完成。如果项目中剩余待二校条目都是你一校过的，需要另一位校对员接取。

### 上传 PDF 后没有自动生成校对条目

当前实现中 PDF 只用于原文预览。请通过 CSV 导入待校对文本条目。
