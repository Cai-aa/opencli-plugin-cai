# opencli-plugin-cai — OpenCLI Plugin for CAI's Workflow

> OpenCLI 适配器合集：Obsidian 笔记管理、GitHub Trending、学术搜索

## 安装

```bash
opencli plugin install github:去飞GoFly/opencli-plugin-cai
```

## 命令

### Obsidian 笔记管理（`myvault`）

Obsidian 仓库：`~/Data/Obsidian/CAIVault/`

```bash
# 搜索笔记
opencli myvault search "颤振" --limit 10

# 阅读笔记
opencli myvault read "11.01 颤振预测"

# 最近笔记
opencli myvault recent --limit 5

# 所有标签
opencli myvault tags --limit 20

# 创建新笔记
opencli myvault new "我的新想法" "B-科研笔记/我的想法"
```

### GitHub Trending（`github-trending`）

```bash
# 全语言 trending（最近7天，按 stars 排序）
opencli github-trending trending --limit 10

# 指定语言
opencli github-trending trending rust --limit 10
opencli github-trending trending python --limit 10
opencli github-trending trending typescript --limit 10
opencli github-trending trending go --limit 10
```

## 技术说明

- **myvault**：TypeScript 适配器，直接读写文件系统，无需 API Key
- **github-trending**：YAML 适配器，使用 GitHub public API，无需认证（限速 60 req/hr）
- **arxiv**：使用内置适配器 `opencli arxiv search <query>`

## 本地开发

```bash
# 编辑适配器
code ~/opencli/plugins/obsidian/

# 查看命令列表
opencli list | grep -E "myvault|github-trending"
```
