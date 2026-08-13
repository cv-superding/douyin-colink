# 🎬 抖音摸鱼收藏夹 (Douyin CoLink)

<p align="center">
  <strong>本地优先的抖音「观看记录 + 收藏夹」采集、筛选与自动归类悬浮窗工具</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-blue?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/Platform-Windows-green?logo=windows" alt="Platform" />
  <img src="https://img.shields.io/badge/License-Apache--2.0-orange" alt="License" />
  <img src="https://img.shields.io/badge/Version-1.0.0-brightgreen" alt="Version" />
</p>

---

## ✨ 功能概览

| 模块 | 功能 | 说明 |
|------|------|------|
| 🖥️ **悬浮窗** | 无边框透明置顶窗口 | 支持拖拽移动、右下角缩放手柄、全局快捷键呼出（默认 `Shift+D`）、系统托盘最小化 |
| 📺 **观看记录** | 多级级联筛选 | 按 **年 / 月 / 日 / 时段** 四级筛选，列表展示，支持导出 CSV |
| 📁 **收藏夹** | 按文件夹分组展示 | 药丸标签切换文件夹，按日期分组，支持**移动到其他文件夹** / 删除 |
| ▶️ **视频播放** | 应用内播放窗 | 点击收藏夹视频直接播放，支持**画质切换**（1080P/720P/540P/360P）、**倍速播放**（0.5×~2×）、**进度记忆** |
| 🤖 **自动整理** | 规则引擎 | 可视化规则编辑器：条件（关键词/作者/类型/时长/日期，AND 组合）+ 动作（移至文件夹 / 打标签 / 忽略），支持**预览命中 (dry-run)** 后执行 |
| 🔑 **真实采集** | 抖音 Web API | 通过 Cookie + X-Bogus 签名采集本人收藏夹和观看历史，数据存本机，不上云 |
| 🎨 **主题系统** | 5 套主题 | 浅色 / 深色 / 水墨 / 薄荷 / IDE，实时切换，与 [words-fish](https://github.com/cv-superding/words-fish) UI 风格完全对齐 |

## 📸 界面预览

### 悬浮窗主界面

悬浮窗包含三个 Tab 页：

- **📺 观看记录** — 年/月/日/时段四级筛选 + 统计卡片 + 列表
- **📁 收藏夹** — 文件夹药丸标签 + 缩略图 + 标题/作者/画质/来源 + 操作按钮
- **🤖 自动整理** — 规则列表 + 新增/编辑/预览/执行

### 设置页面

- **数据概览** — 统计卡片 + 观看热力图（GitHub 风格）
- **通用设置** — 采集模式切换
- **采集账号** — Cookie 粘贴（支持字符串 / JSON 数组自动转换）+ 一键检测有效性 + 清空本地数据
- **悬浮窗外观** — 5 套主题一键切换
- **全局快捷键** — 自定义呼出快捷键
- **自动整理规则** — CRUD 规则管理
- **关于** — 版本信息

### 播放器

- 420×760 无边框透明置顶窗口
- 鼠标悬浮显示标题/作者浮层（顶部渐隐）
- 底部控制栏：**倍速选择** + **画质选择**
- 自动恢复上次播放进度
- CDN Referer 注入（解决抖音视频 403 问题）

## 🏗️ 技术架构

```
douYin-colink/
├── main/                    # Electron 主进程
│   ├── index.js             # 窗口管理 / 托盘 / 快捷键 / IPC
│   ├── storage.js           # 本地 JSON 存储（userData/colink/）
│   ├── collector.js         # 数据采集层（demo + real 双模式）
│   ├── organizer.js         # 自动整理规则引擎
│   └── xbogus.js            # 抖音 X-Bogus 签名器（离线）
├── preload/
│   └── preload.js           # contextBridge 安全桥（window.dy API）
├── renderer/                # 渲染进程（零依赖原生 HTML/CSS/JS）
│   ├── shared.css           # 全局样式 + 5 套主题 token + 组件库
│   ├── popup/               # 悬浮窗主页
│   │   ├── index.html       # 悬浮窗 DOM 结构
│   │   └── popup.js         # Tab 切换 / 筛选 / 列表渲染 / 操作
│   ├── settings/            # 设置页
│   │   ├── index.html       # 设置页 DOM（侧边栏导航 + 多页面）
│   │   └── settings.js      # 各页面逻辑 / 热力图 / 规则编辑器
│   └── player/              # 视频播放窗
│       ├── player.html      # 播放器 DOM + 画质/倍速控制条
│       └── player.js        # 视频加载 / 进度记忆 / 画质切换 / 错误诊断
├── assets/                  # 应用图标（ico + png）
├── package.json             # 项目配置 + 构建脚本
└── make-icon.js             # 图标生成脚本
```

### 技术栈

| 层面 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | [Electron](https://www.electronjs.org/) 33.4.11 | 跨平台桌面应用 |
| 打包工具 | [electron-builder](https://www.electronjs.org/electron-builder) 25.1.8 | `dir` + `zip` 双 target |
| 渲染层 | **零依赖原生 HTML/CSS/JS** | 无 React/Vue，轻量快速 |
| UI 设计 | CSS 变量主题系统 | 5 套主题，`[data-theme]` 切换 |
| 安全模型 | contextIsolation + contextBridge | 渲染进程无 Node 权限 |
| 数据签名 | X-Bogus（抖音专用） | 内嵌签名器，离线可用 |
| 数据存储 | 本地 JSON 文件 | userData 目录，不上云 |

### IPC 通信协议

```
渲染进程 (window.dy)          主进程 (ipcMain)
─────────────────────        ─────────────────────
play(opts)              →    window:play          打开播放窗
openExternal(url)       →    window:open-external  系统浏览器打开
checkCookie(cookie)     →    account:check-cookie  检测 Cookie 有效性
getProgress(id)         ←→   player:get-progress   获取/保存播放进度
saveProgress(id, sec)   ←→   player:save-progress
getSpeed() / setSpeed(s) ←→ player:get/set-speed   获取/设置倍速
clearData()             →    data:clear            清空本地数据
onTheme(cb)            ←    ui:theme             主题变更广播
getConfig() / saveCfg() ←→   cfg:get / cfg:set     读写配置
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **Windows** 10/11（桌面环境，需显示器）
- （可选）代理：如果网络需要，确保 `http_proxy` 配置正确

### 安装与运行

```bash
# 1. 克隆仓库
git clone https://github.com/cv-superding/douyin-colink.git
cd douyin-colink

# 2. 安装依赖
npm install

# 3. 启动开发模式
npm start
```

> ⚠️ **沙箱环境注意**：如果遇到 `NODE_OPTIONS=--use-system-ca` 导致 Electron 无法启动，请先清除该环境变量：
> ```bash
> # Windows CMD
> set NODE_OPTIONS=
> npm start
> ```

### 打包分发

```bash
# Windows：构建 dir + zip（推荐）
npm run dist

# Windows：仅构建 dir（不打包 zip）
npm run pack

# macOS：构建 dmg + dir（在 macOS 上运行）
npm run dist:mac

# Linux：构建 AppImage + deb（在 Linux 上运行）
npm run dist:linux
```

输出文件位于 `dist/` 目录：
- Windows：`抖音摸鱼收藏夹-1.0.0-win.zip` — 解压即用的完整应用（约 111MB，含 ffmpeg.dll）
- macOS：`dist/mac/{抖音摸鱼收藏夹.app, .dmg}`
- Linux：`dist/{抖音摸鱼收藏夹.AppImage, .deb}`

> 💡 Electron 无法在单一操作系统上交叉编译其他平台的签名安装包（如 Windows 上不能直接产出可用的 macOS `.dmg`）。请在**目标平台**对应的系统上运行对应的 `dist:*` 脚本。

## 📖 使用指南

### 1. 演示模式（开箱即用）

首次启动默认为**演示模式**，自动生成模拟数据，无需任何配置即可体验全部功能：
- 360 条模拟观看记录
- 5 个模拟收藏夹，含若干视频
- 完整的筛选、整理、播放流程

### 2. 真实采集模式

1. 打开**设置页**（悬浮窗拖拽栏或托盘图标进入）
2. 切换**采集模式**为「真实采集」
3. **获取 Cookie**（二选一）：
   - 方式 A：浏览器登录 `douyin.com` → F12 → Network → 任选请求 → 复制 `Cookie` 请求头值
   - 方式 B：使用浏览器插件（如 EditThisCookie）导出 Cookie JSON 数组
4. 粘贴到 Cookie 输入框（JSON 格式会自动转换）
5. 点击 **「检测 Cookie」** 验证有效性
6. 点击 **「立即采集」**

### 3. 视频播放

- 收藏夹列表中点击 **▶** 按钮 → 弹出应用内播放窗
- 播放窗底部可切换**画质**（1080P/720P/540P/360P）和**倍速**（0.5×~2×）
- 下次打开同一视频**自动恢复进度**
- 若 CDN 播放失败，可点击 **「在浏览器打开」** 回退

### 4. 自动整理

1. 进入 **🤖 自动整理** Tab 或设置页的规则管理
2. 点击 **「+ 新增规则」**
3. 设定条件（支持多条件 AND 组合）：
   - 关键词匹配（标题包含）
   - 作者匹配
   - 类型筛选（video/image/live）
   - 时长范围
   - 日期范围
4. 设定动作：
   - 移动到指定收藏夹文件夹
   - 添加标签
   - 忽略（不参与后续规则）
5. 点击 **「预览命中」** 查看 dry-run 结果
6. 确认后点击 **「执行」**

## 🔧 核心模块说明

### 采集层 (`main/collector.js`)

双模式设计：

| 模式 | 数据源 | 用途 |
|------|--------|------|
| `demo` | 本地随机生成 | 开箱即用演示 |
| `real` | 抖音 Web API | 真实账号数据 |

**真实采集接口**：
- 收藏夹：`/aweme/v1/web/aweme/favorite/` — 带 cursor 分页，拉取全量
- 观看历史：`/aweme/v1/web/aweme/history/` — ⚠️ 当前返回 404（Web 端未开放稳定接口）

**X-Bogus 签名**：使用内嵌的抖音专用签名器（源自 [Gongziyu666/X-Bogus](https://github.com/Gongziyu666/X-Bogus) 的 Douyin 变体），魔数 `HNOJ@?RC`，完全离线运行。

**画质处理**：每条视频提取 `bit_rate[]` 全部码率档位，默认选最高（1080P），播放器可手动切换。

### 存储层 (`main/storage.js`)

基于 `app.getPath('userData')` 的 JSON 文件存储：

| 文件 | 内容 |
|------|------|
| `config.json` | 用户配置（采集模式、Cookie、主题、快捷键等） |
| `watch.json` | 观看记录数组 |
| `favorites.json` | 收藏夹数据（含文件夹定义 + 视频列表） |
| `rules.json` | 自动整理规则数组 |
| `player.json` | 播放进度 + 倍速偏好 |

### 规则引擎 (`main/organizer.js`)

```
规则 = {
  name: "规则名称",
  enabled: true,
  conditions: [
    { field: "title",   op: "contains", value: "Python" },
    { field: "author",  op: "equals",   value: "科技小张" }
  ],
  action: { type: "moveToFolder", target: "folder_id" }
}
```

条件字段：`title` / `author` / `type` / `duration` / `dateFrom` / `dateTo`
操作符：`contains` / `equals` / `startsWith` / `gt` / `lt`
动作类型：`moveToFolder` / `tag` / `ignore`

## 🎨 主题系统

通过 CSS 变量 + `[data-theme]` 属性实现，5 套主题即时切换：

| 主题 | `data-theme` | 特点 |
|------|-------------|------|
| 浅色 | `light` | 白底灰调，默认 |
| 深色 | `dark` | 深灰底，护眼 |
| 水墨 | `ink` | 米纸色调，文艺 |
| 薄荷 | `mint` | 薄荷绿，清新 |
| IDE | `ide` | VS Code 暗色，程序员风 |

主题 Token 与 [words-fish](https://github.com/cv-superding/words-fish) 完全一致（`--accent: #0f7b6c` 等），保证视觉统一。

## ⚠️ 已知限制

| 限制 | 原因 | 解决方案 |
|------|------|----------|
| 观看历史 404 | 抖音 Web 端未提供稳定的历史接口 | 目前仅 demo 兜底；未来考虑接入 App 私有接口 |
| Cookie 有效期 | 抖音 Cookie 会过期 | 过期后重新粘贴；提供一键检测功能 |
| IP 限流 | 数据中心 IP 可能被抖音限制 | 个人电脑 + 家庭网络一般无问题 |
| 跨平台支持 | 运行时依赖 Electron，本身跨平台；构建已配置 `win` / `mac` / `linux` 三端目标。macOS（需 `npm run dist:mac`）与 Linux（需 `npm run dist:linux`）尚未在当前环境实测，欢迎提交 Issue | 项目源码**无任何 `win32` 硬编码**，全部使用 Electron / Node 跨平台 API（窗口、托盘、路径、文件 IO） |

## 📦 依赖清单

### 生产依赖（零运行时依赖）

本项目渲染层**零依赖**，所有 UI 由原生 HTML/CSS/JS 实现。

### 开发依赖

| 包 | 版本 | 用途 |
|----|------|------|
| electron | ^33.0.0 | 桌面应用框架 |
| electron-builder | ^25.1.8 | 应用打包 |
| http-proxy-agent | ^7.0.2 | 采集时代理支持 |
| undici | *(已安装)* | HTTP 客户端（fetch polyfill） |

## 📄 许可证

[Apache License 2.0](LICENSE)

## 🙏 致谢

- [words-fish](https://github.com/cv-superding/words-fish) — UI 设计参考（主题系统 / 组件风格 / 交互理念）
- [Gongziyu666/X-Bogus](https://github.com/Gongziyu666/X-Bogus) — 抖音 X-Bogus 签名算法
- [Evil0ctal/Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API) — 抖音 API 参考
- [JoeanAmier/TikTokDownloader](https://github.com/JoeanAmier/TikTokDownloader) — 下载逻辑参考
- [tars1230/douyin-favorites-to-knowledge](https://github.com/tars1230/douyin-favorites-to-knowledge) — 收藏夹处理思路

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/cv-superding">cv-superding</a></sub>
</p>
