'use strict';
/**
 * 自动整理规则引擎。
 * 规则 = 多个条件(AND) + 一个动作。条件字段对齐需求中的「关键词/作者/类型/时长/日期」。
 * 支持 dry-run（预览命中）与 apply（实际归类），与 words-fish「配置即时生效」理念一致。
 */

function norm(s) { return (s || '').toLowerCase(); }

// 把条件值统一成时间戳：支持数字时间戳 / ISO 日期串（如 2024-01-01）/ 纯数字年份
function toTime(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (!isNaN(n)) return n;               // 纯数字时间戳
  if (typeof v === 'string') {
    const t = Date.parse(v);             // ISO 日期串
    if (!isNaN(t)) return t;
    const y = Number(v);                 // 仅年份
    if (!isNaN(y)) return new Date(y, 0, 1).getTime();
  }
  return null;
}

function evalCond(fav, cond, watchIdx) {
  const v = cond.value;
  switch (cond.field) {
    case 'keyword': {
      const hay = norm(fav.title + ' ' + fav.author + ' ' + (fav.desc || ''));
      return norm(v).split(/[\s,，]+/).filter(Boolean).every((k) => hay.includes(k));
    }
    case 'author': {
      const list = Array.isArray(v) ? v : [v];
      return list.map(norm).includes(norm(fav.author));
    }
    case 'type':
      return fav.type === v;
    case 'durationMin':
      return (fav.duration || 0) >= Number(v);
    case 'durationMax':
      return (fav.duration || 0) <= Number(v);
    case 'dateFrom': {
      const t = toTime(v);
      return t != null && (fav.ts || 0) >= t;
    }
    case 'dateTo': {
      const t = toTime(v);
      // 日期串按当天结束时刻算（含当天）
      return t != null && (fav.ts || 0) <= (t + 86399999);
    }
    case 'watched': {
      const key = norm(fav.author) + '|' + norm(fav.title);
      const watched = watchIdx.has(key);
      return cond.value ? watched : !watched;
    }
    default:
      return false;
  }
}

function matchRule(fav, rule, watchIdx) {
  if (!rule.enabled) return false;
  if (!rule.conds || rule.conds.length === 0) return false;
  return rule.conds.every((c) => evalCond(fav, c, watchIdx));
}

function buildWatchIdx(watch) {
  const idx = new Set();
  (watch || []).forEach((w) => idx.add(norm(w.author) + '|' + norm(w.title)));
  return idx;
}

function actionDesc(rule, folders) {
  const a = rule.action || {};
  if (a.type === 'moveToFolder') {
    const f = folders.find((x) => x.id === a.folderId);
    return '移动到「' + (f ? f.name : '?') + '」';
  }
  if (a.type === 'tag') return '打标签「' + (a.tag || '') + '」';
  if (a.type === 'ignore') return '标记为忽略';
  return '无动作';
}

/**
 * 运行规则。
 * @param {object} opt {apply:boolean}  apply=true 时写入 favorites，否则仅预览。
 * @returns {{hits:Array, log:Array, changed:number}}
 */
function run(favorites, rules, folders, watch, opt = {}) {
  const apply = !!opt.apply;
  const watchIdx = buildWatchIdx(watch);
  const sorted = (rules || []).filter((r) => r.enabled).slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const hits = [];
  const log = [];
  let changed = 0;
  const next = favorites.map((f) => ({ ...f }));

  for (const fav of next) {
    for (const rule of sorted) {
      if (!matchRule(fav, rule, watchIdx)) continue;
      const desc = actionDesc(rule, folders);
      const a = rule.action || {};
      if (apply) {
        if (a.type === 'moveToFolder' && folders.some((x) => x.id === a.folderId)) {
          fav.folderId = a.folderId; changed++;
        } else if (a.type === 'tag' && a.tag) {
          fav.tags = fav.tags || [];
          if (!fav.tags.includes(a.tag)) { fav.tags.push(a.tag); changed++; }
        } else if (a.type === 'ignore') {
          fav.tags = fav.tags || [];
          if (!fav.tags.includes('忽略')) { fav.tags.push('忽略'); changed++; }
        }
      }
      hits.push({ favoriteId: fav.id, title: fav.title, author: fav.author, ruleName: rule.name, action: desc, folderId: a.folderId });
      log.push(`「${fav.title}」(${fav.author}) → ${rule.name}： ${desc}`);
      break; // 命中最高优先级规则后不再评估后续
    }
  }
  return { hits, log, changed, next: apply ? next : favorites };
}

module.exports = { run, matchRule, actionDesc, buildWatchIdx };
