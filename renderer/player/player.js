'use strict';
// 应用内播放窗口：读取 URL 参数中的播放地址并尝试播放，失败回退到浏览器打开。
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const DATA = {
  url: params.get('url') || '',
  title: params.get('title') || '',
  author: params.get('author') || '',
  thumb: params.get('thumb') || '',
  aweme: params.get('aweme') || ''
};

$('#m-title').textContent = DATA.title;
$('#m-author').textContent = DATA.author ? ('@' + DATA.author) : '';
// 主题变更实时同步（设置页切换主题时主进程会广播）
try { window.dy.onTheme((t) => { if (t) document.documentElement.setAttribute('data-theme', t); }); } catch (_) {}

const video = $('#video');
const cover = $('#cover');
const fallback = $('#fallback');
const toast = $('#toast');
const resumeHint = $('#resume-hint');

/* ---------------- 画质切换 ---------------- */
const qctrl = $('#qctrl');
const qsel = $('#qsel');
let QUALITIES = [];        // [{ label, url }]
let currentQualityUrl = DATA.url;

// 从收藏数据里拿到该视频的全部画质档；老数据可能没有 playUrls，用 playUrl 兜底
async function setupQuality() {
  let opts = [];
  try {
    const favs = await window.dy.fav.get();
    const item = (favs || []).find((f) => f.awemeId === DATA.aweme);
    if (item && Array.isArray(item.playUrls) && item.playUrls.length) opts = item.playUrls;
    else if (item && item.playUrl) opts = [{ label: item.quality || '默认', url: item.playUrl }];
  } catch (_) {}
  if (!opts.length && DATA.url) opts = [{ label: DATA.quality || '默认', url: DATA.url }];
  QUALITIES = opts;
  if (QUALITIES.length <= 1) return;   // 只有一档时不显示切换器
  qctrl.style.display = 'flex';
  QUALITIES.forEach((o) => {
    const b = document.createElement('button');
    b.className = 'qbtn' + (o.url === currentQualityUrl ? ' active' : '');
    b.textContent = o.label;
    b.addEventListener('click', () => switchQuality(o));
    qsel.appendChild(b);
  });
}
// 切换画质：保留当前播放进度，重载新地址后跳回
function switchQuality(opt) {
  if (opt.url === currentQualityUrl) return;
  const t = video.currentTime || 0;
  currentQualityUrl = opt.url;
  $$('.qbtn', qsel).forEach((b) => b.classList.toggle('active', b.textContent === opt.label));
  video.src = opt.url;
  const onMeta = () => { try { if (t > 1) video.currentTime = t; } catch (_) {} video.removeEventListener('loadedmetadata', onMeta); };
  video.addEventListener('loadedmetadata', onMeta);
  video.play().catch(() => {});
  showToast('已切换至 ' + opt.label);
}
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function showFallback() {
  video.style.display = 'none';
  fallback.classList.add('show');
}

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/* ---------------- 倍速控制 ---------------- */
const SPEEDS = [0.5, 1, 1.5, 2];
const ctrl = $('#pctrl');
const spdBtns = [];
SPEEDS.forEach((r) => {
  const b = document.createElement('button');
  b.className = 'spd'; b.textContent = r + '×'; b.dataset.r = r;
  b.addEventListener('click', () => setSpeed(r));
  ctrl.insertBefore(b, resumeHint);
  spdBtns.push(b);
});
function highlightSpeed(r) {
  spdBtns.forEach((b) => b.classList.toggle('active', parseFloat(b.dataset.r) === r));
}
async function setSpeed(r) {
  video.playbackRate = r; highlightSpeed(r);
  try { await window.dy.setSpeed(r); } catch (_) {}
}
(async () => {
  let savedSpeed = 1;
  try { savedSpeed = await window.dy.getSpeed(); } catch (_) {}
  if (!savedSpeed || SPEEDS.indexOf(savedSpeed) < 0) savedSpeed = 1;
  video.playbackRate = savedSpeed; highlightSpeed(savedSpeed);
})();

/* ---------------- 进度记忆 ---------------- */
let savedSec = 0;
if (DATA.aweme) {
  // 进度读取为异步 IPC，放进 IIFE（顶层 await 在 classic script 中不可用）
  (async () => {
    try { savedSec = (await window.dy.getProgress(DATA.aweme)) || 0; } catch (_) {}
    // 恢复进度（避免在结尾附近误恢复）
    video.addEventListener('loadedmetadata', () => {
      if (savedSec > 3 && savedSec < (video.duration - 2)) {
        try { video.currentTime = savedSec; } catch (_) {}
        resumeHint.textContent = '已恢复到 ' + fmt(savedSec);
        resumeHint.classList.add('show');
        setTimeout(() => resumeHint.classList.remove('show'), 2600);
      }
    });
  })();
}
// 节流保存进度（约每 3s + 关键事件）
let lastSave = 0;
video.addEventListener('timeupdate', () => {
  const now = Date.now();
  if (now - lastSave > 3000 && DATA.aweme) { lastSave = now; window.dy.saveProgress(DATA.aweme, video.currentTime); }
});
video.addEventListener('pause', () => { if (DATA.aweme) window.dy.saveProgress(DATA.aweme, video.currentTime); });
video.addEventListener('ended', () => { if (DATA.aweme) window.dy.saveProgress(DATA.aweme, 0); });

// 若有封面，先显示封面（避免黑屏），再尝试加载视频
if (DATA.thumb) { cover.src = DATA.thumb; cover.style.display = 'block'; }

if (DATA.url) {
  video.src = DATA.url;
  video.addEventListener('error', () => {
    const err = video.error;
    const msg = err ? ('错误码 ' + err.code + (err.message ? ': ' + err.message : '')) : '未知错误';
    console.error('[Player] 视频加载失败:', msg, DATA.url ? DATA.url.substring(0, 120) : '(无URL)');
    showFallback();
  });
  video.addEventListener('loadeddata', () => { cover.style.display = 'none'; });
  video.play().catch(() => { /* 自动播放被拦截时由用户点击播放 */ });
} else {
  showFallback();
}

// 载入画质档位（异步从收藏数据里取全部清晰度）
setupQuality();

// 浏览器打开：优先用真实视频页（登录态可播），其次才用播放地址
function openInBrowser() {
  const target = DATA.aweme
    ? 'https://www.douyin.com/video/' + DATA.aweme
    : (DATA.url || 'https://www.douyin.com/');
  window.dy.openExternal(target);
}
$('#btn-open').addEventListener('click', openInBrowser);
$('#btn-browser').addEventListener('click', openInBrowser);
$('#btn-close').addEventListener('click', () => window.close());
