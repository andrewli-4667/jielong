// 接龙相关路由（重构：员工每日业务达成 · Supabase 存储）
const express = require('express');
const router = express.Router();
const repo = require('../repo');
const config = require('../config');

// 校验管理员口令
function requireAdmin(req, res) {
  const pwd = (req.body && req.body.adminPassword) || (req.query && req.query.adminPassword);
  if (pwd !== config.adminPassword) {
    res.json({ code: 401, message: '管理员口令错误' });
    return false;
  }
  return true;
}

// 列表
router.get('/', async (req, res) => {
  try {
    const chains = await repo.listChains();
    res.json({ code: 0, data: chains });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

// 创建接龙（管理）
router.post('/', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { title } = req.body || {};
  if (!title || !String(title).trim()) return res.json({ code: 1, message: '标题不能为空' });
  try {
    const chain = await repo.createChain({ title: String(title).trim() });
    const shareUrl = `${req.protocol}://${req.get('host')}/?id=${chain.id}`;
    res.json({ code: 0, data: { ...chain, shareUrl } });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

// 详情（含字段、名单、记录、统计），?date= 指定锚定日期
router.get('/:id', async (req, res) => {
  try {
    const chain = await repo.getChain(req.params.id);
    if (!chain) return res.json({ code: 1, message: '接龙不存在' });
    const [fields, employees, entries] = await Promise.all([
      repo.listFields(chain.id),
      repo.listEmployees(chain.id),
      repo.listEntries(chain.id),
    ]);
    const today = repo.todayCN();
    // 已提交今天的人数
    const submittedToday = entries.filter(e => e.entryDate === today).map(e => e.employeeName);
    res.json({
      code: 0,
      data: {
        chain, fields, employees, entries,
        today,
        submittedToday,
        createdDate: repo.fmtDateCN(chain.createdAt),
      },
    });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

// 开关接龙（管理）
router.patch('/:id/status', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { status } = req.body || {};
  if (!['open', 'closed'].includes(status)) return res.json({ code: 1, message: '状态非法' });
  try {
    const r = await repo.setChainStatus(req.params.id, status);
    res.json({ code: 0, data: r });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

// 改接龙标题（管理）
router.patch('/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { title } = req.body || {};
  if (!title || !String(title).trim()) return res.json({ code: 1, message: '标题不能为空' });
  try {
    const r = await repo.updateChain(req.params.id, { title: String(title).trim() });
    res.json({ code: 0, data: r });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

// 删除整个接龙（管理，级联删除字段/员工/记录）
router.delete('/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    await repo.deleteChain(req.params.id);
    res.json({ code: 0, data: { ok: true } });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

// ---------- 字段（可增删改） ----------
router.get('/:id/fields', async (req, res) => {
  try { res.json({ code: 0, data: await repo.listFields(req.params.id) }); }
  catch (e) { res.json({ code: 1, message: e.message }); }
});
router.post('/:id/fields', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { label, type, required, options } = req.body || {};
  if (!label || !String(label).trim()) return res.json({ code: 1, message: '字段名不能为空' });
  try {
    const f = await repo.addField(req.params.id, {
      label: String(label).trim(), type: type || 'number',
      required: required !== false, options: options || null,
    });
    res.json({ code: 0, data: f });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});
router.patch('/:id/fields/:fid', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const f = await repo.updateField(req.params.id, req.params.fid, req.body || {});
    res.json({ code: 0, data: f });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});
router.delete('/:id/fields/:fid', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try { await repo.deleteField(req.params.id, req.params.fid); res.json({ code: 0, data: { ok: true } }); }
  catch (e) { res.json({ code: 1, message: e.message }); }
});

// ---------- 员工名单（可增减） ----------
router.get('/:id/employees', async (req, res) => {
  try { res.json({ code: 0, data: await repo.listEmployees(req.params.id) }); }
  catch (e) { res.json({ code: 1, message: e.message }); }
});
router.post('/:id/employees', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { names } = req.body || {};
  if (!Array.isArray(names) || !names.length) return res.json({ code: 1, message: '请传入姓名列表' });
  const clean = [...new Set(names.map(n => String(n).trim()).filter(Boolean))];
  if (!clean.length) return res.json({ code: 1, message: '没有有效姓名' });
  try {
    const added = await repo.addEmployees(req.params.id, clean);
    res.json({ code: 0, data: { added, count: added.length } });
  } catch (e) {
    if (/duplicate|unique/i.test(e.message)) return res.json({ code: 1, message: '名单中存在重复姓名' });
    res.json({ code: 1, message: e.message });
  }
});
router.patch('/:id/employees/:eid', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const e = await repo.updateEmployee(req.params.id, req.params.eid, req.body || {});
    res.json({ code: 0, data: e });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});
router.delete('/:id/employees/:eid', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try { await repo.deleteEmployee(req.params.id, req.params.eid); res.json({ code: 0, data: { ok: true } }); }
  catch (e) { res.json({ code: 1, message: e.message }); }
});

// ---------- 记录（每人每天一条） ----------
// 员工提交 / 当天修改（管理员也可替员工提交，用同样的 upsert）
router.post('/:id/entries', async (req, res) => {
  const { employeeId, employeeName, entryDate, values } = req.body || {};
  if (!employeeName || !String(employeeName).trim()) return res.json({ code: 1, message: '请选择员工姓名' });
  if (!entryDate) return res.json({ code: 1, message: '缺少日期' });
  if (!values || typeof values !== 'object') return res.json({ code: 1, message: '缺少填报数据' });
  try {
    const entry = await repo.upsertEntry(req.params.id, {
      employeeId: employeeId || null,
      employeeName: String(employeeName).trim(),
      entryDate,
      values,
    });
    res.json({ code: 0, data: entry });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});
router.patch('/:id/entries/:eid', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { values } = req.body || {};
  if (!values || typeof values !== 'object') return res.json({ code: 1, message: '缺少填报数据' });
  try {
    const e = await repo.updateEntry(req.params.id, req.params.eid, values);
    res.json({ code: 0, data: e });
  } catch (err) { res.json({ code: 1, message: err.message }); }
});
router.delete('/:id/entries/:eid', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try { await repo.deleteEntry(req.params.id, req.params.eid); res.json({ code: 0, data: { ok: true } }); }
  catch (e) { res.json({ code: 1, message: e.message }); }
});

// ---------- CSV 解析（支持逗号/制表符/分号分隔、双引号包裹、去 BOM） ----------
const { parseCSV, matchImportColumns } = require('../csvutil');

// 批量导入历史记录（管理，CSV 文本）
// 表头：必须含「日期」「姓名」；其余列按字段标签（忽略大小写/空白）匹配到当前接龙的字段
router.post('/:id/entries/import', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { csv } = req.body || {};
  if (!csv || typeof csv !== 'string' || !csv.trim()) return res.json({ code: 1, message: '未收到 CSV 内容' });
  try {
    const fields = await repo.listFields(req.params.id);
    const rows = parseCSV(csv);
    if (rows.length < 2) return res.json({ code: 1, message: 'CSV 至少要有表头行和一条数据' });
    const header = rows[0].map(h => h.trim());
    const plan = matchImportColumns(header, fields);
    if (plan.error) return res.json({ code: 1, message: plan.error });
    const { dateIdx, nameIdx, colMap } = plan;
    const warnings = plan.warnings;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    let ok = 0; const errors = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const date = (cells[dateIdx] || '').trim();
      const name = (cells[nameIdx] || '').trim();
      if (!dateRe.test(date)) { errors.push(`第${r + 1}行：日期「${date}」格式应为 YYYY-MM-DD`); continue; }
      if (!name) { errors.push(`第${r + 1}行：缺少姓名`); continue; }
      const values = {};
      for (const { idx, field } of colMap) {
        const v = (cells[idx] || '').trim();
        if (field.type === 'number') {
          const n = Number(v);
          values[field.id] = v === '' ? 0 : (isNaN(n) ? 0 : n);
        } else values[field.id] = v;
      }
      try {
        await repo.upsertEntry(req.params.id, { employeeName: name, entryDate: date, values });
        ok++;
      } catch (e) { errors.push(`第${r + 1}行（${name} ${date}）写入失败：${e.message}`); }
    }
    res.json({ code: 0, data: { success: ok, errors, warnings } });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

// 导出 CSV（明细行，范围：创建日 → 今天）【需管理员口令】
router.get('/:id/export', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const chain = await repo.getChain(req.params.id);
    if (!chain) return res.json({ code: 1, message: '接龙不存在' });
    const fields = await repo.listFields(chain.id);
    const from = repo.fmtDateCN(chain.createdAt);
    const entries = await repo.exportEntries(chain.id, from);

    const headers = ['日期', '姓名', ...fields.map(f => f.label), '接龙时间'];
    const rows = entries.map(e => {
      const vals = e.values || {};
      return [
        e.entryDate,
        e.employeeName,
        ...fields.map(f => (vals[f.id] != null ? vals[f.id] : '') ),
        repo.fmtDateTimeCN(e.createdAt),
      ];
    });
    const csv = [headers, ...rows]
      .map(r => r.map(cell => {
        const s = String(cell == null ? '' : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chain_${chain.id}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

module.exports = router;
