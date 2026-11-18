# istqb-cn-mock-exam

基于 React、TypeScript、Vite 的 CTFL 4.0.1 中文模拟考试网站。四套正式试卷共 160 题，A 卷附加练习 26 题。题库包含原文解析、学习目标、知识级别以及可放大的原题和解析截图。

网站：https://istqb.azhuquq.com

公开仓库：https://github.com/azhuquq/istqb-cn-mock-exam

## 本地运行

要求 Node.js 22.12+。本地工作目录暂保留 `istqb-mock-exam`，项目与远程仓库名称为 `istqb-cn-mock-exam`。

```sh
npm ci
npm run dev
```

```sh
npm run data:validate
npm test
npm run build
npm run preview
```

## 功能

- 按试卷、章节与错题逐题练习，提交后查看解析。
- A–D 原卷考试：40 题、60 分钟、26 分及格，多选题全对才得 1 分。
- 答题卡、标记待检查、自动保存、固定截止时间、超时结算。考试途中可确认放弃，舍弃本场作答与标记，不生成成绩或错题。
- 考试报告、章节表现、逐题回顾、考试历史与错题本。
- 手机及桌面布局；题图支持放大、横向滚动查看。
- 键盘操作：`1–5` 选择 `A–E`（多选题可连续选择、再次按键取消），`Enter` 提交练习答案，`← / →` 切换上一题／下一题。模拟考试中 `Enter` 切换当前题的待检查标记，考试报告支持左右切题。快捷键提示位于答题按钮下方，手机屏幕隐藏提示。输入框、选择框、弹窗和组合键不会触发答题快捷键，长按不会连续操作。
- “题库来源”提供 A–D 卷试题与答案解析共 8 份原始 PDF 下载。
- 无账号及后端。学习记录使用当前域名下的 localStorage（`istqb-study-v1`），不会跨设备同步。不同预览域名和正式域名的记录相互独立。

错题答对后仍保留，由用户手动移除。“题库说明与数据备份”页提供 LZ4 备份码的生成、复制、粘贴导入及记录清空功能。导入前显示备份摘要并确认替换；无效备份或保存失败时保留当前记录。

备份格式为 `ISTQB-LZ4-v1:<UTF-8字节数>:<CRC32>:<Base64 LZ4 frame>`，最多支持 8 MiB 原始学习记录。包含练习、错题、历史和进行中的考试；导入不会重置截止时间，过期考试自动结算。复制内容未加密，请妥善保存。导入器在解压前检查帧边界和输出长度，解压后校验 CRC32 与记录结构。自动复制不可用时会选中备份码，支持手动复制。

## 题库维护

题库文字与裁图位于 `public/data/questions.json`、`public/questions/`。8 份原始 PDF 位于 [`public/sources/`](public/sources/)，保留原始中文文件名，页面通过同域名链接下载。部署无需 Python 或本机课程目录。来源文件名与 SHA-256 保存在 JSON 的 `sources` 中，构建前校验每份 PDF 的完整性。

重新导入需要 Python 3、Poppler（`pdftotext`、`pdftoppm`）与 ImageMagick（`magick`）：

```sh
python scripts/import-pdfs.py --source-dir '/path/to/the/eight/pdfs'
npm run data:validate
npm test
```

导入脚本会把试题及答案解析的原始 PDF 同步到 `public/sources/`。导入依据 PDF 的文字坐标识别题目与选项，使用参考答案表匹配答案、章节和知识级别，并对 D 卷重复部分去重。复杂题干保留原图。修改导入逻辑后必须核对跨页题、多选题、图表和解析，不能仅凭题量校验认定内容正确。

## Vercel

GitHub 仓库已连接 Vercel 项目。推送 `main` 自动部署生产站，其他分支生成预览。

`vercel.json` 已配置 Vite 构建与 SPA 路由。构建先校验题库再执行 TypeScript 检查及生产打包；输出目录为 `dist`。

```sh
vercel link --project istqb-cn-mock-exam --scope azhuquqs-projects
vercel deploy --scope azhuquqs-projects
vercel deploy --prod --scope azhuquqs-projects
```

生产域名：`istqb.azhuquq.com`。按 Vercel 返回的要求配置域名 DNS。`.vercel/`、凭证和构建缓存不进入源代码；8 份公开下载 PDF 随仓库和网站发布。

## 来源

题目及解析版权属于 ISTQB®／CSTQB® 及原作者；中文翻译、编辑和出版由 CSTQB 负责。本站为非官方、非商业学习工具。原题与解析中的表述按提供文件保留，题目页面可对照源文件截图。
