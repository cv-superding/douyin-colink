'use strict';
/**
 * 本地存储层：所有数据以 JSON 存于 userData/colink/，与 words-fish 的
 * 「词库只读 / 记录可写」思路一致——这里是完全本地、用户私有。
 */
const fs = require('fs');
const path = require('path');

class Storage {
  constructor(userData) {
    this.dir = path.join(userData, 'colink');
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    this._cache = {};
  }

  _file(name) { return path.join(this.dir, name + '.json'); }

  read(name, fallback) {
    try {
      const raw = fs.readFileSync(this._file(name), 'utf-8');
      return JSON.parse(raw);
    } catch (_) {
      return fallback !== undefined ? fallback : null;
    }
  }

  write(name, data) {
    fs.writeFileSync(this._file(name), JSON.stringify(data, null, 2), 'utf-8');
    this._cache[name] = data;
    return data;
  }

  // 便捷访问器
  getConfig() {
    return this.read('config', {
      theme: 'light',
      hotkey: 'Shift+D',
      autoOrganize: false,
      collectMode: 'demo', // 'demo' | 'real'
      cookie: '',
      dedupe: true,
      startMinimized: true,
      trayCount: true,
      alwaysOnTop: true
    });
  }
  setConfig(cfg) { return this.write('config', cfg); }

  getWatch() { return this.read('watch', []); }
  setWatch(list) { return this.write('watch', list); }

  getFavorites() { return this.read('favorites', []); }
  setFavorites(list) { return this.write('favorites', list); }

  getFolders() { return this.read('folders', [{ id: 'all', name: '全部收藏', parentId: null }, { id: 'uncat', name: '未分类', parentId: null }]); }
  setFolders(list) { return this.write('folders', list); }

  getRules() { return this.read('rules', []); }
  setRules(list) { return this.write('rules', list); }

  // 播放器记忆：按 awemeId 存播放进度；全局存上次倍速
  getPlayer() { return this.read('player', { positions: {}, speed: 1 }); }
  savePlayer(p) { return this.write('player', p); }
  getProgress(awemeId) {
    const p = this.getPlayer();
    return (p.positions && p.positions[awemeId]) || 0;
  }
  setProgress(awemeId, sec) {
    if (!awemeId) return;
    const p = this.getPlayer();
    p.positions = p.positions || {};
    p.positions[awemeId] = Math.max(0, Math.floor(sec || 0));
    this.savePlayer(p);
  }
  getPlayerSpeed() { return (this.getPlayer().speed) || 1; }
  setPlayerSpeed(rate) { const p = this.getPlayer(); p.speed = rate; this.savePlayer(p); }
}

module.exports = Storage;
