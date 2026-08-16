'use strict';
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, shell } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const Storage = require('./storage');
const collector = require('./collector');
const organizer = require('./organizer');

const store = new Storage(app.getPath('userData'));
let popupWin = null;
let settingsWin = null;
let playerWin = null;
let tray = null;

// 窗口存活检查（Electron 经典坑：窗口 close/destroy 后变量非 null 但 native 对象已销毁）
function winReady(w) { return w && !w.isDestroyed(); }
function ensurePopup() { if (!winReady(popupWin)) { popupWin = null; return createPopup(); } return popupWin; }
function ensureSettings() { if (!winReady(settingsWin)) { settingsWin = null; return createSettings(); } return settingsWin; }

const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

function createPopup() {
  const pinned = store.getConfig().alwaysOnTop !== false;
  popupWin = new BrowserWindow({
    width: 380, height: 560,
    frame: false, transparent: true, resizable: true,
    alwaysOnTop: pinned, skipTaskbar: true,
    show: false, webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  });
  popupWin.loadFile(path.join(RENDERER, 'popup', 'index.html'));
  popupWin.on('close', (e) => { if (!app.isQuiting) { e.preventDefault(); popupWin.hide(); } });
  return popupWin;
}

function createSettings() {
  settingsWin = new BrowserWindow({
    width: 920, height: 660, minWidth: 760, minHeight: 560,
    frame: true, show: false, center: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.loadFile(path.join(RENDERER, 'settings', 'index.html'));
  settingsWin.on('close', (e) => { if (!app.isQuiting) { e.preventDefault(); settingsWin.hide(); } });
  return settingsWin;
}

function showPopup() {
  ensurePopup().show();
  popupWin.focus();
}

// 悬浮窗显隐切换：供全局快捷键与托盘/渲染层复用
function togglePopup() {
  if (!winReady(popupWin)) { showPopup(); return; }
  if (popupWin.isVisible()) popupWin.hide();
  else showPopup();
}

// 打开应用内视频播放窗口
function openPlayer(opts) {
  const q = new URLSearchParams({
    url: opts.playUrl || '',
    title: opts.title || '',
    author: opts.author || '',
    thumb: opts.thumb || '',
    aweme: opts.awemeId || ''
  }).toString();
  const url = pathToFileURL(path.join(RENDERER, 'player', 'player.html')).href + '?' + q;
  if (winReady(playerWin)) { playerWin.loadURL(url); playerWin.show(); playerWin.focus(); return; }
  playerWin = new BrowserWindow({
    width: 420, height: 760,
    frame: false, transparent: true, resizable: true,
    alwaysOnTop: true, skipTaskbar: false,
    show: true, webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  });
  // 抖音 CDN 会校验 Referer / User-Agent，注入请求头避免 403
  const ses = playerWin.webContents.session;
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const u = details.url;
    // 对抖音 CDN 域名注入浏览器身份
    if (u && (u.includes('douyinvod.com') || u.includes('douyinpic.com') || u.includes('bytecdn.cn') || u.includes('bytedance.com'))) {
      details.requestHeaders['Referer'] = 'https://www.douyin.com/';
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    }
    cb({ requestHeaders: details.requestHeaders });
  });
  playerWin.loadURL(url);
  playerWin.on('close', (e) => { if (!app.isQuiting) { e.preventDefault(); playerWin.hide(); } });
}

function buildTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let img;
  try { img = nativeImage.createFromPath(iconPath); } catch (_) { img = nativeImage.createEmpty(); }
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.ico')) : img);
  const menu = Menu.buildFromTemplate([
    { label: '显示悬浮窗', click: () => showPopup() },
    { label: '打开设置', click: () => ensureSettings().show() },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  tray.setToolTip('抖音摸鱼收藏夹');
  tray.setContextMenu(menu);
  tray.on('click', showPopup);
  updateTrayTip();
}

/* ---------------- IPC ---------------- */
// 托盘提示：按配置附加今日观看数（trayCount 设置原本没有实现，这里补上）
function updateTrayTip() {
  if (!tray || tray.isDestroyed()) return;
  try {
    let tip = '抖音摸鱼收藏夹';
    if (store.getConfig().trayCount) {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const n = store.getWatch().filter((w) => (w.ts || 0) >= t0.getTime()).length;
      tip += ` · 今日 ${n}`;
    }
    tray.setToolTip(tip);
  } catch (_) {}
}
// 数据变更后广播给所有窗口（设置页采集/清空后悬浮窗即时刷新，不再显示旧数据）
function broadcastDataChanged() {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('data:changed');
  });
  updateTrayTip();
}

function registerIpc() {
  ipcMain.handle('cfg:get', () => store.getConfig());
  ipcMain.handle('cfg:set', (_, cfg) => {
    const prev = store.getConfig();
    const next = Object.assign(store.getConfig(), cfg);
    store.setConfig(next);
    // 应用快捷键
    try {
      globalShortcut.unregisterAll();
      // 与启动时一致：快捷键切换显隐，而不是只显示
      if (next.hotkey) globalShortcut.register(next.hotkey, () => togglePopup());
    } catch (_) {}
    // 主题变更实时广播给存活窗口（悬浮窗/播放窗是独立渲染进程）
    if (cfg && cfg.theme && cfg.theme !== prev.theme) {
      if (winReady(popupWin)) popupWin.webContents.send('ui:theme', cfg.theme);
      if (winReady(playerWin)) playerWin.webContents.send('ui:theme', cfg.theme);
    }
    return next;
  });

  ipcMain.handle('watch:get', () => store.getWatch());
  ipcMain.handle('fav:get', () => store.getFavorites());
  ipcMain.handle('folders:get', () => store.getFolders());
  ipcMain.handle('rules:get', () => store.getRules());
  ipcMain.handle('folders:save', (_, list) => store.setFolders(list));
  ipcMain.handle('rules:save', (_, list) => store.setRules(list));
  ipcMain.handle('fav:save', (_, list) => store.setFavorites(list));
  // 清空本机已采集的观看/收藏数据（不含设置与规则），用于排错或重新采集
  ipcMain.handle('data:clear', () => {
    store.setWatch([]); store.setFavorites([]);
    broadcastDataChanged();
    return { ok: true };
  });

  ipcMain.handle('collect', async () => {
    const r = await collector.collect(store, store.getConfig());
    if (r.ok) broadcastDataChanged();
    return r;
  });

  // 轻量检测 Cookie 是否有效（不写入数据）
  ipcMain.handle('account:check-cookie', async (_, cookie) => collector.checkCookie(cookie));

  // 播放进度 / 倍速 记忆
  ipcMain.handle('player:get-progress', (_, awemeId) => store.getProgress(awemeId));
  ipcMain.on('player:save-progress', (_, { awemeId, sec }) => { if (awemeId) store.setProgress(awemeId, sec); });
  ipcMain.handle('player:get-speed', () => store.getPlayerSpeed());
  ipcMain.handle('player:set-speed', (_, rate) => store.setPlayerSpeed(rate));

  ipcMain.handle('organize', (_, opt) => {
    const r = organizer.run(store.getFavorites(), store.getRules(), store.getFolders(), store.getWatch(), opt);
    if (opt && opt.apply) store.setFavorites(r.next);
    return { hits: r.hits, log: r.log, changed: r.changed };
  });

  ipcMain.on('window:toggle-popup', () => togglePopup());
  ipcMain.on('window:open-settings', () => ensureSettings().show());
  ipcMain.on('window:hide-popup', () => { if (winReady(popupWin)) popupWin.hide(); });
  // 悬浮窗置顶开关：立即生效并持久化到配置
  ipcMain.on('window:set-on-top', (_, on) => {
    const w = ensurePopup();
    w.setAlwaysOnTop(!!on);
    const cfg = store.getConfig(); cfg.alwaysOnTop = !!on; store.setConfig(cfg);
  });
  // 打开应用内播放窗口
  ipcMain.on('window:play', (_, opts) => openPlayer(opts || {}));
  // 用系统默认浏览器打开外链（仅允许 http/https，防止渲染层被注入任意协议）
  ipcMain.on('window:open-external', (_, url) => {
    try { if (url && /^https?:\/\//i.test(String(url))) shell.openExternal(String(url)); } catch (_) {}
  });
}

app.whenReady().then(() => {
  // 全局异常兜底：防止「Object has been destroyed」等未捕获异常弹出崩溃对话框
  process.on('uncaughtException', (err) => {
    console.error('[main uncaught]', err.message || err);
    // 不弹对话框、不退出——托盘模式下窗口销毁是正常操作
  });
  // 未处理的 Promise 拒绝同样兜底，避免 Electron 弹崩溃框
  process.on('unhandledRejection', (reason) => {
    console.error('[main unhandledRejection]', reason && (reason.message || reason));
  });

  registerIpc();
  buildTray();
  createPopup();
  if (!store.getConfig().startMinimized) showPopup();

  // 注册全局快捷键（Shift+D 显示/隐藏悬浮窗）
  const hk = store.getConfig().hotkey;
  try { if (hk) globalShortcut.register(hk, () => togglePopup()); } catch (_) {}

  // 应用内「退出应用」按钮：标记正在退出并真正退出
  ipcMain.on('app:quit', () => { app.isQuiting = true; app.quit(); });

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createPopup(); });
});

app.on('window-all-closed', () => { /* 保持托盘运行，不退出 */ });
app.on('before-quit', () => { globalShortcut.unregisterAll(); });
