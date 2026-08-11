# 贡献指南

感谢你参与方辑（Fangji v2）。本文件补充本仓库特有的开发和评审要求；组织级规则以 [e-dialect 贡献指南](https://github.com/e-dialect/.github/blob/main/CONTRIBUTING.md) 为准。

提交贡献前，请同时阅读：

- [e-dialect 社区行为准则](https://github.com/e-dialect/.github/blob/main/CODE_OF_CONDUCT.md)
- [个人贡献者许可协议（ICLA）](https://github.com/e-dialect/.github/blob/main/ICLA.md)
- [企业贡献者许可协议（CCLA）](https://github.com/e-dialect/.github/blob/main/CCLA.md)

## 开始之前

1. 搜索已有 issue 和 pull request，避免重复工作。
2. 在目标 issue 留言说明计划，并将其分配给自己；无法自行分配时请等待维护者确认。
3. 较大的改动先讨论范围、数据迁移和兼容策略，再开始实现。
4. 不要在 issue、日志、测试数据或提交中包含真实账号、token、生产数据等敏感信息。

## 分支与提交

- 从最新 `main` 创建分支；一个分支只处理一个可独立合并的问题。
- 推荐分支名：`feat/<summary>`、`fix/<summary>`、`docs/<summary>`、`ci/<summary>`、`chore/<summary>`。
- 提交信息使用 Conventional Commits，例如 `fix(auth): preserve session on transient errors`、`ci: add frontend checks`。
- 不提交构建产物、`.env`、PocketBase 数据目录或无关格式化改动。
- PR 已进入评审后不要随意重写历史；确需 rebase 或改写提交时，先在 PR 中说明并获得维护者确认，禁止强制覆盖共享分支。

## 本地开发与检查

前端：

```bash
cd frontend
npm ci
npm test --if-present
npm run build
```

Compose 与镜像：

```bash
docker compose config
docker compose build backend frontend
```

如果分支包含 Go 后端（存在 `backend/go.mod`），还需执行：

```bash
cd backend
go test ./...
```

涉及导入、权限、盲校、仲裁或迁移时，应运行相应集成测试，并使用临时数据目录，不能覆盖真实 `pb_data`。

## PocketBase 与数据迁移

- 不要修改已发布或可能已经执行的迁移；通过新的迁移文件演进 schema 和数据。
- migration、hook、前端字段读取和 API 权限必须在同一个 PR 中保持兼容。
- PR 描述需说明迁移前置条件、数据影响、回滚方式和验证结果。
- 测试文件上传或导入流程时使用最小化、可公开的 fixture，不提交真实语料。

## Pull Request 要求

PR 应当：

- 关联 issue，并清楚说明解决了什么、没有解决什么。
- 保持范围单一；后续工作应新建或关联 issue，而不是不断扩大当前 PR。
- 列出实际执行的验证命令和结果；未运行的检查要说明原因。
- 标明破坏性变更、数据迁移、部署配置或安全影响。
- UI/交互变化提供截图或短视频，并覆盖错误、空状态等关键路径。
- 响应 review；阻断意见未解决前不要请求合并。

## 当前合并政策

仓库当前无法依赖分支保护强制 required checks，因此由维护者执行人工门禁：

1. PR 必须基于当前目标分支，所有可用 checks 通过。
2. `REQUEST_CHANGES` 和未解决的阻断讨论必须先处理。
3. 合并前确认测试、迁移和回滚说明足够，且没有意外的无关改动。
4. 默认由维护者使用 **Squash and merge**，保持 `main` 每个 PR 一个清晰提交。
5. 紧急绕过必须在 PR 中记录原因，并创建后续修复 issue。

贡献者不要自行启用 auto-merge，也不要直接推送到 `main`。
