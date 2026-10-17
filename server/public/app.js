// 员工每日业务达成接龙 · 前端逻辑（原生 JS，对接 /api/chains）
const el = (id) => document.getElementById(id);
function toast(msg) {
  const t = el('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}
// 管理面板里的行内文字反馈
function setMsg(id, text, isErr) {
  const e = el(id); if (!e) return;
  e.textContent = text || '';
  e.className = 'msg' + (isErr ? ' err' : (text ? ' ok' : ''));
}
function fmtDate(d) { return d; }

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  let json = {};
  try { json = await res.json(); } catch (e) { /* 导出接口返回非 JSON */ }
  return json;
}

// ---------- 全局状态 ----------
const state = {
  chain: null, fields: [], employees: [], entries: [], today: '', createdDate: '',
  selectedEmployeeId: '', selectedEmployeeName: '',
  viewDate: '', recDate: '', adminPwd: sessionStorage.getItem('adminPwd') || '',
};

// ---------- 视图切换 ----------
function show(view) {
  el('view-home').hidden = view !== 'home';
  el('view-detail').hidden = view !== 'detail';
}

// ---------- 首页 ----------
async function loadHome() {
  show('home');
  const r = await api('/api/chains');
  const list = el('chain-list'); list.innerHTML = '';
  const chains = r.data || [];
  el('home-empty').hidden = chains.length > 0;
  chains.forEach(c => {
    const div = document.createElement('div');
    div.className = 'chain-item';
    div.innerHTML = `<div><div class="t">${esc(c.title)}</div>
      <div class="sub">创建于 ${esc(AppCommon.fmtDateCN(c.createdAt))} · ${c.status === 'closed' ? '已关闭' : '进行中'}</div></div>
      <span class="badge ${c.status === 'closed' ? 'closed' : 'ok'}">${c.status === 'closed' ? '已关闭' : '进行中'}</span>`;
    div.onclick = () => { location.href = '/?id=' + c.id; };
    list.appendChild(div);
  });
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }

// ---------- 创建接龙（需要口令） ----------
async function createChain() {
  const title = prompt('接龙标题（如：9月业务达成日报）：');
  if (!title) return;
  let pwd = state.adminPwd;
  if (!pwd) { pwd = prompt('管理员口令：'); if (!pwd) return; }
  const r = await api('/api/chains', { method: 'POST', body: JSON.stringify({ title, adminPassword: pwd }) });
  if (r.code === 0) {
    state.adminPwd = pwd; sessionStorage.setItem('adminPwd', pwd);
    toast('创建成功');
    location.href = '/?id=' + r.data.id;
  } else {
    toast(r.message || '创建失败');
  }
}

// ---------- 详情 ----------
async function loadDetail(id) {
  show('detail');
  const r = await api('/api/chains/' + id);
  if (r.code !== 0) { toast(r.message || '加载失败'); return loadHome(); }
  const d = r.data;
  state.chain = d.chain; state.fields = d.fields; state.employees = d.employees;
  state.entries = d.entries; state.today = d.today; state.createdDate = d.createdDate;
  state.viewDate = d.today; state.recDate = d.today;

  el('detail-title').textContent = d.chain.title;
  const st = el('detail-status');
  st.textContent = d.chain.status === 'closed' ? '已关闭' : '进行中';
  st.className = 'badge ' + (d.chain.status === 'closed' ? 'closed' : 'ok');
  el('today-pill').innerHTML = `今天：<b>${d.today}</b> ｜ 接龙创建于 ${d.createdDate}（长期有效，可每天填报）`;

  renderEmployeeSelect();
  renderForm();
  renderBoard();
  el('view-date').value = d.today;
  el('rec-date').value = d.today;
}

// 改接龙标题（管理）：未登录管理口令时先提示输入，最多重试 2 次
async function renameChain() {
  if (!state.chain) return;
  const nt = prompt('修改接龙标题：', state.chain.title || '');
  if (nt === null) return; // 取消
  const t = String(nt).trim();
  if (!t) { toast('标题不能为空'); return; }
  let pwd = state.adminPwd;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!pwd) { pwd = prompt('请输入管理员口令：'); if (!pwd) return; }
    try {
      const r = await api('/api/chains/' + state.chain.id, {
        method: 'PATCH',
        body: JSON.stringify({ title: t, adminPassword: pwd }),
      });
      if (r.code === 0) {
        state.adminPwd = pwd; sessionStorage.setItem('adminPwd', pwd);
        state.chain.title = t; el('detail-title').textContent = t;
        toast('✅ 已改名');
        return;
      }
      if (r.code === 401) { pwd = null; toast('口令错误，请重试'); continue; }
      toast('❌ ' + (r.message || '改名失败')); return;
    } catch (e) { toast('❌ 改名失败：' + e.message); return; }
  }
}
el('btn-rename-chain').onclick = renameChain;

function renderEmployeeSelect() {
  const sel = el('employee-select'); sel.innerHTML = '<option value="">— 请选择 —</option>';
  state.employees.forEach(e => {
    if (e.isActive === false) return;
    const o = document.createElement('option');
    o.value = e.id; o.textContent = e.name;
    sel.appendChild(o);
  });
  sel.onchange = () => {
    state.selectedEmployeeId = sel.value;
    state.selectedEmployeeName = sel.value ? (state.employees.find(e => e.id === sel.value) || {}).name : '';
    renderForm();
  };
  sel.value = state.selectedEmployeeId;
}

// 员工今日已提交记录
function todayEntryOf(name) {
  return state.entries.find(e => e.employeeName === name && e.entryDate === state.viewDate);
}

function renderForm() {
  const card = el('form-card');
  if (!state.selectedEmployeeId) { card.hidden = true; return; }
  card.hidden = false;
  el('form-date-label').textContent = state.viewDate;
  const existing = todayEntryOf(state.selectedEmployeeName);
  const stateBadge = el('form-state');
  if (existing) { stateBadge.textContent = '今日已填报 · 可修改'; stateBadge.className = 'badge small ok'; }
  else { stateBadge.textContent = '未填报'; stateBadge.className = 'badge small'; }

  const form = el('entry-form'); form.innerHTML = '';
  state.fields.forEach(f => {
    const def = (existing && existing.values && existing.values[f.id] != null) ? existing.values[f.id] : '';
    const wrap = document.createElement('div'); wrap.className = 'row gap';
    const label = document.createElement('label'); label.className = 'flex1'; label.textContent = f.label + (f.required ? ' *' : '');
    const input = document.createElement('input');
    input.type = f.type === 'text' ? 'text' : 'number'; input.step = 'any';
    input.className = 'val-input'; input.value = def; input.dataset.fid = f.id; input.name = f.id;
    wrap.appendChild(label); wrap.appendChild(input); form.appendChild(wrap);
  });
}

el('btn-submit').onclick = async () => {
  if (!state.selectedEmployeeId) { toast('请先选择你的名字'); return; }
  if (state.chain.status === 'closed') { toast('接龙已关闭，无法提交'); return; }
  const values = {};
  let missing = false;
  el('entry-form').querySelectorAll('input').forEach(inp => {
    const f = state.fields.find(x => x.id === inp.name);
    const v = inp.value.trim();
    if (f.required && v === '') { missing = true; return; }
    values[inp.name] = f.type === 'number' ? (v === '' ? 0 : Number(v)) : v;
  });
  if (missing) { toast('必填项不能为空'); return; }
  el('submit-msg').textContent = '提交中…';
  const r = await api('/api/chains/' + state.chain.id + '/entries', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: state.selectedEmployeeId, employeeName: state.selectedEmployeeName,
      entryDate: state.viewDate, values,
    }),
  });
  el('submit-msg').textContent = '';
  if (r.code === 0) { toast('提交成功'); await reloadDetail(); }
  else toast(r.message || '提交失败');
};

// ---------- 每日看板（表格：员工 × 字段） ----------
function renderBoard() {
  const board = el('board');
  const date = state.viewDate;
  const rows = state.employees.filter(e => e.isActive !== false);
  const entriesOfDate = state.entries.filter(e => e.entryDate === date);
  let html = '<table><thead><tr><th class="name">员工</th>';
  state.fields.forEach(f => html += `<th>${esc(f.label)}</th>`);
  html += '<th>时间</th></tr></thead><tbody>';
  if (!rows.length) {
    html += `<tr><td colspan="${state.fields.length + 2}" class="miss">尚未导入员工名单</td></tr>`;
  }
  rows.forEach(e => {
    const ent = entriesOfDate.find(x => x.employeeName === e.name);
    html += `<tr><td class="name">${esc(e.name)}</td>`;
    if (ent) {
      state.fields.forEach(f => {
        const v = ent.values && ent.values[f.id] != null ? ent.values[f.id] : '';
        html += `<td class="ok-cell">${esc(v)}</td>`;
      });
      html += `<td>${esc(AppCommon.fmtTimeCN(ent.createdAt))}</td>`;
    } else {
      for (let i = 0; i < state.fields.length; i++) html += '<td class="miss">—</td>';
      html += '<td class="miss">未填报</td>';
    }
    html += '</tr>';
  });
  html += '</tbody></table>';
  board.innerHTML = html;

  const done = entriesOfDate.length, total = rows.length;
  const pill = el('today-pill');
  pill.innerHTML = `今天：<b>${state.today}</b> ｜ 查看日期：<b>${date}</b> ｜ 已填报 ${done}/${total} ｜ 创建于 ${state.createdDate}`;
}

el('date-prev').onclick = () => { state.viewDate = shiftDate(state.viewDate, -1); el('view-date').value = state.viewDate; renderBoard(); renderForm(); };
el('date-next').onclick = () => { state.viewDate = shiftDate(state.viewDate, +1); el('view-date').value = state.viewDate; renderBoard(); renderForm(); };
el('date-today').onclick = () => { state.viewDate = state.today; el('view-date').value = state.today; renderBoard(); renderForm(); };
el('view-date').onchange = (e) => { state.viewDate = e.target.value; renderBoard(); renderForm(); };

function shiftDate(s, n) {
  const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

el('btn-copy').onclick = async () => {
  const url = location.origin + '/?id=' + state.chain.id;
  try { await navigator.clipboard.writeText(url); toast('链接已复制：' + url); }
  catch (e) { prompt('复制下面的链接发到群里：', url); }
};

async function reloadDetail() {
  await loadDetail(state.chain.id);
}

// ---------- 管理员面板 ----------
el('nav-admin').onclick = () => openAdmin();
el('nav-create').onclick = () => createChain();
el('nav-home').onclick = () => loadHome();

function openAdmin() {
  el('admin-modal').hidden = false;
  if (state.adminPwd) { el('admin-login').hidden = true; el('admin-body').hidden = false; refreshAdmin(); }
  else { el('admin-login').hidden = false; el('admin-body').hidden = true; }
}
el('admin-close').onclick = () => { el('admin-modal').hidden = true; };
// 点弹层灰色空白处也能关闭
el('admin-modal').onclick = (e) => { if (e.target === el('admin-modal')) el('admin-modal').hidden = true; };
el('admin-login-btn').onclick = () => {
  const pwd = el('admin-pwd').value;
  if (!pwd) { el('admin-login-msg').textContent = '请输入口令'; return; }
  el('admin-login-msg').textContent = '校验中…';
  api('/api/admin/verify', { method: 'POST', body: JSON.stringify({ adminPassword: pwd }) }).then(r => {
    if (r.code !== 0) { el('admin-login-msg').textContent = r.message || '口令错误'; return; }
    state.adminPwd = pwd; sessionStorage.setItem('adminPwd', pwd);
    el('admin-login-msg').textContent = '';
    el('admin-login').hidden = true; el('admin-body').hidden = false; refreshAdmin();
  });
};

// 管理操作都针对“当前打开的接龙”。没打开时给出明确提示，而不是静默报错。
function needChain() {
  if (!state.chain) {
    toast('请先进入一个接龙再操作：关闭本面板 → 点列表里的接龙，或点右上角「＋ 创建接龙」');
    return false;
  }
  return true;
}

// tabs
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.hidden = true);
    t.classList.add('active'); el(t.dataset.tab).hidden = false;
  };
});

// 字段
el('field-add').onclick = async () => {
  if (!needChain()) return;
  const label = el('field-label').value.trim();
  if (!label) { setMsg('field-msg', '请输入字段名', true); return; }
  setMsg('field-msg', '添加中…', false);
  try {
    const r = await api('/api/chains/' + state.chain.id + '/fields', {
      method: 'POST', body: JSON.stringify({ label, type: el('field-type').value, adminPassword: state.adminPwd }),
    });
    if (r.code === 0) {
      el('field-label').value = '';
      await reloadDetail(); renderFields();
      setMsg('field-msg', '✅ 已添加「' + label + '」，共 ' + state.fields.length + ' 个字段', false);
      toast('字段已添加');
    } else { setMsg('field-msg', '❌ ' + (r.message || '添加失败'), true); }
  } catch (e) { setMsg('field-msg', '❌ 添加失败：' + e.message, true); }
};
function renderFields() {
  const box = el('field-list'); box.innerHTML = '';
  (state.fields.length ? state.fields : []).forEach(f => {
    const item = document.createElement('div'); item.className = 'mini-item';
    item.innerHTML = `<span class="lbl ${f.isActive === false ? 'off' : ''}">${esc(f.label)}（${f.type === 'text' ? '文本' : '数字'}${f.required ? '·必填' : ''}）</span>`;
    const btnOff = document.createElement('button'); btnOff.className = 'nav ghost small';
    btnOff.textContent = f.isActive === false ? '启用' : '停用';
    btnOff.onclick = async () => {
      await api(`/api/chains/${state.chain.id}/fields/${f.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !(f.isActive !== false), adminPassword: state.adminPwd }) });
      await reloadDetail(); renderFields();
    };
    const btnDel = document.createElement('button'); btnDel.className = 'x'; btnDel.textContent = '✕';
    btnDel.onclick = async () => {
      if (!confirm('确认删除字段「' + f.label + '」？历史记录中该列仍保留。')) return;
      await api(`/api/chains/${state.chain.id}/fields/${f.id}`, { method: 'DELETE', body: JSON.stringify({ adminPassword: state.adminPwd }) });
      await reloadDetail(); renderFields();
    };
    item.appendChild(btnOff); item.appendChild(btnDel); box.appendChild(item);
  });
}

// 员工
el('emp-import-btn').onclick = async () => {
  if (!needChain()) return;
  const names = el('emp-import').value.split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
  if (!names.length) { setMsg('emp-msg', '请粘贴姓名（每行一个）', true); return; }
  setMsg('emp-msg', '导入中…', false);
  try {
    const r = await api('/api/chains/' + state.chain.id + '/employees', {
      method: 'POST', body: JSON.stringify({ names, adminPassword: state.adminPwd }),
    });
    if (r.code === 0) {
      el('emp-import').value = '';
      await reloadDetail(); renderEmployees();
      setMsg('emp-msg', '✅ 本次新增 ' + r.data.count + ' 人，当前名单共 ' + state.employees.length + ' 人', false);
      toast('已导入 ' + r.data.count + ' 人');
    } else { setMsg('emp-msg', '❌ ' + (r.message || '导入失败'), true); }
  } catch (e) { setMsg('emp-msg', '❌ 导入失败：' + e.message, true); }
};
function renderEmployees() {
  const box = el('emp-list'); box.innerHTML = '';
  state.employees.forEach(e => {
    const item = document.createElement('div'); item.className = 'mini-item';
    const inp = document.createElement('input'); inp.value = e.name; inp.disabled = e.isActive === false;
    const btnRename = document.createElement('button'); btnRename.className = 'nav ghost small'; btnRename.textContent = '改名';
    btnRename.onclick = async () => {
      const nn = inp.value.trim(); if (!nn) return;
      await api(`/api/chains/${state.chain.id}/employees/${e.id}`, { method: 'PATCH', body: JSON.stringify({ name: nn, adminPassword: state.adminPwd }) });
      await reloadDetail(); renderEmployees();
    };
    const btnDel = document.createElement('button'); btnDel.className = 'x'; btnDel.textContent = '✕';
    btnDel.onclick = async () => {
      if (!confirm('移除「' + e.name + '」？其已提交记录仍保留。')) return;
      await api(`/api/chains/${state.chain.id}/employees/${e.id}`, { method: 'DELETE', body: JSON.stringify({ adminPassword: state.adminPwd }) });
      await reloadDetail(); renderEmployees();
    };
    item.appendChild(inp); item.appendChild(btnRename); item.appendChild(btnDel); box.appendChild(item);
  });
}

// 记录（按日期）
async function renderRecords() {
  const box = el('rec-list'); box.innerHTML = '加载中…';
  const date = state.recDate;
  const list = state.entries.filter(e => e.entryDate === date);
  if (!list.length) { box.innerHTML = '<div class="muted small">该日期暂无记录</div>'; return; }
  box.innerHTML = '';
  list.forEach(ent => {
    const item = document.createElement('div'); item.className = 'mini-item';
    const summary = state.fields.map(f => `${esc(f.label)}:${ent.values && ent.values[f.id] != null ? ent.values[f.id] : '-'}`).join(' ');
    item.innerHTML = `<span class="lbl">${esc(ent.employeeName)}<br><span class="small muted">${summary}</span></span>`;
    const btnEdit = document.createElement('button'); btnEdit.className = 'nav ghost small'; btnEdit.textContent = '修改';
    btnEdit.onclick = () => editRecord(ent);
    const btnDel = document.createElement('button'); btnDel.className = 'x'; btnDel.textContent = '✕';
    btnDel.onclick = async () => {
      if (!confirm('删除该条记录？')) return;
      await api(`/api/chains/${state.chain.id}/entries/${ent.id}`, { method: 'DELETE', body: JSON.stringify({ adminPassword: state.adminPwd }) });
      await reloadDetail(); renderRecords();
    };
    item.appendChild(btnEdit); item.appendChild(btnDel); box.appendChild(item);
  });
}
function editRecord(ent) {
  // 收集新值（含取消 / 必填校验），见 common.js 的 collectEditValues
  const res = AppCommon.collectEditValues(state.fields, ent.values || {}, (m, d) => prompt(m, d));
  if (res.cancel) return; // 用户取消，整条放弃
  if (res.error) { toast(res.error); return; }
  api(`/api/chains/${state.chain.id}/entries/${ent.id}`, { method: 'PATCH', body: JSON.stringify({ values: res.values, adminPassword: state.adminPwd }) })
    .then(r => {
      if (r.code !== 0) { toast(r.message || '修改失败'); return; }
      toast('已修改'); reloadDetail().then(() => renderRecords());
    })
    .catch(e => toast('修改失败：' + e.message));
}
el('rec-prev').onclick = () => { state.recDate = shiftDate(state.recDate, -1); el('rec-date').value = state.recDate; renderRecords(); };
el('rec-next').onclick = () => { state.recDate = shiftDate(state.recDate, +1); el('rec-date').value = state.recDate; renderRecords(); };
el('rec-date').onchange = (e) => { state.recDate = e.target.value; renderRecords(); };

// 批量导入 CSV（历史数据补录）
el('btn-show-import').onclick = () => { el('import-panel').hidden = !el('import-panel').hidden; };
el('import-cancel').onclick = () => { el('import-panel').hidden = true; };
el('import-file').onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  const info = el('import-file-info');
  if (!file) return;
  try {
    // 必须按二进制读再自行解码：Excel 中文版另存 CSV 默认 GBK，
    // 直接 file.text() 会按 UTF-8 解析成乱码，表头匹配必然失败
    const buf = await file.arrayBuffer();
    const { text, encoding } = AppCommon.decodeCsvBuffer(buf);
    el('import-text').value = text;
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    const head = (lines[0] || '').slice(0, 80);
    info.className = 'ok';
    info.textContent = `已读取：${file.name}（${(file.size / 1024).toFixed(0)} KB，编码 ${encoding}），共 ${Math.max(0, lines.length - 1)} 行数据。表头：${head}`;
    toast('已读取文件，点「开始导入」');
  } catch (err) {
    info.className = 'err';
    info.textContent = '读取文件失败：' + err.message;
    toast('读取文件失败：' + err.message);
  }
};
el('btn-import').onclick = async () => {
  if (!needChain()) return;
  const csv = (el('import-text').value || '').trim();
  if (!csv) { toast('请先选择文件或粘贴 CSV 内容'); return; }
  const box = el('import-msg');
  box.className = 'msg';
  box.textContent = '导入中…（数据多时请稍候，勿关闭页面）';
  try {
    const r = await api(`/api/chains/${state.chain.id}/entries/import`, {
      method: 'POST',
      body: JSON.stringify({
        csv,
        adminPassword: state.adminPwd,
        autoCreateFields: !!(el('import-autofield') && el('import-autofield').checked),
      }),
    });
    if (r.code !== 0) {
      box.className = 'msg err';
      box.textContent = '失败：' + (r.message || '未知错误') +
        (r.data && r.data.warnings && r.data.warnings.length ? '（' + r.data.warnings.join('；') + '）' : '');
      return;
    }
    const d = r.data || {};
    const parts = [`✅ 成功导入 ${d.success} 条`];
    if (d.total && d.total !== d.success) parts.push(`共解析 ${d.total} 条`);
    if (d.minDate && d.maxDate) parts.push(`日期范围 ${d.minDate} ~ ${d.maxDate}`);
    if (d.createdFields && d.createdFields.length) parts.push(`新建字段：${d.createdFields.join('、')}`);
    if (d.employeesAdded && d.employeesAdded.length) parts.push(`新增员工：${d.employeesAdded.join('、')}`);
    if (d.errors && d.errors.length) parts.push(`❌ 跳过 ${d.errors.length} 条：${d.errors.slice(0, 5).join('；')}${d.errors.length > 5 ? ' …' : ''}`);
    if (d.warnings && d.warnings.length) parts.push(`提示：${d.warnings.join('；')}`);
    box.className = 'msg ' + (d.errors && d.errors.length ? 'err' : 'ok');
    box.textContent = parts.join('；');
    await reloadDetail();
    // 导入后停在数据的最新一天，方便立刻确认导入结果
    if (d.maxDate) { state.recDate = d.maxDate; el('rec-date').value = d.maxDate; }
    renderRecords();
  } catch (e) { box.className = 'msg err'; box.textContent = '导入失败：' + e.message; }
};

// 设置
el('btn-toggle-status').onclick = async () => {
  if (!needChain()) return;
  const next = state.chain.status === 'open' ? 'closed' : 'open';
  try {
    const r = await api(`/api/chains/${state.chain.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next, adminPassword: state.adminPwd }) });
    if (r.code !== 0) { toast(r.message || '切换失败'); return; }
    await reloadDetail(); refreshAdmin();
    toast(next === 'open' ? '已重新开启，员工可填报' : '已关闭，员工暂停填报');
  } catch (e) { toast('切换失败：' + e.message); }
};
el('btn-export').onclick = () => {
  if (!needChain()) return;
  const url = `/api/chains/${state.chain.id}/export?adminPassword=${encodeURIComponent(state.adminPwd)}`;
  window.open(url, '_blank');
  toast('CSV 已开始下载（创建日→今天）');
};
el('btn-delete-chain').onclick = async () => {
  if (!needChain()) return;
  if (!confirm('确认删除整个接龙「' + state.chain.title + '」（含所有记录）？此操作不可恢复。')) return;
  try {
    const r = await api('/api/chains/' + state.chain.id, { method: 'DELETE', body: JSON.stringify({ adminPassword: state.adminPwd }) });
    if (r.code === 0) { toast('接龙已删除'); el('admin-modal').hidden = true; await loadHome(); }
    else toast(r.message || '删除失败');
  } catch (e) { toast('删除失败：' + e.message); }
};

function refreshAdmin() {
  const noChain = !state.chain;
  el('admin-nochain').hidden = !noChain;
  el('admin-body').querySelector('.tabs').style.display = noChain ? 'none' : '';
  document.querySelectorAll('.tab-pane').forEach(p => { p.style.display = noChain ? 'none' : ''; });
  if (noChain) return;
  renderFields(); renderEmployees(); renderRecords();
  el('rec-date').value = state.recDate;
  // 开关按钮文字随当前状态变化，并显示状态说明
  const closed = state.chain.status === 'closed';
  el('btn-toggle-status').textContent = closed ? '重新开启接龙' : '关闭接龙（暂停填报）';
  el('status-hint').textContent = closed
    ? '当前状态：已关闭 —— 员工无法提交（已提交数据保留）。'
    : '当前状态：进行中 —— 员工可正常填报。';
}

// ---------- 启动 ----------
const params = new URLSearchParams(location.search);
const chainId = params.get('id');
if (chainId) loadDetail(chainId);
else loadHome();
