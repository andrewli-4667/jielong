// 前端公共纯函数：时间格式化（北京时间） + 编辑记录的输入收集。
// 同时支持两种引入方式：
//   1) 浏览器：<script src="/common.js"></script> 后通过 window.AppCommon 调用
//   2) Node：require('./common.js') 用于自动化测试（不依赖浏览器/DOM/数据库）
(function (root) {
  function fmtDateCN(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d); // YYYY-MM-DD
  }

  // 看板「时间」列：只显示 时分秒（日期已在看板标题/列上体现）
  function fmtTimeCN(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai', hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return `${get('hour')}:${get('minute')}:${get('second')}`;
  }

  function fmtDateTimeCN(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  }

  // 收集管理员「修改记录」的新值。
  //   fields:    [{ id, label, required, type }]
  //   oldValues: { fieldId: value }（记录原值）
  //   promptFn:  (message, defaultValue) => string | null  （浏览器传 window.prompt）
  // 返回：
  //   { cancel: true }         用户在任一字段点「取消」
  //   { error: '必填项不能为空' } 有必填项为空
  //   { values }               构造好的 values（键=字段 id，数字转 Number）
  //
  // 设计要点：用 for 循环逐个 prompt，遇到取消立即 return，
  // 避免旧代码里「在 .map 回调内声明 nv、却在回调外引用」造成的 ReferenceError（导致修改请求发不出去）。
  function collectEditValues(fields, oldValues, promptFn) {
    const line = [];
    for (const f of fields) {
      const cur = oldValues[f.id] != null ? oldValues[f.id] : '';
      const nv = promptFn(`${f.label}${f.required ? '（必填）' : ''}：`, String(cur));
      if (nv === null) return { cancel: true };
      line.push({ f, nv });
    }
    const values = {};
    let bad = false;
    for (const { f, nv } of line) {
      if (f.required && (nv === null || nv.trim() === '')) { bad = true; break; }
      values[f.id] = f.type === 'number' ? (nv === '' ? 0 : Number(nv)) : nv;
    }
    if (bad) return { error: '必填项不能为空' };
    return { values };
  }

  // 解码 CSV 文件到文本，自动识别编码。
  //   为什么需要：Excel 中文版「另存为 CSV」默认是 GBK/GB18030 编码，
  //   直接按 UTF-8 读会整篇乱码（表头变问号），导致导入时匹配不到「日期」「姓名」。
  // 返回 { text, encoding }
  function decodeCsvBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (!bytes.length) return { text: '', encoding: '空文件' };
    // 1) BOM 明确标识
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8 (含BOM)' };
    }
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16 LE' };
    }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16 BE' };
    }
    // 2) 严格 UTF-8：合法就是 UTF-8（中文 CSV 用 UTF-8 时不会误判）
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
    } catch (e) { /* 不是合法 UTF-8，继续 */ }
    // 3) 回退 GB18030（兼容 GBK / GB2312，Excel 中文默认）
    try {
      return { text: new TextDecoder('gb18030').decode(bytes), encoding: 'GBK/GB18030' };
    } catch (e) { /* 环境不支持 gb18030 */ }
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'UTF-8（有损）' };
  }

  const api = { fmtDateCN, fmtTimeCN, fmtDateTimeCN, collectEditValues, decodeCsvBuffer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppCommon = api;
})(typeof window !== 'undefined' ? window : globalThis);
