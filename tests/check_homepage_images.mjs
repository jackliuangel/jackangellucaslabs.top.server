#!/usr/bin/env node
/** playwright codegen 使用示例
 * # 最简：打开录制器
npx playwright codegen https://jackspark.top

# 存成文件（默认生成 playwright-test，用 --target 换语言）
npx playwright codegen --target javascript -o tests/recorded.js https://jackspark.top

# 换浏览器 / 手机模拟 / 视口
npx playwright codegen -b webkit https://jackspark.top
npx playwright codegen --device "iPhone 11" https://jackspark.top
npx playwright codegen --viewport-size "1280,720" https://jackspark.top

关闭时， 直接关闭test 浏览器
 */



/**
 * Playwright testcase: 打开首页并检查图片是否能正常加载/显示。
 *
 * 用法（在仓库根目录运行）：
 *   node tests/check_homepage_images.mjs                          # 默认 https://jackspark.top
 *   node tests/check_homepage_images.mjs --url https://jackspark.top
 *
 * 带自定义 header（可重复多次）：
 *   node tests/check_homepage_images.mjs \
 *       --header "Authorization: Bearer <token>" \
 *       --header "X-Custom: foo"
 *
 * 或用 JSON 文件批量传 header：
 *   node tests/check_homepage_images.mjs --headers-file /path/to/headers.json
 *   # headers.json 形如 {"Authorization": "Bearer xxx", "Cookie": "a=b"}
 *
 * header 注入方式（二选一）：
 *   - 默认：context 级 extraHTTPHeaders，作用到该页面【所有请求】，
 *     包括第三方跨域请求（可能触发 CORS 预检被拦）。
 *   - --header-scope <origin>：只给匹配该 origin 前缀的请求加 header，
 *     例如 --header-scope https://jackspark.top，避免污染第三方。
 *
 * 显示浏览器窗口（有头模式）并放慢动作便于观察：
 ******   node tests/check_homepage_images.mjs --headed --slow-mo 300 \
 *       --header "Authorization: Bearer xxx" --header-scope https://jackspark.top
 *
 * 指定报告 / 截图输出路径（默认也写到 tests/reports/ 下）：
 *   node tests/check_homepage_images.mjs --report /tmp/report.json --screenshot /tmp/shot.png
 *
 * 退出码：0 = 全部通过；1 = 存在失败项。
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    url: 'https://jackspark.top',
    headers: {},
    headerScope: null,
    report: null,
    screenshot: null,
    headed: false,
    slowMo: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') opts.url = argv[++i];
    else if (a === '--header') {
      const h = argv[++i];
      const idx = h.indexOf(':');
      if (idx === -1) throw new Error(`非法 --header "${h}"，应为 "Name: Value"`);
      opts.headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    } else if (a === '--headers-file') {
      Object.assign(opts.headers, JSON.parse(readFileSync(argv[++i], 'utf8')));
    } else if (a === '--header-scope') opts.headerScope = argv[++i];
    else if (a === '--report') opts.report = argv[++i];
    else if (a === '--screenshot') opts.screenshot = argv[++i];
    else if (a === '--headed') opts.headed = true;
    else if (a === '--slow-mo') opts.slowMo = Number(argv[++i]);
    else if (!a.startsWith('--')) opts.url = a;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

const report = {
  url: opts.url,
  startedAt: new Date().toISOString(),
  checks: [],
  images: [],
  failedImageRequests: [],
  consoleErrors: [],
  passed: false,
};

const browser = await chromium.launch({ headless: !opts.headed, slowMo: opts.slowMo });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  // 默认：全局注入（所有请求，含第三方）。
  ...(opts.headerScope ? {} : { extraHTTPHeaders: opts.headers }),
});
const page = await context.newPage();

// 指定 scope 时：只给匹配该 origin 前缀的请求加 header，避免污染第三方。
if (opts.headerScope && Object.keys(opts.headers).length > 0) {
  await context.route('**/*', (route) => {
    if (route.request().url().startsWith(opts.headerScope)) {
      route.continue({ headers: { ...route.request().headers(), ...opts.headers } });
    } else {
      route.continue();
    }
  });
}

page.on('response', (resp) => {
  const ct = resp.headers()['content-type'] || '';
  const isImage = resp.request().resourceType() === 'image' || ct.startsWith('image/');
  if (isImage && !resp.ok()) {
    report.failedImageRequests.push({ url: resp.url(), status: resp.status() });
  }
});
page.on('console', (msg) => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => report.consoleErrors.push(`pageerror: ${err.message}`));

try {
  const resp = await page.goto(opts.url, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  const status = resp ? resp.status() : null;
  report.checks.push({
    name: 'page-load',
    status: status === 200 ? 'pass' : 'fail',
    detail: `HTTP ${status}`,
  });

  const images = await page.$$eval('img', (imgs) =>
    imgs.map((img) => ({
      src: img.src,
      alt: img.alt,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
      visible: img.offsetParent !== null,
    }))
  );

  report.images = images.map((img) => ({
    ...img,
    loaded: img.naturalWidth > 0,
  }));

  const broken = report.images.filter((img) => !img.loaded);
  report.checks.push({
    name: 'images-loaded',
    status: broken.length === 0 ? 'pass' : 'fail',
    detail: `${report.images.length - broken.length}/${report.images.length} 张图片加载成功`,
  });

  report.checks.push({
    name: 'image-requests',
    status: report.failedImageRequests.length === 0 ? 'pass' : 'fail',
    detail: report.failedImageRequests.length
      ? `${report.failedImageRequests.length} 个图片请求失败`
      : '无失败请求',
  });

  report.checks.push({
    name: 'console-errors',
    status: report.consoleErrors.length === 0 ? 'pass' : 'fail',
    detail: report.consoleErrors.length
      ? `${report.consoleErrors.length} 条控制台错误`
      : '无错误',
  });

  if (opts.screenshot) {
    await page.screenshot({ path: opts.screenshot, fullPage: true });
  }
} catch (err) {
  report.checks.push({ name: 'page-load', status: 'fail', detail: err.message });
} finally {
  await browser.close();
}

report.passed = report.checks.every((c) => c.status === 'pass');

// ---- 控制台报告 ----
console.log(`\n== 首页图片检查报告 ==`);
console.log(`URL: ${report.url}`);
for (const c of report.checks) {
  const mark = c.status === 'pass' ? '✅' : '❌';
  console.log(`  ${mark} ${c.name}: ${c.detail}`);
}
for (const img of report.images) {
  const mark = img.loaded ? '✅' : '❌';
  console.log(`  ${mark} <img> ${img.src || '(空)'}`);
  if (img.src) {
    console.log(`     自然尺寸 ${img.naturalWidth}x${img.naturalHeight} | 渲染 ${img.clientWidth}x${img.clientHeight} | 可见 ${img.visible}`);
  }
}
if (report.failedImageRequests.length) {
  for (const f of report.failedImageRequests) console.log(`  ❌ 图片请求 ${f.status} ${f.url}`);
}
if (report.consoleErrors.length) {
  for (const e of report.consoleErrors) console.log(`  ⚠️  ${e}`);
}

// ---- 写入 JSON 报告 ----
const defaultReport = path.join(__dirname, 'reports', 'homepage-images.json');
const reportPath = opts.report || defaultReport;
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log(`\n报告已写入: ${reportPath}`);
if (opts.screenshot) console.log(`截图已保存: ${opts.screenshot}`);
console.log(`结果: ${report.passed ? '✅ 全部通过' : '❌ 存在失败项'}\n`);

process.exit(report.passed ? 0 : 1);
