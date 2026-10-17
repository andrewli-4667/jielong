// CSV 解析与导入列匹配（纯函数，可被 Node 直接单测，不依赖数据库/浏览器）

// 解析 CSV：支持逗号/制表符/分号分隔、双引号包裹、UTF-8 BOM
// 返回二维数组（行 -> 单元格）
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  text = String(text).replace(/^﻿/, ''); // 去 UTF-8 BOM
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

// 根据表头与当前接龙字段，规划导入列映射
// header: string[]（已 trim）；fields: [{id,label,type,...}]
// 返回 { dateIdx, nameIdx, colMap:[{idx,field}], warnings:[], error }
function matchImportColumns(header, fields) {
  const norm = header.map(h => String(h).trim());
  const dateIdx = norm.findIndex(h => /^(日期|接龙日期|填报日期|date)$/i.test(h));
  const nameIdx = norm.findIndex(h => /^(姓名|名字|员工|员工姓名|name)$/i.test(h));
  if (dateIdx < 0 || nameIdx < 0) {
    return { dateIdx, nameIdx, colMap: [], warnings: [], error: 'CSV 表头必须包含「日期」和「姓名」两列' };
  }
  const colMap = [];
  const warnings = [];
  for (let i = 0; i < norm.length; i++) {
    if (i === dateIdx || i === nameIdx) continue;
    const key = norm[i].toLowerCase();
    const f = fields.find(f => f.label.trim().toLowerCase() === key);
    if (f) colMap.push({ idx: i, field: f });
    else warnings.push(`列「${norm[i]}」未匹配到任何字段，已忽略`);
  }
  if (!colMap.length) {
    return { dateIdx, nameIdx, colMap: [], warnings, error: '没有匹配到任何字段列，请检查表头是否与字段名一致' };
  }
  return { dateIdx, nameIdx, colMap, warnings, error: null };
}

module.exports = { parseCSV, matchImportColumns };
