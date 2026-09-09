# 服务端分页与聚合验收

2026-09-09，#11。基于 PocketBase 当前版升级 PR #82；合并顺序为 #79 → #82 → 本 PR。

## 行为和边界

- 管理员列表使用 `/api/fangji/projects/:id/pages`，支持状态、字面关键词、PDF 起止页，
  返回当前页、精确筛选总数、完整项目状态计数。每页最多 100 条，按 page_number、id 稳定排序。
- 单次响应的计数和数据在同一事务内读取。并发新增/删除不提供跨请求快照，刷新后按新列表显示；
  删除导致请求页越界时回退到末页。前端忽略过时请求，筛选变更回到第一页。
- 全局范围选择、全选和重新排序保持原来的完整条号语义；仅在主动执行这些操作时
  读取 id/status/page_number，不下载全部正文。完整 CSV 导出仍是显式全量操作。
- 任务大厅每页默认 12、最多 50 个项目，按我的进行中、可领取、名称和 id 排序。
  数据库聚合总数及全局概况，只有当前页项目回到浏览器；不会公开轮次或其他人的结果。
  已提交过的当前轮任务、其他人未过期租约不可领取，租约过期后恢复可领取。
- 校对统计在主分支已有数据库聚合，本次保持该实现。

## 代表性测量

本机 Apple Silicon，Go 1.27 / Chrome，1 万条合成记录，每条包含重复的汉字、IPA 和扩展汉字。
单次测量用于揭示数量级，不代表生产 SLA。旧页面使用 origin/main，新页面使用本分支，同一个临时后端和数据。

| 指标 | 旧实现 | 新实现 |
| --- | ---: | ---: |
| 队列计算 | 649 ms | 80 ms |
| Go 分配字节 | 332,365,120 | 58,984 |
| Go 分配次数 | 4,563,719 | 91 |
| 队列查询数（单项目） | 10,001 | 2 |
| 管理页首次可用 | 1,728 ms | 296 ms |
| 条目请求数 | 20 | 1 |
| 条目响应体字节（解压后） | 19,968,073 | 49,951 |
| GC 后浏览器 JS heap | 23,429,512 | 5,991,196 |

Go 分配量不是服务进程峰值 RSS；浏览器 heap 不包含全部渲染器/网络内存。
数据库仍需扫描相关项目的索引记录，聚合不是恒定时间查询。
EXPLAIN QUERY PLAN 确认使用 membership(user,role,project)、pages(project,status,page_number,id)、
新 attempts(page,round,kind,proofreader) 和已有 lease(page) 索引。

## 可重复验证

```sh
go test -C backend ./...
go test -C backend -run '^$' -bench BenchmarkQueueAggregation -benchtime=1x -benchmem -v
python3 backend/tests/run_integration.py proofreading_quorum_integration.mjs
npm test --prefix frontend
npm run build --prefix frontend
```

浏览器脚本为 `frontend/scripts/test-pagination.cjs`，需要 Playwright/Chrome，
PB_URL、APP_ADMIN_EMAIL/PASSWORD、FANGJI_TEST_DATA_DIR 必须指向同一个自动清理的临时后端。
FRONTEND_URL 为新页面地址，可选 BASELINE_FRONTEND_URL 为原页面地址。
脚本明确向临时数据库填充合成数据，验证初始单页请求、下一页、关键词筛选和无页面异常，
输出指标与 `/tmp/fangji-server-pagination.png`。
