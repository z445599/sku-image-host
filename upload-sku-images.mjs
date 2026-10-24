#!/usr/bin/env node
/**
 * 批量上传本地图片到公开图床仓库，输出「平台SKU -> 链接地址」映射表。
 *
 * 用法:
 *   node upload-sku-images.mjs --dir "C:/path/to/images" [--out result.xlsx] [--cdn]
 *
 * 说明:
 *   - 文件名（去扩展名）即平台SKU
 *   - 默认走 GitHub raw 直链；加 --cdn 改用 jsDelivr CDN（国内访问更快）
 *   - 已存在的文件会被跳过（幂等），可反复运行
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const hasFlag = (name) => args.includes(`--${name}`);

const SRC_DIR = getArg('dir', '');
const OUT_XLSX = getArg('out', 'sku-links.xlsx');
const REPO_DIR = getArg('repo', path.join(process.cwd(), 'sku-image-host'));
const OWNER = getArg('owner', 'z445599');
const REPO = getArg('repo-name', 'sku-image-host');
const BRANCH = getArg('branch', 'main');
const USE_CDN = hasFlag('cdn');

if (!SRC_DIR) {
  console.error('缺少 --dir 参数');
  process.exit(1);
}
if (!fs.existsSync(SRC_DIR)) {
  console.error(`目录不存在: ${SRC_DIR}`);
  process.exit(1);
}

const IMAGES_DIR = path.join(REPO_DIR, 'images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const files = fs.readdirSync(SRC_DIR)
  .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
  .sort();

console.log(`[1/4] 源目录 ${SRC_DIR}：${files.length} 张图片`);

const buildUrl = (sku) => USE_CDN
  ? `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/images/${sku}.jpg`
  : `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/images/${sku}.jpg`;

// ---- 复制 + 提交 ----
const copied = [];
for (const f of files) {
  const target = path.join(IMAGES_DIR, f);
  const sku = path.parse(f).name;
  const want = path.join(SRC_DIR, f);
  const same = fs.existsSync(target)
    && fs.statSync(target).size === fs.statSync(want).size;
  if (!same) {
    fs.copyFileSync(want, target);
    copied.push(f);
  }
}
console.log(`[2/4] 同步到 ${IMAGES_DIR}：新增/更新 ${copied.length} 张`);

const git = (args_) => execFileSync('git', args_, { cwd: REPO_DIR, stdio: 'pipe' }).toString().trim();
if (copied.length) {
  git(['add', '-A']);
  git(['-c', 'user.name=z445599', '-c', 'user.email=z445599@users.noreply.github.com',
    'commit', '-q', '-m', `feat: sync ${copied.length} SKU images`]);
  console.log('[3/4] 推送中...');
  git(['push', 'origin', BRANCH]);
} else {
  console.log('[3/4] 无变更，跳过推送');
}

// ---- 生成表格 ----
const rows = files.map((f) => {
  const sku = path.parse(f).name;
  return { sku, url: buildUrl(sku), file: f };
});

const csv = ['平台SKU,链接地址', ...rows.map((r) => `${r.sku},${r.url}`)].join('\n');
fs.writeFileSync(OUT_XLSX.replace(/\.xlsx$/i, '.csv'), '\uFEFF' + csv, 'utf8');
console.log(`[4/4] 已写出 ${rows.length} 行映射 -> ${OUT_XLSX.replace(/\.xlsx$/i, '.csv')}`);
console.log(`示例: ${rows[0].sku} -> ${rows[0].url}`);
