// CSV 解析与导入规划（纯函数，可被 Node 直接单测，不依赖数据库/浏览器）

// 解析 CSV：支持逗号/制表符/分号分隔、双引号包裹、UTF-8 BOM
// 返回二维数组（行 -> 单元格）
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  text = String(text).replace(/^\uFEFF/, ''); // 去 UTF-8 BOM
  // 判断分隔符：优先逗号，其次制表符/分号（按首行出现次数）
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',' || c === '\t' || c === ';') { row.push(field); field = ''; }
      else if (c === '\r') { /* 忽略，统一按 \n 断行 */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// 全角字符转半角（数字/字母/常见符号）
function toHalfWidth(s) {
  return String(s).replace(/[\uFF01-\uFF5E]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ');
}

// 表头规范化：去 BOM、去括号说明、去空格冒号星号、全角转半角、转小写
function normHeader(h) {
  return toHalfWidth(String(h == null ? '' : h))
    .replace(/\uFEFF/g, '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[:：*＊\s"']/g, '')
    .trim()
    .toLowerCase();
}

function pick2(n) { return String(n).padStart(2, '0'); }

// 日期归一化：支持 2026/5/29、2026-5-9、2026.5.29、2026年5月29日、
// 带时分秒、20260529、Excel 日期序列号（如 46170）
// 返回 'YYYY-MM-DD' 或 null（格式不认识 / 日期不存在）
function normalizeDate(input) {
  if (input == null) return null;
  let s = toHalfWidth(String(input)).trim().replace(/^["']|["']$/g, '');
  if (!s) return null;
  // 剥掉时间部分（2026/5/29 12:00:00、2026-05-29T12:00:00Z）
  s = s.replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?.*$/, '').trim();

  let y, mo, d;
  // Excel 日期序列号（1900 系统，25569 = 1970-01-01）
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 20000 && serial < 80000) {
      const ms = (serial - 25569) * 86400000;
      const dt = new Date(ms);
      y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
      return `${y}-${pick2(mo)}-${pick2(d)}`;
    }
    return null;
  }
  // 2026/5/29、2026-5-9、2026.5.29、2026年5月29日
  let m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    // 20260529
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // 校验真实存在（拒绝 2026-02-30）
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pick2(mo)}-${pick2(d)}`;
}

// 数字归一化：空 -> 0；去掉千分位/空格/加号/全角；非数字 -> null
function normalizeNumber(v) {
  if (v == null) return 0;
  let s = toHalfWidth(String(v)).trim().replace(/[,，\s+]/g, '').replace(/^"(.*)"$/, '$1');
  if (s === '') return 0;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const DATE_ALIASES = /^(日期|接龙日期|填报日期|时间|date|day)$/;
const NAME_ALIASES = /^(姓名|名字|员工|员工姓名|人员|name|employee)$/;

/**
 * 规划一次导入（纯函数，不碰数据库）
 * @param {string[][]} rows  parseCSV 的二维数组（首行为表头）
 * @param {Array} fields     当前接龙的字段 [{id,label,type}]
 * @param {Object} opts      { employees: string[], autoCreateFields: boolean }
 * @returns {{
 *   error: string|null, dateIdx: number, nameIdx: number,
 *   columns: Array<{idx:number,label:string,key:string,isNew:boolean}>,
 *   lines: Array<{line:number,name:string,date:string,cells:Object}>,
 *   errors: string[], warnings: string[],
 *   newFieldLabels: string[], employeesToAdd: string[]
 * }}
 */
function planImport(rows, fields, opts) {
  const o = opts || {};
  const autoCreateFields = o.autoCreateFields !== false;
  const existingEmployees = Array.isArray(o.employees) ? o.employees : [];

  const empty = {
    error: null, dateIdx: -1, nameIdx: -1, columns: [], lines: [],
    errors: [], warnings: [], newFieldLabels: [], employeesToAdd: [],
  };
  if (!rows || rows.length < 2) {
    return Object.assign({}, empty, { error: 'CSV 至少要有表头行和一条数据' });
  }
  const header = rows[0].map(h => String(h == null ? '' : h).trim());
  const normH = header.map(normHeader);

  // 乱码防线：含 U+FFFD 替换符说明解码方式错了（如把 GBK 当 UTF-8），
  // 此时表头全是乱码，若继续会按“新字段”建出一堆乱码字段名，必须直接拦下
  if (/\uFFFD/.test(header.join(''))) {
    return Object.assign({}, empty, {
      error: 'CSV 内容出现乱码（编码不正确）。请用 Excel「另存为 → CSV UTF-8(逗号分隔)」，或直接把表格内容复制粘贴到输入框。',
    });
  }

  let dateIdx = normH.findIndex(h => DATE_ALIASES.test(h));
  let nameIdx = normH.findIndex(h => NAME_ALIASES.test(h));
  // 兜底：表头不含中日韩字符（乱码/英文），尝试按位置猜（首列日期、次列姓名）
  if (dateIdx < 0 || nameIdx < 0) {
    const hasCJK = /[\u4e00-\u9fa5]/.test(header.join(''));
    if (!hasCJK && header.length >= 2) { dateIdx = 0; nameIdx = 1; }
  }
  if (dateIdx < 0 || nameIdx < 0) {
    return Object.assign({}, empty, {
      error: `CSV 表头必须包含「日期」和「姓名」两列（当前表头：${header.slice(0, 6).join(' / ') || '空'}${header.length > 6 ? ' …' : ''}）`,
    });
  }

  // 字段按规范化名索引
  const fieldByKey = {};
  (fields || []).forEach(f => { fieldByKey[normHeader(f.label)] = f; });

  const columns = [];
  const warnings = [];
  const newFieldLabels = [];
  const seenKeys = {};
  for (let i = 0; i < header.length; i++) {
    if (i === dateIdx || i === nameIdx) continue;
    const raw = header[i];
    if (String(raw).trim() === '') continue;
    const key = normHeader(raw);
    if (!key) continue;
    if (seenKeys[key]) { warnings.push(`列「${raw}」与前面某列重名，已忽略`); continue; }
    seenKeys[key] = true;
    const f = fieldByKey[key];
    if (f) columns.push({ idx: i, label: raw, key, isNew: false });
    else if (autoCreateFields) {
      columns.push({ idx: i, label: String(raw).trim(), key, isNew: true });
      newFieldLabels.push(String(raw).trim());
    } else {
      warnings.push(`列「${raw}」在接龙里没有对应字段，已忽略（可勾选“自动新建字段”保留它）`);
    }
  }
  if (!columns.length) {
    return Object.assign({}, empty, {
      dateIdx, nameIdx, columns: [], warnings,
      error: '没有匹配到任何数值列，请检查表头是否与接龙字段名一致',
    });
  }
  // 安全阀：一次要新建这么多字段，多半是表头选错行（比如把标题行当表头）
  if (newFieldLabels.length > 20) {
    return Object.assign({}, empty, {
      error: `表头里有 ${newFieldLabels.length} 列都不认识（如 ${newFieldLabels.slice(0, 3).join('、')}），看起来不是正常的字段行，已取消导入以免建出一堆无用字段。请确认第一行就是表头。`,
    });
  }

  const lines = [];
  const errors = [];
  const employeesToAdd = [];
  const empSet = new Set(existingEmployees.map(n => String(n).trim()));
  for (let r = 1; r < rows.length; r++) {
    const cells0 = rows[r];
    const lineNo = r + 1;
    const rawDate = (cells0[dateIdx] || '').trim();
    const name = (cells0[nameIdx] || '').trim();
    if (!rawDate && !name && cells0.every(c => String(c).trim() === '')) continue; // 空行
    if (!name) { errors.push(`第${lineNo}行：缺少姓名`); continue; }
    const date = normalizeDate(rawDate);
    if (!date) { errors.push(`第${lineNo}行：日期「${rawDate}」无法识别（支持 2026/5/29、2026-05-29、20260529）`); continue; }
    const cells = {};
    let badNum = null;
    for (const col of columns) {
      const v = (cells0[col.idx] == null ? '' : String(cells0[col.idx])).trim();
      const n = normalizeNumber(v);
      if (n === null) { badNum = `${col.label}「${v}」不是数字`; break; }
      cells[col.key] = n;
    }
    if (badNum) { errors.push(`第${lineNo}行（${name}）：${badNum}，已跳过`); continue; }
    lines.push({ line: lineNo, name, date, cells });
    if (!empSet.has(name)) { empSet.add(name); employeesToAdd.push(name); }
  }
  if (!lines.length && !errors.length) {
    return Object.assign({}, empty, { dateIdx, nameIdx, columns, warnings, error: '没有可导入的数据行' });
  }
  return {
    error: null, dateIdx, nameIdx, columns, lines, errors: errors.slice(0, 50),
    warnings, newFieldLabels, employeesToAdd,
  };
}

module.exports = { parseCSV, planImport, normalizeDate, normalizeNumber, normHeader, toHalfWidth };
