'use strict';

const fs = require('fs');
const path = require('path');

/* Hexo 将脚本包装为 (exports, require, module, __filename, __dirname, hexo) => { … }，
 * 须直接使用全局注入的 hexo，不能使用 module.exports = function (hexo) { … } */
hexo.extend.helper.register('post_date_literal', function (post) {
  const cfg = this.config || {};
  const df = cfg.date_format || 'YYYY-MM-DD';
  const tf = cfg.time_format || 'HH:mm:ss';
  const fallbackFmt = df + ' ' + tf;
  const fallback = () => {
    if (!post || !post.date) return '';
    return this.date(post.date, fallbackFmt).trim();
  };
  if (!post || !post.source) return fallback();
  const fp = path.join(hexo.source_dir, post.source);
  let raw;
  try {
    raw = fs.readFileSync(fp, 'utf8');
  } catch (e) {
    return fallback();
  }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return fallback();
  const dm = match[1].match(/^date:\s*(.+)$/m);
  if (!dm) return fallback();
  let v = dm[1].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
});
