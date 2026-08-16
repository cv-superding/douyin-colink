'use strict';
/**
 * 抖音采集层。
 *  - demo 模式：生成贴近真实的演示数据，保证应用开箱即用（与 words-fish「零配置即可演示」一致）。
 *  - real 模式：使用用户自有 Cookie 调用抖音 Web 接口（收藏夹 / 观看历史）。
 *    通过 main/xbogus.js（抖音 X-Bogus 签名，源自 B1gM8c/X-Bogus 的抖音字节码变体）对请求签名。
 *    注意：仅采集「本人」账号数据，请遵守抖音服务条款。
 */
const xb = require('./xbogus');

const TITLES = [
  '三分钟看懂量子纠缠', '打工人的早餐食谱', '城市夜骑 vlog', '猫咪行为大赏', '极简主义收纳',
  'Python 自动化办公', '健身环居家训练', '复古胶片调色', '露营装备清单', '股市入门常识',
  '方言挑战赛', '手冲咖啡教程', '徒步路线推荐', '老房子改造', 'AI 绘画踩坑',
  '吉他自学 30 天', '减脂餐搭配', '桌面好物分享', '通勤穿搭', '宠物医院避坑'
];
const AUTHORS = ['科技小张', '生活研究所', '旅行的猫', '代码食堂', '健身教练Leo', '胶片少年', '财经观察', '美食阿May', '极简控', '夜骑大队'];
const SOURCES = ['推荐', '关注', '搜索', '同城', '热点'];
const TYPES = ['video', 'video', 'video', 'image', 'live'];

// 抖音 Web 端使用的 UA（签名与接口都依赖它）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';

function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function genWatch(days = 120, count = 360) {
  const list = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const ts = now - Math.floor(Math.random() * days) * 86400000 - Math.floor(Math.random() * 86400000);
    list.push({
      id: rid(),
      title: pick(TITLES) + (Math.random() < 0.5 ? '（精讲版）' : ''),
      author: pick(AUTHORS),
      duration: 15 + Math.floor(Math.random() * 600),
      progress: Math.random(),
      ts,
      type: pick(TYPES),
      source: pick(SOURCES)
    });
  }
  return list.sort((a, b) => b.ts - a.ts);
}

function genFavorites(count = 140) {
  const list = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const ts = now - Math.floor(Math.random() * 200) * 86400000 - Math.floor(Math.random() * 86400000);
    const type = pick(TYPES);
    list.push({
      id: rid(),
      folderId: 'uncat',
      title: pick(TITLES),
      author: pick(AUTHORS),
      type,
      duration: 15 + Math.floor(Math.random() * 600),
      ts,
      url: 'https://www.douyin.com/video/' + rid(),
      thumb: '',
      desc: '这是一条演示收藏内容，用于展示本地管理与自动归类流程。',
      tags: []
    });
  }
  return list.sort((a, b) => b.ts - a.ts);
}

/* ---------------- 真实采集 ---------------- */

// 对查询串计算 X-Bogus（不含 X-Bogus 自身）
function signXBogus(query) {
  return xb.sign(query, UA);
}

// 发起带签名的抖音 Web 请求（15s 超时，避免断网/被墙时采集按钮永久挂起）
async function douyinGet(path, params, cookie) {
  const qs = Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  const signed = signXBogus(qs);
  const url = `https://www.douyin.com${path}?${qs}&X-Bogus=${signed}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.douyin.com/',
        'Cookie': cookie,
        'Accept': 'application/json'
      },
      signal: ctl.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时（15s），请检查网络');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// 从 aweme.video 中挑选最高清晰度的可播放地址。
// 抖音默认 play_addr 常为低清（540P 或更低），真正的多档在 video.bit_rate[] 里，
// 取 bit_rate_value 最大者即为最高清（如 1080P）。
function bestPlayUrl(video) {
  if (!video) return '';
  const brs = Array.isArray(video.bit_rate) ? video.bit_rate : [];
  if (brs.length) {
    let best = null;
    for (const b of brs) {
      const v = Number((b && b.bit_rate_value) || 0);
      if (!best || v > best.v) best = { v, addr: b && b.play_addr };
    }
    const list = best && best.addr && best.addr.url_list;
    if (list && list.length) return list[0];
  }
  const def = (video.play_addr && video.play_addr.url_list) || [];
  return def[0] || '';
}
// 清晰度标签（用于界面展示，安抚"画质低"的疑虑）
function labelForBit(bit) {
  const v = Number(bit) || 0;
  if (v >= 1000000) return '1080P';
  if (v >= 700000) return '720P';
  if (v >= 500000) return '540P';
  if (v >= 300000) return '360P';
  return '标清';
}
function qualityLabel(video) {
  const brs = Array.isArray(video.bit_rate) ? video.bit_rate : [];
  let best = 0;
  for (const b of brs) best = Math.max(best, Number((b && b.bit_rate_value) || 0));
  return labelForBit(best);
}
// 返回该视频的全部可播放清晰度（按清晰度从高到低排序），供播放器画质切换使用。
// 每条 { label, url } —— label 如 "1080P"，url 为对应 CDN 地址。
function qualityOptions(video) {
  if (!video) return [];
  const out = [];
  const seen = new Set();
  const brs = Array.isArray(video.bit_rate) ? video.bit_rate : [];
  brs.forEach((b) => {
    const addr = b && b.play_addr;
    const url = addr && addr.url_list && addr.url_list[0];
    if (!url) return;
    const v = Number((b && b.bit_rate_value) || 0);
    const key = v + '|' + url;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: labelForBit(v), url, v });
  });
  // 默认 play_addr 作为兜底（可能低于任一 bit_rate 档）
  const def = (video.play_addr && video.play_addr.url_list && video.play_addr.url_list[0]) || '';
  if (def && !out.some((o) => o.url === def)) out.push({ label: '默认', url: def, v: -1 });
  out.sort((a, b) => b.v - a.v);
  return out.map((o) => ({ label: o.label, url: o.url }));
}

// 把抖音 aweme 结构映射为应用内部收藏/观看结构
function mapAweme(a, kind) {
  if (!a) return null;
  const video = a.video || {};
  const cover = (video.cover && video.cover.url_list) || [];
  const awemeId = String(a.aweme_id || '');
  if (!awemeId) return null;
  return {
    id: awemeId,
    awemeId,
    folderId: 'uncat',
    title: a.desc || ('视频 ' + awemeId),
    author: (a.author && a.author.nickname) || (a.author && a.author.unique_id) || '未知作者',
    type: 'video',
    duration: video.duration || 0,
    ts: (a.create_time ? a.create_time * 1000 : Date.now()),
    url: 'https://www.douyin.com/video/' + awemeId,
    thumb: cover[0] || '',
    playUrl: bestPlayUrl(video),
    playUrls: qualityOptions(video),
    quality: qualityLabel(video),
    desc: a.desc || '',
    progress: kind === 'watch' ? (a.progress || 0) : 0,
    source: '抖音',
    tags: []
  };
}

// 观看历史的响应结构嵌套较深，做防御式解析
function parseHistory(resp) {
  const root = (resp && resp.data) || resp || {};
  const arr = Array.isArray(root) ? root : (root.data || []);
  const out = [];
  for (const it of arr) {
    const info = it && it.content ? it.content.aweme_info : (it && it.aweme_info ? it.aweme_info : it);
    const m = mapAweme(info, 'watch');
    if (!m) continue;
    if (it && it.view_time) m.ts = it.view_time * 1000;
    if (it && typeof it.progress === 'number') m.progress = it.progress;
    out.push(m);
  }
  return out;
}

/**
 * 真实采集：收藏夹（cursor 分页拉全）+ 观看历史。返回 { ok, favorites?, watch?, error? }
 */
async function collectReal(cookie) {
  try {
    // 收藏夹：使用 cursor 翻页，确保拉到「全部」真实收藏而不是只前 20 条
    const favorites = [];
    const seen = new Set();
    let cursor = 0;
    for (let page = 0; page < 100; page++) {
      const favResp = await douyinGet('/aweme/v1/web/aweme/favorite/', {
        aid: 1128, version_name: '23.5.0', device_platform: 'android', os_version: 2333, count: 20, cursor
      }, cookie);
      const list = favResp.aweme_list || [];
      for (const a of list) {
        const m = mapAweme(a, 'fav');
        if (m && !seen.has(m.awemeId)) { seen.add(m.awemeId); favorites.push(m); }
      }
      // 翻页判定：抖音返回 has_more + 下一页 cursor
      const hasMore = favResp.has_more === undefined ? (list.length >= 20) : !!favResp.has_more;
      const next = favResp.cursor;
      if (!list.length || !hasMore) break;
      if (next === undefined || next === null || next === cursor) break;
      cursor = next;
    }

    // 观看历史（结构易变，失败不影响收藏；抖音 Web 端该接口目前 404）
    let watch = [];
    try {
      const hResp = await douyinGet('/aweme/v1/web/aweme/history/', {
        aid: 1128, version_name: '23.5.0', device_platform: 'android', os_version: 2333, count: 20, cursor: 0
      }, cookie);
      watch = parseHistory(hResp);
    } catch (_) { /* 历史可选：抖音 Web 端该接口目前 404，真实观看历史不可用 */ }

    if (!favorites.length && !watch.length) {
      return { ok: false, error: '接口未返回数据（Cookie 可能失效或签名被拒，请检查 Cookie 与账号状态）' };
    }
    return { ok: true, favorites, watch, historyUnavailable: watch.length === 0 };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/**
 * 轻量校验 Cookie 是否有效（不写入数据）：调用一次收藏夹接口，依据 status_code 判定。
 * 返回 { ok, message }
 */
async function checkCookie(cookie) {
  if (!cookie || !cookie.trim()) return { ok: false, message: 'Cookie 为空，请先粘贴登录后的 Cookie' };
  try {
    const resp = await douyinGet('/aweme/v1/web/aweme/favorite/', {
      aid: 1128, version_name: '23.5.0', device_platform: 'android', os_version: 2333, count: 1, cursor: 0
    }, cookie);
    const sc = resp && resp.status_code;
    if (sc === 0 || sc === '0') {
      const n = (resp.aweme_list || []).length;
      return { ok: true, message: 'Cookie 有效（已登录抖音）' + (n ? `，收藏夹可读到 ${n} 条` : '') };
    }
    if (sc === 5 || sc === '5') return { ok: false, message: 'Cookie 已失效 / 未登录（status_code=5），请重新登录抖音后复制 Cookie' };
    return { ok: false, message: '接口返回异常 status_code=' + sc + '，请确认 Cookie 为完整登录态' };
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/HTTP 40[0-9]/.test(msg)) return { ok: false, message: '请求被拒（' + msg + '），Cookie 可能无效或缺少关键字段' };
    return { ok: false, message: '检测失败：' + msg + '（请检查网络 / 代理）' };
  }
}

/**
 * 统一采集入口：根据 config.collectMode 决定走 demo 还是 real，并写入存储。
 */
async function collect(store, cfg) {
  if (cfg.collectMode === 'real' && cfg.cookie) {
    const r = await collectReal(cfg.cookie);
    if (r.ok) {
      // 整体替换观看记录；收藏则按 id 合并——保留用户在本机手动整理的
      // 文件夹归属与标签，否则每次重新采集都会把整理成果打回「未分类」。
      const oldById = new Map((store.getFavorites() || []).map((f) => [f.id, f]));
      const fresh = r.favorites || [];
      const merged = fresh.map((n) => {
        const old = oldById.get(n.id);
        return old
          ? Object.assign({}, n, { folderId: old.folderId || 'uncat', tags: old.tags || [] })
          : n;
      });
      store.setFavorites(merged);
      store.setWatch(r.watch || []);
      const w = (r.watch || []).length, f = merged.length;
      return { mode: 'real', ok: true, watch: w, favorites: f, historyUnavailable: !!r.historyUnavailable };
    }
    return { mode: 'real', ok: false, error: r.error };
  }
  // demo
  const existingWatch = store.getWatch();
  const existingFav = store.getFavorites();
  // 两类数据分开判空：只清空过收藏（或只清空过观看）时也能单独补齐演示数据
  if (!existingWatch || existingWatch.length === 0) store.setWatch(genWatch());
  if (!existingFav || existingFav.length === 0) store.setFavorites(genFavorites());
  const w = store.getWatch().length;
  const f = store.getFavorites().length;
  return { mode: 'demo', ok: true, watch: w, favorites: f };
}

module.exports = { collect, genWatch, genFavorites, collectReal, checkCookie };
