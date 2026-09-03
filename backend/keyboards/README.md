# 键盘定义格式

仓库内置键盘放在本目录，由 Go `embed` 打包进后端。后端启动时会先严格校验全部 JSON，再按 `id` 幂等同步到全局键盘库。

```json
{
  "schemaVersion": 1,
  "id": "example-keyboard",
  "name": "示例键盘",
  "description": "可选说明",
  "sections": [
    {
      "id": "common",
      "label": "常用字符",
      "defaultOpen": true,
      "keys": [
        { "value": "ŋ", "label": "ŋ", "hint": "可选按键说明" }
      ]
    }
  ]
}
```

- 当前仅接受 `schemaVersion: 1`，未知字段会导致启动失败。
- 键盘和分区 `id` 使用小写字母、数字和连字符；同一文件内分区 ID 不得重复。
- `value` 是实际插入的文本；`label` 留空时显示 `value`；`hint` 用于无障碍标签和悬浮说明。
- 删除仓库中的旧预置不会删除数据库记录，只会把它标记为停用，从而保留既有项目引用。
- 数据库预留 `origin` 与 `uploaded_by` 字段，后续上传自定义键盘时应复用完全相同的 JSON 校验器。
