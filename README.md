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

## 快速开始

### 1. 启动后端 (PocketBase)

```bash
# 下载 PocketBase: https://pocketbase.io/docs/
# 将 pocketbase 二进制文件放到 backend/ 目录下

cd backend
./pocketbase serve
```

PocketBase 默认运行在 `http://127.0.0.1:8090`。

**首次设置（重要）**：

1. 访问 `http://127.0.0.1:8090/_/` 创建管理员账号
2. 在 Admin UI 创建以下 Collections：
   - `users`（扩展内置 Auth 集合，添加 `name: text` 和 `role: select[admin,proofreader,reviewer]` 字段）
   - `projects`（name, description, admin→users）
   - `project_files`（project→projects, file, original_filename, status）
   - `pages`（project, project_file, page_number, image, ocr_text, proofread_text, status, proofreader→users, reviewer→users, proofread_at, reviewed_at）
3. 按照 `backend/pb_hooks/main.pb.js` 中的注释，为每个 Collection 设置访问规则

### 2. 启动前端

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

前端运行在 `http://localhost:5173`。

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
3. **任务大厅**：校对员认领待校对页面
4. **在线校对编辑器**：
   - 左栏：PDF 原始扫描图
   - 右栏：可编辑文本 + IPA 虚拟键盘
5. **IPA 键盘**：支持莆仙方言默认皮肤，包含：
   - 国际音标辅音、元音、鼻化符号
   - 数字上标（⁰¹²³⁴⁵⁶⁷⁸）
   - 大词典拼音方案（ü ñ ệ ẹ ê ô）
   - 平话字 BUC（大小写完整集）
6. **审核流程**：高亮显示修改差异、通过/打回

### CSV 文件格式

上传 CSV 时，文件必须包含以下列：

| 列名 | 说明 |
|------|------|
| `page_number` | 页码（整数） |
| `ocr_text` | OCR 识别文本 |

示例：
```csv
page_number,ocr_text
1,第一页的文字内容...
2,第二页的文字内容...
```

## 技术栈

- **前端**：Vue 3 + Vite + Vue Router + Pinia
- **后端**：PocketBase (Go)
- **样式**：纯 CSS（无框架依赖）
