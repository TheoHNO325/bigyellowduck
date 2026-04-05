# 大黄鸭外传 · 投稿与协作

本站外传列表页路径：`/waizhuan/`（源码为 `source/waizhuan/index.md`）。合作者只需在本仓库中**新增一篇 Hexo 文章（Markdown）并提交合并**，无需改主题代码。

## 写作约定

1. **标签**：文章 front matter 的 `tags` 中**必须包含 `外传`**，且**不要**加 `大黄鸭`（否则该文会进入正传章节目录）。
2. **板块**：在 front matter 中设置 `waizhuan_section`，例如 `日常向`、`严肃向`。**相同字符串**的稿件会在列表页归为同一板块；不写则归入「未分板块」。
3. **署名**：可选 `author_display: 笔名`，会显示在列表卡片与文末。
4. **正文**：在 Markdown 中正常撰写即可。若希望外传列表卡片显示摘要，可在文中插入 `<!-- more -->`，其上方内容为摘要；也可在 front matter 中设置 `excerpt:`。
5. **文件名（推荐）**：外传稿请使用 `0x01-你的slug.md`、`0x02-…` 形式（两位序号顺排，可与 Hexo 默认生成的日期前缀脱钩）；**勿**在文件名里混用正传章节所用的 `NN-dahuangya` 模式。

## 用脚手架新建（推荐）

在站点根目录（含 `_config.yml` 的 `hexo-blog` 目录）执行：

```bash
npx hexo new waizhuan "你的外传标题"
```

会在 `source/_posts/` 下生成带默认 front matter 的文件，按需修改 `waizhuan_section`、`author_display` 与正文后提交。若生成的文件名带日期前缀，可改为 `0xNN-简称.md` 以与站内涵例一致。

## 或手动复制

复制任意一篇 `_posts` 下的 `.md`，修改 `title`、`date`、`tags`（保留 `外传`）、`waizhuan_section` 等字段即可。

## 提交与发布

1. Fork 本仓库（若你尚无写权限），新建分支。
2. 提交你的 `.md` 文件，发起 Pull Request。
3. 维护者合并后，由现有 CI / 部署流程执行 `hexo generate` 即可上线。

若仓库在 GitHub 上的根目录不是 `hexo-blog`，请将其中命令里的路径按实际结构调整（始终以含 Hexo `package.json` 的目录为准）。
