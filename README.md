# words

把**你自己的单词表**变成一个会按遗忘曲线复习的背单词 App。

纯前端、零构建、离线可用。数据全部存在浏览器本地，不经过任何服务器。

**[→ 在线使用](https://shichen-nh.github.io/words-app/)**

<img src="icons/icon-192.png" width="88" alt="words icon">

---

## 它解决什么问题

市面上背单词 App 的词库都是它给你的。可你手上有一份自己的 Word 或 PDF 单词表——雅思考点词、专业课术语、老师发的词表——**没有工具能直接背它**。

words 做的事：

```
导入自己的文档 → 自动识别 单词 / 音标 / 词性 / 中文 → 按遗忘曲线安排复习 → 每天打卡
```

## 功能

| 模块 | 说明 |
|---|---|
| **导入** | `.docx` / `.pdf` / `.txt`，自动识别四要素，支持 Word 表格 |
| **校对** | 导入后先确认再入库，识别不确定的行标黄，可逐条编辑 / 删除 |
| **背词** | 先只给单词 + 音标，点击卡片才显示释义，底部「会了 / 不认识」 |
| **遗忘曲线** | 9 个阶段，答错当天重排，已掌握自动退出队列 |
| **每日任务** | 到期复习 + 自定义新词量，新词**只从没学过的词里随机抽** |
| **打卡** | 连续天数、累计天数、本月日历、按天数分级的鼓励语 |
| **统计** | 120 天热力图、未来 7 天复习预测、正确率 |
| **其他** | 撤销、收藏、左右滑手势、TTS 发音、深色模式、JSON 备份 |

## 技术栈

| 层 | 实现 |
|---|---|
| 界面 | 原生 HTML + CSS + ES Modules，**无框架、无构建步骤** |
| 存储 | IndexedDB（5 张表：deck / word / review_log / check_in / settings） |
| docx 解析 | `DecompressionStream` 手写 ZIP 解压 + `DOMParser` 遍历 `document.xml` |
| pdf 解析 | pdf.js 3.11（含 168 个 CJK CMap，支持中文 PDF） |
| 离线 | Service Worker，缓存优先 + 后台更新 |
| 部署 | GitHub Pages（静态托管） |

## 目录

```
words-app/
├── index.html              入口
├── manifest.webmanifest     PWA 配置
├── sw.js                    离线缓存
├── css/app.css              全部样式（含深色模式）
├── js/
│   ├── app.js               主控：路由、学习会话、导入流程、事件
│   ├── db.js                IndexedDB 封装与仓储函数
│   ├── sched.js             遗忘曲线、每日队列、打卡计算
│   ├── parser.js            docx / pdf / txt 解析
│   ├── views.js             所有页面 HTML
│   └── encourage.js         鼓励语库
├── lib/                     pdf.js 3.11 + cmaps
└── icons/                   白底大写 W 图标（5 档尺寸）
```

## 本地运行

不需要 `npm install`，任何静态服务器都行：

```bash
python -m http.server 8765
# 打开 http://127.0.0.1:8765
```

> 注意：`file://` 直接打开不行，ES Modules 和 IndexedDB 都要求 http(s) 环境。

## 复习算法

```js
intervals = [0, 1, 2, 4, 7, 15, 30, 60, 120]   // 天，索引 = stage
```

- **会了**：`stage += 1`，下次 = 今天 0 点 + `intervals[stage]` 天
- **不认识**：`stage = max(1, floor(stage / 2))`，5 分钟后在今天的队列里再出现一次；同一个词一天最多重排 2 次，第 3 次直接排到明天
- **已掌握**：`stage` 走到 8 且连续答对 3 次，退出复习队列
- **逾期**：不补作业，只按「逾期最久优先」排进今天的队列，一次出现就重新算

## 数据

- 全部存在**浏览器本地**（IndexedDB），不上传任何地方
- 换浏览器 / 清缓存 = 数据没了，建议偶尔用「我的 → 导出备份」

## 已知边界

- 扫描图片版 PDF 不支持（没有 OCR）
- 没有云同步 / 多设备
- 发音用系统 TTS，效果取决于设备语音包

## 许可

[MIT](LICENSE)
