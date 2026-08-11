'use strict';
/* 设置窗交互逻辑（原生 JS，零依赖） */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

let S = { cfg: null, watch: [], folders: [], rules: [] };

async function boot() {
  S.cfg = await window.dy.cfg.get();
  document.documentElement.setAttribute('data-theme', S.cfg.theme || 'light');
  [S.watch, S.folders, S.rules, S.favs] = await Promise.all([window.dy.watch.get(), window.dy.folders.get(), window.dy.rules.get(), window.dy.fav.get()]);
  bindNav(); bindWindow(); bindAppearance(); bindHotkey(); bindAccount(); bindGeneral(); bindRules();
  renderOverview(); setStatus('就绪');
}

/* ---------- 导航 ---------- */
function bindNav() {
  $$('.nav-item').forEach((n) => n.addEventListener('click', () => {
    $$('.nav-item').forEach((x) => x.classList.remove('active'));
    n.classList.add('active');
    $$('.page').forEach((p) => p.classList.remove('active'));
    $('#page-' + n.dataset.go).classList.add('active');
  }));
}
function bindWindow() {
  $('#btn-min').addEventListener('click', () => window.close());
  $('#btn-close').addEventListener('click', () => window.close());
  $('#btn-show-popup').addEventListener('click', () => window.close());
  $('#btn-quit').addEventListener('click', () => window.dy.quit());
}
function setStatus(t) { $('#status-line').textContent = t; }

/* ---------- 概览：统计 + 热力图 ---------- */
function renderOverview() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = S.watch.filter((w) => new Date(w.ts) >= today).length;
  const grid = $('#stat-grid'); grid.innerHTML = '';
  const stats = [
    ['累计观看', S.watch.length],
    ['今日观看', todayCount],
    ['收藏总数', (S.favs || []).length],
    ['规则数', S.rules.length]
  ];
  stats.forEach(([l, n]) => {
    const c = document.createElement('div'); c.className = 'stat-card';
    c.innerHTML = `<div class="num">${n}</div><div class="lbl">${l}</div>`; grid.appendChild(c);
  });
  buildHeatmap(S.watch);
}

function buildHeatmap(watch) {
  const heat = $('#heat'); heat.innerHTML = '';
  // 清除上一次（可能来自前一次 renderOverview）残留的月份标签行，避免重复堆叠
  const card = heat.closest('.card');
  if (card) { const old = card.querySelector('.heat-months'); if (old) old.remove(); }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weeks = 27, total = weeks * 7;
  const gridStart = new Date(today.getTime() - (total - 1) * DAY);
  const offset = gridStart.getDay();
  const realStart = new Date(gridStart.getTime() - offset * DAY);
  const map = {};
  watch.forEach((w) => { const d = new Date(w.ts); const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); map[k] = (map[k] || 0) + 1; });
  const max = Math.max(4, ...Object.values(map));
  const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const monthsEl = document.createElement('div'); monthsEl.className = 'heat-months'; monthsEl.style.cssText = 'display:flex;gap:3px;font-size:11px;color:var(--text-mute);margin-bottom:4px';
  let prev = -1;
  for (let wk = 0; wk < weeks; wk++) {
    const topDate = new Date(realStart.getTime() + (wk * 7) * DAY);
    const m = topDate.getMonth();
    const sp = document.createElement('span'); sp.style.cssText = 'width:13px;flex:0 0 13px';
    if (m !== prev) { sp.textContent = MONTHS[m]; prev = m; }
    monthsEl.appendChild(sp);
    for (let r = 0; r < 7; r++) {
      const d = new Date(realStart.getTime() + (wk * 7 + r) * DAY);
      const cell = document.createElement('div'); cell.className = 'heat-cell';
      if (d > today) { cell.style.opacity = '.2'; heat.appendChild(cell); continue; }
      const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      const c = map[k] || 0; const lv = c === 0 ? 0 : c < max * 0.25 ? 1 : c < max * 0.5 ? 2 : c < max * 0.75 ? 3 : 4;
      cell.classList.add('l' + lv);
      cell.dataset.tip = `${k} · 观看 ${c} 个`;
      heat.appendChild(cell);
    }
  }
  const wrap = heat.parentElement; wrap.parentElement.insertBefore(monthsEl, wrap);
}

/* ---------- 通用设置 ---------- */
function bindGeneral() {
  const card = $('#general-card');
  const rows = [
    ['startMinimized', '启动最小化到托盘', '开启后只显示托盘图标，不弹出悬浮窗。'],
    ['trayCount', '托盘显示今日计数', '在托盘悬浮提示里显示今日观看数。'],
    ['dedupe', '采集去重', '已存在的记录不再重复写入。']
  ];
  card.innerHTML = '';
  rows.forEach(([key, title, desc]) => {
    const row = document.createElement('div'); row.className = 'setting-row';
    row.innerHTML = `<div class="setting-info"><h3>${title}</h3><p>${desc}</p></div>`;
    const sw = document.createElement('label'); sw.className = 'switch';
    sw.innerHTML = `<input type="checkbox" ${S.cfg[key] ? 'checked' : ''}><span></span>`;
    sw.querySelector('input').addEventListener('change', (e) => { S.cfg[key] = e.target.checked; saveCfg(); });
    row.appendChild(sw); card.appendChild(row);
  });
}

/* ---------- 采集账号 ---------- */
// 兼容两种 Cookie 输入：① 原始 Cookie 字符串；② 浏览器 devtools 导出的 JSON 数组 [{name,value,...}]
function normalizeCookie(raw) {
  const s = (raw || '').trim();
  if (!s) return { value: '', json: false };
  if (!s.startsWith('[')) return { value: s, json: false };
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr) && arr.length && arr[0] && typeof arr[0] === 'object' && 'name' in arr[0] && 'value' in arr[0]) {
      return { value: arr.map((c) => `${c.name}=${c.value}`).join('; '), json: true };
    }
  } catch (_) {}
  return { value: s, json: false };
}
function showCookieHint(t) { const el = $('#cookie-hint'); if (el) { el.textContent = t; el.style.color = 'var(--accent)'; } }
function bindAccount() {
  $('#collectMode').value = S.cfg.collectMode || 'demo';
  $('#cookie').value = S.cfg.cookie || '';
  $('#collectMode').addEventListener('change', (e) => { S.cfg.collectMode = e.target.value; saveCfg(); });
  $('#cookie').addEventListener('change', (e) => {
    const n = normalizeCookie(e.target.value);
    if (n.json) { e.target.value = n.value; showCookieHint('已自动将浏览器导出的 Cookie JSON 转换为字符串 ✓'); }
    S.cfg.cookie = n.value; saveCfg();
  });
  $('#btn-collect').addEventListener('click', async () => {
    const n = normalizeCookie($('#cookie').value);
    if (n.json) { $('#cookie').value = n.value; showCookieHint('已自动转换 Cookie JSON ✓'); }
    S.cfg.cookie = n.value; await saveCfg();
    const b = $('#btn-collect'); b.classList.add('loading'); setStatus('采集中…');
    const r = await window.dy.collect();
    b.classList.remove('loading');
    if (r.ok) { S.watch = await window.dy.watch.get(); renderOverview(); setStatus(`采集完成（${r.mode === 'demo' ? '演示' : '真实'}）：收藏 ${r.favorites}` + (r.historyUnavailable ? '（观看历史抖音接口不可用，仅收藏夹）' : ` · 观看 ${r.watch}`)); }
    else setStatus('采集失败：' + (r.error || ''));
  });
  $('#btn-check-cookie').addEventListener('click', async () => {
    const n = normalizeCookie($('#cookie').value);
    if (n.json) { $('#cookie').value = n.value; showCookieHint('已自动转换 Cookie JSON ✓'); }
    S.cfg.cookie = n.value; await saveCfg();
    const cookie = n.value;
    const b = $('#btn-check-cookie'); const st = $('#cookie-status');
    b.classList.add('loading'); b.disabled = true; st.textContent = '检测中…'; st.style.color = 'var(--text-mute)';
    const r = await window.dy.checkCookie(cookie);
    b.classList.remove('loading'); b.disabled = false;
    st.textContent = (r.ok ? '✅ ' : '⚠️ ') + (r.message || (r.ok ? '有效' : '无效'));
    st.style.color = r.ok ? 'var(--accent)' : '#e0533d';
    setStatus(r.ok ? 'Cookie 有效' : 'Cookie 无效');
  });
  $('#btn-clear-data').addEventListener('click', async () => {
    if (!confirm('确定清空本机已采集的观看/收藏数据吗？\n（设置与整理规则不受影响，随后可重新采集）')) return;
    const b = $('#btn-clear-data'); b.classList.add('loading');
    await window.dy.clearData();
    S.watch = await window.dy.watch.get(); S.favs = await window.dy.fav.get();
    renderOverview();
    b.classList.remove('loading');
    setStatus('已清空本地数据，请重新采集');
  });
}

/* ---------- 外观主题 ---------- */
function bindAppearance() {
  const sw = $('#theme-switch');
  $$('.theme-dot', sw).forEach((d) => {
    if (d.dataset.theme === (S.cfg.theme || 'light')) d.classList.add('active'); else d.classList.remove('active');
    d.addEventListener('click', () => {
      $$('.theme-dot', sw).forEach((x) => x.classList.remove('active'));
      d.classList.add('active');
      document.documentElement.setAttribute('data-theme', d.dataset.theme);
      S.cfg.theme = d.dataset.theme; saveCfg();
    });
  });
}

/* ---------- 快捷键 ---------- */
function bindHotkey() {
  const inp = $('#hotkey'); inp.value = S.cfg.hotkey || 'Shift+D';
  inp.addEventListener('change', (e) => { S.cfg.hotkey = e.target.value.trim() || 'Shift+D'; saveCfg(); setStatus('快捷键已更新'); });
}

async function saveCfg() { await window.dy.cfg.set(S.cfg); }

/* ---------- 自动整理规则编辑器（FR4） ---------- */
function bindRules() { $('#btn-add-rule').addEventListener('click', () => { S.rules.push(newRule()); renderRules(); }); renderRules(); }

function newRule() {
  return { id: 'r' + Date.now().toString(36), name: '新规则', enabled: true, priority: S.rules.length + 1, conds: [{ field: 'keyword', value: '' }], action: { type: 'moveToFolder', folderId: (S.folders.find((f) => f.id !== 'all') || {}).id || '' } };
}
const FIELDS = [['keyword', '含关键词'], ['author', '作者'], ['type', '类型'], ['durationMin', '时长≥(秒)'], ['durationMax', '时长≤(秒)'], ['dateFrom', '始于(日期)'], ['dateTo', '止于(日期)'], ['watched', '是否已看']];

function valueControl(field, value) {
  if (field === 'type') {
    const s = document.createElement('select');
    [['video', '视频'], ['image', '图文'], ['live', '直播']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === value) o.selected = true; s.appendChild(o); });
    return s;
  }
  if (field === 'watched') {
    const s = document.createElement('select');
    [['true', '是'], ['false', '否']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (String(value) === v) o.selected = true; s.appendChild(o); });
    return s;
  }
  const i = document.createElement('input'); i.value = value || ''; i.placeholder = '值'; return i;
}
function actionControl(rule) {
  const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;gap:6px;margin-top:6px;align-items:center';
  const type = document.createElement('select');
  [['moveToFolder', '归入文件夹'], ['tag', '打标签'], ['ignore', '忽略']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === rule.action.type) o.selected = true; type.appendChild(o); });
  wrap.appendChild(type);
  const target = document.createElement('span'); target.style.flex = '1';
  const renderTarget = () => {
    target.innerHTML = '';
    if (rule.action.type === 'moveToFolder') {
      const s = document.createElement('select'); s.style.width = '100%';
      S.folders.filter((f) => f.id !== 'all').forEach((f) => { const o = document.createElement('option'); o.value = f.id; o.textContent = '📁 ' + f.name; if (f.id === rule.action.folderId) o.selected = true; s.appendChild(o); });
      s.addEventListener('change', (e) => rule.action.folderId = e.target.value);
      target.appendChild(s);
    } else if (rule.action.type === 'tag') {
      const i = document.createElement('input'); i.placeholder = '标签名'; i.value = rule.action.tag || ''; i.style.width = '100%';
      i.addEventListener('change', (e) => rule.action.tag = e.target.value); target.appendChild(i);
    }
  };
  type.addEventListener('change', (e) => { rule.action.type = e.target.value; if (e.target.value === 'moveToFolder') rule.action.folderId = (S.folders.find((f) => f.id !== 'all') || {}).id || ''; if (e.target.value === 'tag') rule.action.tag = ''; renderTarget(); });
  renderTarget(); wrap.appendChild(target); return wrap;
}

function renderRules() {
  const list = $('#rules-list'); list.innerHTML = '';
  if (!S.rules.length) { list.innerHTML = '<div class="empty">还没有整理规则。<br>点「+ 新增规则」创建一条，再点「保存」。</div>'; return; }
  S.rules.forEach((rule, idx) => {
    const card = document.createElement('div'); card.className = 'rule';
    // 规则名用属性拼接会被引号破坏，这里先放占位、再用 .value 属性安全赋值
    card.innerHTML = `<div class="rule-hd"><input class="rname" style="font-weight:600;background:transparent;border:0;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;width:200px">
      <span class="muted small">优先级 <input class="rpri" type="number" style="width:48px"></span></div>`;
    const nameInput = card.querySelector('.rname');
    nameInput.value = rule.name || '';
    nameInput.addEventListener('change', (e) => rule.name = e.target.value);
    const priInput = card.querySelector('.rpri');
    priInput.value = rule.priority || 0;
    priInput.addEventListener('change', (e) => rule.priority = +e.target.value);
    // enabled switch
    const en = document.createElement('label'); en.className = 'switch'; en.style.marginLeft = 'auto';
    en.innerHTML = `<input type="checkbox" ${rule.enabled ? 'checked' : ''}><span></span>`;
    en.querySelector('input').addEventListener('change', (e) => rule.enabled = e.target.checked);
    card.querySelector('.rule-hd').appendChild(en);

    const conds = document.createElement('div'); conds.className = 'conds';
    rule.conds.forEach((c, ci) => {
      const row = document.createElement('div'); row.className = 'cond-row';
      const fs = document.createElement('select');
      FIELDS.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === c.field) o.selected = true; fs.appendChild(o); });
      const vc = valueControl(c.field, c.value);
      vc.addEventListener('change', (e) => c.value = e.target.value);
      fs.addEventListener('change', (e) => { c.field = e.target.value; const nv = valueControl(c.field, ''); nv.addEventListener('change', (ev) => c.value = ev.target.value); row.replaceChild(nv, vc); });
      const del = document.createElement('button'); del.className = 'btn danger'; del.textContent = '−'; del.style.padding = '4px 10px';
      del.addEventListener('click', () => { rule.conds.splice(ci, 1); renderRules(); });
      row.appendChild(fs); row.appendChild(vc); row.appendChild(del); conds.appendChild(row);
    });
    const addc = document.createElement('button'); addc.className = 'btn'; addc.textContent = '+ 条件'; addc.style.marginTop = '6px';
    addc.addEventListener('click', () => { rule.conds.push({ field: 'keyword', value: '' }); renderRules(); });
    conds.appendChild(addc);
    card.appendChild(conds);

    card.appendChild(actionControl(rule));

    const foot = document.createElement('div'); foot.style.cssText = 'display:flex;gap:8px;margin-top:10px';
    const save = document.createElement('button'); save.className = 'btn primary'; save.textContent = '保存';
    save.addEventListener('click', async () => { await window.dy.rules.save(S.rules); setStatus('规则已保存'); });
    const del = document.createElement('button'); del.className = 'btn danger'; del.textContent = '删除规则';
    del.addEventListener('click', () => { S.rules.splice(idx, 1); renderRules(); });
    const run = document.createElement('button'); run.className = 'btn'; run.textContent = '预览命中';
    run.addEventListener('click', async () => { const r = await window.dy.organize({ apply: false }); setStatus('将命中 ' + r.hits.length + ' 条'); });
    foot.appendChild(save); foot.appendChild(run); foot.appendChild(del);
    card.appendChild(foot);
    list.appendChild(card);
  });
}

boot();
