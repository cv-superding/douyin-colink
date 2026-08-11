'use strict';
/* 悬浮窗交互逻辑（原生 JS，零依赖，对齐 words-fish popup.js） */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let STATE = { cfg: null, watch: [], favs: [], folders: [], tab: 'watch', filter: { y: '', m: '', d: '', h: '' }, folder: 'all' };

const pad = (n) => String(n).padStart(2, '0');
const fmt = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDate = (ts) => { const d = new Date(ts); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };

async function boot() {
  STATE.cfg = await window.dy.cfg.get();
  document.documentElement.setAttribute('data-theme', STATE.cfg.theme || 'light');
  // 主题变更实时同步（设置页切换主题时主进程会广播）
  window.dy.onTheme((t) => { document.documentElement.setAttribute('data-theme', t || 'light'); });
  const [w, f, fo] = await Promise.all([window.dy.watch.get(), window.dy.fav.get(), window.dy.folders.get()]);
  STATE.watch = w || []; STATE.favs = f || []; STATE.folders = fo || [];
  $('#prog').textContent = `观看 ${STATE.watch.length} · 收藏 ${STATE.favs.length}`;
  bindTabs(); bindHide(); bindPin();
  await refreshRules();        // 先加载规则，保证「自动整理」页打开即有内容
  renderWatch(); renderFav(); renderOrg(); setActions();
}

/* ---------- 标签切换 ---------- */
function bindTabs() {
  $$('.tabs .tab').forEach((t) => t.addEventListener('click', () => {
    $$('.tabs .tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    STATE.tab = t.dataset.tab;
    $$('.view').forEach((v) => v.classList.add('hidden'));
    $('#view-' + STATE.tab).classList.remove('hidden');
    setActions();
  }));
}
function bindHide() { $('#btn-hide').addEventListener('click', () => window.dy.hidePopup()); }
function bindPin() {
  const btn = $('#btn-pin');
  const refresh = (on) => btn.classList.toggle('active', !!on);
  refresh(STATE.cfg.alwaysOnTop !== false);
  btn.addEventListener('click', () => {
    const next = !btn.classList.contains('active');
    window.dy.setAlwaysOnTop(next);
    refresh(next);
  });
}

/* ---------- 底部操作栏（随标签变化） ---------- */
function setActions() {
  const a = $('#actions'); a.innerHTML = '';
  if (STATE.tab === 'watch') {
    a.appendChild(mkAct('⟳ 采集', 'primary', collect));
    a.appendChild(mkAct('⤓ 导出CSV', '', exportCsv));
    a.appendChild(mkAct('✕ 清空筛选', '', () => { STATE.filter = { y: '', m: '', d: '', h: '' }; renderWatch(); }));
  } else if (STATE.tab === 'fav') {
    a.appendChild(mkAct('🗂 新建文件夹', 'primary', newFolder));
    a.appendChild(mkAct('⟳ 刷新', '', async () => { STATE.favs = await window.dy.fav.get(); renderFav(); }));
    a.appendChild(mkAct('🤖 一键整理', '', runOrganize));
  } else {
    a.appendChild(mkAct('📋 规则设置', 'primary', () => window.dy.openSettings()));
    a.appendChild(mkAct('👁 预览命中', '', previewOrganize));
    a.appendChild(mkAct('⚡ 执行整理', 'danger', runOrganize));
  }
}
function mkAct(label, cls, fn) { const b = document.createElement('button'); b.className = 'act' + (cls ? ' ' + cls : ''); b.textContent = label; b.addEventListener('click', fn); return b; }

/* ---------- FR2：观看记录 + 年/月/日/分 多级筛选 ---------- */
function renderWatch() {
  const v = $('#view-watch'); v.innerHTML = '';
  const years = [...new Set(STATE.watch.map((x) => new Date(x.ts).getFullYear()))].sort((a, b) => b - a);
  const f = STATE.filter;
  const sel = (key, label, opts, allLabel) => {
    const s = document.createElement('select'); s.dataset.k = key;
    s.appendChild(opt('', allLabel));
    opts.forEach((o) => s.appendChild(opt(o.v, o.t)));
    s.value = f[key];
    s.addEventListener('change', () => { f[key] = s.value; renderWatch(); });
    return s;
  };
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };

  const bar = document.createElement('div'); bar.className = 'time-filter';
  bar.appendChild(sel('y', '年', years.map((y) => ({ v: y, t: y + '年' })), '全部年份'));
  bar.appendChild(sel('m', '月', Array.from({ length: 12 }, (_, i) => ({ v: i + 1, t: (i + 1) + '月' })), '全部月份'));
  bar.appendChild(sel('d', '日', Array.from({ length: 31 }, (_, i) => ({ v: i + 1, t: (i + 1) + '日' })), '全部日'));
  bar.appendChild(sel('h', '分', Array.from({ length: 24 }, (_, i) => ({ v: i, t: i + '点' })), '全部时段'));
  v.appendChild(bar);

  const list = STATE.watch.filter((x) => {
    const d = new Date(x.ts);
    if (f.y && d.getFullYear() != f.y) return false;
    if (f.m && d.getMonth() + 1 != f.m) return false;
    if (f.d && d.getDate() != f.d) return false;
    if (f.h !== '' && d.getHours() != f.h) return false;
    return true;
  });
  const info = document.createElement('div'); info.className = 'muted small'; info.style.marginBottom = '8px';
  info.textContent = `共 ${list.length} 条（按时间倒序）`; v.appendChild(info);

  const box = document.createElement('div'); box.className = 'book-list';
  list.slice(0, 300).forEach((x) => {
    const row = document.createElement('div'); row.className = 'book-item';
    row.innerHTML = `<div><div class="name">${esc(x.title)} <span class="meta">${esc(x.author)}</span></div>
      <div class="meta">${fmt(x.ts)} · ${typeName(x.type)} · 进度 ${Math.round((x.progress || 0) * 100)}%</div></div>
      <div class="actions"><span class="tag">${esc(x.source)}</span></div>`;
    box.appendChild(row);
  });
  if (list.length === 0) {
    const real = STATE.cfg.collectMode === 'real';
    box.innerHTML = real
      ? '<div class="empty">真实模式下抖音 Web 端未提供观看历史接口（已确认 404），<br>仅收藏夹可采集。你看到的收藏夹数据均为本人真实收藏。</div>'
      : '<div class="empty">该时间段暂无观看记录</div>';
  }
  v.appendChild(box);
}

/* ---------- FR3：收藏夹 按文件夹 + 年/月/日 分类 ---------- */
function renderFav() {
  const v = $('#view-fav'); v.innerHTML = '';
  const chips = document.createElement('div'); chips.className = 'tags'; chips.style.marginBottom = '10px';
  STATE.folders.forEach((fo) => {
    const cnt = fo.id === 'all' ? STATE.favs.length : STATE.favs.filter((x) => x.folderId === fo.id).length;
    const c = document.createElement('span'); c.className = 'tag' + (STATE.folder === fo.id ? ' marked-pill' : '');
    c.style.cursor = 'pointer'; c.textContent = `${fo.name} ${cnt}`;
    c.addEventListener('click', () => { STATE.folder = fo.id; renderFav(); });
    chips.appendChild(c);
  });
  v.appendChild(chips);

  let items = STATE.favs;
  if (STATE.folder !== 'all') items = items.filter((x) => x.folderId === STATE.folder);
  items = items.slice().sort((a, b) => b.ts - a.ts);

  // 按 年/月/日 分组
  const groups = {};
  items.forEach((x) => { const k = fmtDate(x.ts); (groups[k] = groups[k] || []).push(x); });
  const box = document.createElement('div'); box.className = 'book-list';
  Object.keys(groups).sort((a, b) => groups[b][0].ts - groups[a][0].ts).forEach((k) => {
    const hd = document.createElement('div'); hd.className = 'muted small'; hd.style.margin = '6px 2px 2px'; hd.textContent = `📅 ${k}（${groups[k].length}）`;
    box.appendChild(hd);
    groups[k].forEach((x) => box.appendChild(favRow(x)));
  });
  if (items.length === 0) box.innerHTML = '<div class="empty">该文件夹暂无收藏</div>';
  v.appendChild(box);
}

function favRow(x) {
  const row = document.createElement('div'); row.className = 'book-item';
  const tags = (x.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const thumb = x.thumb ? `<img class="thumb" src="${esc(x.thumb)}" alt="">` : '';
  const canPlay = !!x.awemeId;
  row.innerHTML = `<div class="fav-main">${thumb}<div class="fav-info">
      <div class="name">${esc(x.title)} <span class="meta">${esc(x.author)}</span></div>
      <div class="meta">${fmt(x.ts)} · ${typeName(x.type)}${x.quality ? ' · ' + x.quality : ''}${x.source ? ' · ' + esc(x.source) : ''}</div>
      <div class="tags" style="margin-top:4px">${tags}</div></div></div>
    <div class="actions">
      <button class="btn play ${canPlay ? '' : 'disabled'}" title="${canPlay ? '播放' : '切换到真实采集后可播放'}">▶</button>
      <select class="move-sel" title="移动到文件夹">${STATE.folders.filter((f) => f.id !== 'all').map((f) => `<option value="${f.id}" ${f.id === x.folderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
      <button class="btn danger del" title="删除">×</button>
    </div>`;
  if (canPlay) {
    row.querySelector('.play').addEventListener('click', () => {
      window.dy.play({ awemeId: x.awemeId, playUrl: x.playUrl || '', title: x.title, author: x.author, thumb: x.thumb || '' });
    });
  } else {
    row.querySelector('.play').addEventListener('click', () => showToast('演示数据，切换到「真实采集」并粘贴 Cookie 后可播放真实视频'));
  }
  row.querySelector('.move-sel').addEventListener('change', async (e) => {
    x.folderId = e.target.value; await window.dy.fav.save(STATE.favs); renderFav();
  });
  row.querySelector('.del').addEventListener('click', async () => {
    STATE.favs = STATE.favs.filter((y) => y.id !== x.id); await window.dy.fav.save(STATE.favs); renderFav();
  });
  return row;
}

/* ---------- FR4：自动整理（预览 / 执行） ---------- */
function renderOrg() {
  const v = $('#view-org'); v.innerHTML = '';
  const rules = STATE.cfg && STATE._rules ? STATE._rules : [];
  const box = document.createElement('div');
  if (!rules.length) box.innerHTML = '<div class="empty">还没有整理规则。<br>点「规则设置」在设置窗中新增。</div>';
  rules.forEach((r) => {
    const d = document.createElement('div'); d.className = 'rule';
    d.innerHTML = `<div class="rule-hd"><b>${esc(r.name)}</b><span class="muted small">优先级 ${r.priority || 0} · ${r.enabled ? '启用' : '停用'}</span></div>
      <div class="muted small">${r.conds.map(condText).join(' 且 ')} → ${actionText(r.action)}</div>`;
    box.appendChild(d);
  });
  v.appendChild(box);
}
function condText(c) {
  const map = { keyword: '含词', author: '作者', type: '类型', durationMin: '时长≥', durationMax: '时长≤', dateFrom: '始于', dateTo: '止于', watched: '已看' };
  return `${map[c.field] || c.field} "${esc(c.value)}"`;
}
function actionText(a) {
  if (a.type === 'moveToFolder') { const f = STATE.folders.find((x) => x.id === a.folderId); return '归入『' + (f ? f.name : '?') + '』'; }
  if (a.type === 'tag') return '打标签『' + esc(a.tag) + '』';
  if (a.type === 'ignore') return '忽略';
  return '无';
}
async function refreshRules() { STATE._rules = await window.dy.rules.get(); renderOrg(); }
async function previewOrganize() { await refreshRules(); const r = await window.dy.organize({ apply: false }); showToast(`预览：将命中 ${r.hits.length} 条`); renderOrg(); }
async function runOrganize() {
  await refreshRules(); const r = await window.dy.organize({ apply: true });
  STATE.favs = await window.dy.fav.get(); renderFav(); showToast(`已整理 ${r.changed} 条`);
}

/* ---------- 采集 / 导出 / 工具 ---------- */
async function collect() {
  const b = $$('.actions .act')[0]; b.classList.add('loading');
  const r = await window.dy.collect();
  STATE.watch = await window.dy.watch.get(); STATE.favs = await window.dy.fav.get();
  $('#prog').textContent = `观看 ${STATE.watch.length} · 收藏 ${STATE.favs.length}`;
  b.classList.remove('loading');
  let msg = r.ok ? `采集完成（${r.mode === 'demo' ? '演示数据' : '真实'}）：收藏 ${r.favorites}` : '采集失败：' + (r.error || '');
  if (r.ok && r.historyUnavailable) msg += '（观看历史抖音接口不可用，仅收藏夹）';
  showToast(msg);
  renderWatch(); renderFav();
}
function exportCsv() {
  const rows = STATE.watch.map((x) => [fmt(x.ts), x.title, x.author, typeName(x.type), x.source, Math.round((x.progress || 0) * 100) + '%']);
  const csv = '时间,标题,作者,类型,来源,进度\n' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'watch-history.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);   // 释放 Blob URL，避免内存累积
  showToast('已导出 CSV');
}
async function newFolder() {
  const name = prompt('文件夹名称：'); if (!name) return;
  const id = 'f' + Date.now().toString(36);
  STATE.folders.push({ id, name, parentId: null });
  await window.dy.folders.save(STATE.folders); renderFav();
}

let toastTimer = null;
function showToast(msg) {
  const t = $('#prog'); const old = t.textContent; t.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.textContent = `观看 ${STATE.watch.length} · 收藏 ${STATE.favs.length}`; }, 2200);
}
function typeName(t) { return ({ video: '视频', image: '图文', live: '直播' })[t] || '视频'; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

boot();
