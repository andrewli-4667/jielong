// 员工每日业务达成接龙 · 前端逻辑（原生 JS，对接 /api/chains）
const el = (id) => document.getElementById(id);
function toast(msg) {
  const t = el('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
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
      <div class="sub">创建于 ${esc((c.createdAt||'').slice(0,10))} · ${c.status === 'closed' ? '已关闭' : '进行中'}</div></div>
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
      html += `<td>${esc((ent.createdAt||'').replace('T',' ').slice(11,19))}</td>`;
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
el('admin-login-btn').onclick = () => {
  const pwd = el('admin-pwd').value;
  if (!pwd) { el('admin-login-msg').textContent = '请输入口令'; return; }
  api('/api/admin/verify', { method: 'POST', body: JSON.stringify({ adminPassword: pwd }) }).then(r => {
    if (r.code !== 0) { el('admin-login-msg').textContent = r.message || '口令错误'; return; }
    state.adminPwd = pwd; sessionStorage.setItem('adminPwd', pwd);
    el('admin-login').hidden = true; el('admin-body').hidden = false; refreshAdmin();
  });
};

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
  const label = el('field-label').value.trim();
  if (!label) { toast('请输入字段名'); return; }
  const r = await api('/api/chains/' + state.chain.id + '/fields', {
    method: 'POST', body: JSON.stringify({ label, type: el('field-type').value, adminPassword: state.adminPwd }),
  });
  if (r.code === 0) { el('field-label').value = ''; toast('字段已添加'); await reloadDetail(); renderFields(); }
  else toast(r.message || '失败');
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
  const names = el('emp-import').value.split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
  if (!names.length) { toast('请粘贴姓名'); return; }
  const r = await api('/api/chains/' + state.chain.id + '/employees', {
    method: 'POST', body: JSON.stringify({ names, adminPassword: state.adminPwd }),
  });
  if (r.code === 0) { el('emp-import').value = ''; toast('已导入 ' + r.data.count + ' 人'); await reloadDetail(); renderEmployees(); }
  else toast(r.message || '导入失败');
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
  const vals = ent.values || {};
  const line = state.fields.map(f => {
    const cur = vals[f.id] != null ? vals[f.id] : '';
    const nv = prompt(`${f.label}${f.required ? '（必填）' : ''}：`, cur);
    return { f, nv };
  });
  if (nv === null) return; // 取消
  const values = {}; let bad = false;
  line.forEach(({ f, nv }) => {
    if (f.required && (nv === null || nv.trim() === '')) { bad = true; return; }
    values[f.id] = f.type === 'number' ? (nv === '' ? 0 : Number(nv)) : nv;
  });
  if (bad) { toast('必填项不能为空'); return; }
  api(`/api/chains/${state.chain.id}/entries/${ent.id}`, { method: 'PATCH', body: JSON.stringify({ values, adminPassword: state.adminPwd }) })
    .then(async () => { toast('已修改'); await reloadDetail(); renderRecords(); });
}
el('rec-prev').onclick = () => { state.recDate = shiftDate(state.recDate, -1); el('rec-date').value = state.recDate; renderRecords(); };
el('rec-next').onclick = () => { state.recDate = shiftDate(state.recDate, +1); el('rec-date').value = state.recDate; renderRecords(); };
el('rec-date').onchange = (e) => { state.recDate = e.target.value; renderRecords(); };

// 设置
el('btn-toggle-status').onclick = async () => {
  const next = state.chain.status === 'open' ? 'closed' : 'open';
  await api(`/api/chains/${state.chain.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next, adminPassword: state.adminPwd }) });
  await reloadDetail(); refreshAdmin(); toast('已切换为' + (next === 'open' ? '进行中' : '已关闭'));
};
el('btn-export').onclick = () => {
  const url = `/api/chains/${state.chain.id}/export?adminPassword=${encodeURIComponent(state.adminPwd)}`;
  window.open(url, '_blank');
  toast('CSV 已开始下载（创建日→今天）');
};
el('btn-delete-chain').onclick = async () => {
  if (!confirm('确认删除整个接龙（含所有记录）？此操作不可恢复。')) return;
  // 删除走管理员：复用 status 接口不合适，这里用简单提示（如需可加 DELETE 接口）
  toast('删除请到 Supabase 或联系开发者；当前已隐藏删除按钮以防误删');
};

function refreshAdmin() {
  renderFields(); renderEmployees(); renderRecords();
  el('rec-date').value = state.recDate;
}

// ---------- 启动 ----------
const params = new URLSearchParams(location.search);
const chainId = params.get('id');
if (chainId) loadDetail(chainId);
else loadHome();
