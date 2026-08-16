'use strict';
/**
 * 安全桥（contextIsolation 开启）。仅向渲染层暴露白名单能力，
 * 与 words-fish 的 wfPopup/wfBubble/wfSettings 三桥思路一致。
 */
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  cfg: {
    get: () => ipcRenderer.invoke('cfg:get'),
    set: (cfg) => ipcRenderer.invoke('cfg:set', cfg)
  },
  watch: {
    get: () => ipcRenderer.invoke('watch:get')
  },
  fav: {
    get: () => ipcRenderer.invoke('fav:get'),
    save: (list) => ipcRenderer.invoke('fav:save', list)
  },
  folders: {
    get: () => ipcRenderer.invoke('folders:get'),
    save: (list) => ipcRenderer.invoke('folders:save', list)
  },
  rules: {
    get: () => ipcRenderer.invoke('rules:get'),
    save: (list) => ipcRenderer.invoke('rules:save', list)
  },
  collect: () => ipcRenderer.invoke('collect'),
  clearData: () => ipcRenderer.invoke('data:clear'),
  organize: (opt) => ipcRenderer.invoke('organize', opt),
  checkCookie: (cookie) => ipcRenderer.invoke('account:check-cookie', cookie),
  getProgress: (awemeId) => ipcRenderer.invoke('player:get-progress', awemeId),
  saveProgress: (awemeId, sec) => ipcRenderer.send('player:save-progress', { awemeId, sec }),
  getSpeed: () => ipcRenderer.invoke('player:get-speed'),
  setSpeed: (rate) => ipcRenderer.invoke('player:set-speed', rate),
  openSettings: () => ipcRenderer.send('window:open-settings'),
  hidePopup: () => ipcRenderer.send('window:hide-popup'),
  togglePopup: () => ipcRenderer.send('window:toggle-popup'),
  setAlwaysOnTop: (on) => ipcRenderer.send('window:set-on-top', on),
  // 主进程广播的主题变更（如设置页切换主题时实时同步到本窗口）
  onTheme: (cb) => ipcRenderer.on('ui:theme', (_, t) => cb(t)),
  // 主进程广播的数据变更（设置页采集/清空后各窗口即时刷新）
  onDataChanged: (cb) => ipcRenderer.on('data:changed', () => cb()),
  play: (opts) => ipcRenderer.send('window:play', opts),
  openExternal: (url) => ipcRenderer.send('window:open-external', url),
  quit: () => ipcRenderer.send('app:quit')
};

contextBridge.exposeInMainWorld('dy', api);
