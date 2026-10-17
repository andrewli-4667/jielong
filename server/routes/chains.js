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
      // 含停用员工：管理面板「员工名单」需看到离职者可一键恢复；填报下拉与看板在前端按 isActive 自行过滤
      repo.listEmployees(chain.id, true),
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

// ---------- CSV 导入（解析/日期/列匹配在 csvutil 里，纯函数可单测） ----------
const { parseCSV, planImport, normHeader } = require('../csvutil');

// 批量导入历史记录（管理，CSV 文本）
// 表头：必须含「日期」「姓名」（支持别名）；日期支持 2026/5/29、2026-05-29、20260529
// 其余列按字段标签匹配；未匹配列可自动新建为字段；CSV 中新出现的人自动加入名单
router.post('/:id/entries/import', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { csv, autoCreateFields } = req.body || {};
  if (!csv || typeof csv !== 'string' || !csv.trim()) return res.json({ code: 1, message: '未收到 CSV 内容' });
  try {
    const chainId = req.params.id;
    let fields = await repo.listFields(chainId, true); // 含已停用，避免重复建同名字段
    const employees = await repo.listEmployees(chainId, true);
    // 名单里已停用的人：数据能导入，但看板不显示，需要提示用户
    const inactiveNames = employees.filter(e => !e.isActive).map(e => e.name);

    const rows = parseCSV(csv);
    const plan = planImport(rows, fields, {
      employees: employees.map(e => e.name),
      autoCreateFields: autoCreateFields !== false,
    });
    if (plan.error) return res.json({ code: 1, message: plan.error, data: { warnings: plan.warnings } });

    // 1) 未匹配的列 -> 自动新建为字段（数字型、非必填，不影响员工日常填报）
    const createdFields = [];
    const failCreate = [];
    for (const label of plan.newFieldLabels) {
      try {
        const f = await repo.addField(chainId, { label, type: 'number', required: false });
        createdFields.push(f);
      } catch (e) { failCreate.push(`新建字段「${label}」失败：${e.message}`); }
    }

    // 2) 字段标签 -> id 映射（已有字段 + 新建字段）
    const labelToId = {};
    fields.forEach(f => { labelToId[normHeader(f.label)] = f.id; });
    createdFields.forEach(f => { labelToId[normHeader(f.label)] = f.id; });

    // 3) 组装写入行（按字段 id 组织 values）
    const payload = [];
    for (const ln of plan.lines) {
      const values = {};
      for (const key of Object.keys(ln.cells)) {
        const id = labelToId[key];
        if (id) values[id] = ln.cells[key];
      }
      payload.push({ employeeName: ln.name, entryDate: ln.date, values });
    }

    // 4) 批量写入（分批，避免 800+ 次请求超时）
    let success = 0;
    let writeError = null;
    try { success = await repo.bulkUpsertEntries(chainId, payload); }
    catch (e) { writeError = e.message; }

    // 5) CSV 里出现但名单中没有的人 -> 自动加入名单（否则看板看不到他们的数据）
    let employeesAdded = [];
    if (!writeError && plan.employeesToAdd.length) {
      try {
        const added = await repo.addEmployees(chainId, plan.employeesToAdd);
        employeesAdded = added.map(a => a.name);
      } catch (e) { /* 名单唯一键冲突等不影响数据写入 */ }
    }

    const errors = plan.errors.concat(failCreate);
    if (writeError) errors.push('写入数据库失败：' + writeError);
    const warnings = plan.warnings.slice();
    if (inactiveNames.length) {
      const hit = [];
      plan.lines.forEach(l => { if (inactiveNames.indexOf(l.name) >= 0 && hit.indexOf(l.name) < 0) hit.push(l.name); });
      if (hit.length) warnings.push(`这些人在名单中已停用（数据已导入但看板不显示，可到「员工」页恢复）：${hit.join('、')}`);
    }
    if (plan.errors.length) warnings.push(`有 ${plan.errors.length} 行未导入，详见下方明细`);
    const ds = plan.lines.map(l => l.date).sort();
    res.json({
      code: 0,
      data: {
        success,
        total: plan.lines.length,
        errors,
        warnings,
        createdFields: createdFields.map(f => f.label),
        employeesAdded,
        minDate: ds.length ? ds[0] : null,
        maxDate: ds.length ? ds[ds.length - 1] : null,
      },
    });
  } catch (e) { res.json({ code: 1, message: e.message }); }
});

// 导出 CSV（明细行，范围：创建日 → 今天）【需管理员口令】
router.get('/:id/export', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const chain = await repo.getChain(req.params.id);
    if (!chain) return res.json({ code: 1, message: '接龙不存在' });
    const fields = await repo.listFields(chain.id);
    // 导出范围：接龙创建日 → 今天；若导入过更早的历史数据，则从最早记录日起
    let from = repo.fmtDateCN(chain.createdAt);
    try {
      const minDate = await repo.minEntryDate(chain.id);
      if (minDate && minDate < from) from = minDate;
    } catch (e) { /* 取不到就用创建日 */ }
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
