// 群接龙网页演示页：对接同一套后端 API，用于沙箱验证与无 AppID 时的轻量入口。
const el = (id) => document.getElementById(id);
function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}
async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (j.code === 0) return j.data;
  throw new Error(j.message || '请求失败');
}
async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.code === 0) return j.data;
  throw new Error(j.message || '请求失败');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function show(sec) {
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  el('sec-' + sec).classList.add('active');
}
function setNav(name) {
  document.querySelectorAll('.nav').forEach((b) => b.classList.remove('active'));
  const b = el('nav-' + name);
  if (b) b.classList.add('active');
}

/* ---------- 列表 ---------- */
let kw = '';
el('search').oninput = (e) => { kw = e.target.value; loadList(); };
el('nav-list').onclick = () => { setNav('list'); show('list'); loadList(); };
el('nav-create').onclick = () => { setNav('create'); show('create'); };

async function loadList() {
  try {
    let chains = await getJSON('/api/chains');
    if (kw.trim()) chains = chains.filter((c) => c.title.includes(kw.trim()));
    const box = el('list');
    if (chains.length === 0) {
      box.innerHTML = '<div class="empty">还没有接龙，点右上角「+ 创建」开始吧</div>';
      return;
    }
    box.innerHTML = chains.map((c) => `
      <div class="card item" data-id="${c.id}">
        <div class="item-title">${esc(c.title)}</div>
        <div class="muted">${c.participantCount} 人参与 · ${fmt(c.createdAt)}${c.deadline ? ' · 截止 ' + fmt(c.deadline) : ''}</div>
      </div>`).join('');
    box.querySelectorAll('.item').forEach((it) => { it.onclick = () => openDetail(it.dataset.id); });
  } catch (e) { toast(e.message); }
}

/* ---------- 创建 ---------- */
function newOptionRow(val) {
  const d = document.createElement('div');
  d.className = 'opt-row';
  d.innerHTML = `<input class="input flex1" placeholder="选项名" value="${esc(val || '')}" /><button class="del">删除</button>`;
  d.querySelector('.del').onclick = () => d.remove();
  return d;
}
function newFieldRow() {
  const d = document.createElement('div');
  d.className = 'opt-row';
  d.innerHTML = `<input class="input flex1" placeholder="字段名，如：携带人数" /><select class="type"><option value="text">文本</option><option value="number">数字</option></select><button class="del">删除</button>`;
  d.querySelector('.del').onclick = () => d.remove();
  return d;
}
function initCreate() {
  const o = el('c-options');
  o.innerHTML = '';
  ['参加', '不参加'].forEach((v) => o.appendChild(newOptionRow(v)));
  el('c-add-opt').onclick = () => o.appendChild(newOptionRow(''));
  const f = el('c-fields');
  f.innerHTML = '';
  el('c-add-field').onclick = () => f.appendChild(newFieldRow());
}
el('c-submit').onclick = async () => {
  const title = el('c-title').value.trim();
  if (!title) { toast('请填写标题'); return; }
  const options = [...el('c-options').querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
  if (options.length === 0) { toast('至少保留一个选项'); return; }
  const fields = [...el('c-fields').querySelectorAll('.opt-row')].map((row) => {
    const inp = row.querySelector('input');
    return { key: inp.value.trim(), label: inp.value.trim(), type: row.querySelector('.type').value };
  }).filter((f) => f.key);
  try {
    const chain = await postJSON('/api/chains', { title, description: el('c-desc').value, options, fields, deadline: el('c-deadline').value || null });
    toast('创建成功');
    openDetail(chain.id);
  } catch (e) { toast(e.message); }
};

/* ---------- 详情 ---------- */
let detailId = '';
let pollTimer = null;

function buildAns(answers, chain) {
  const a = answers || {};
  const p = [];
  if (a.option) p.push(a.option);
  (chain.fields || []).forEach((f) => { if (a[f.key]) p.push(`${f.label}:${a[f.key]}`); });
  return p.join(' · ');
}

async function openDetail(id) {
  detailId = id;
  setNav('list');
  show('detail');
  await fullRender();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollRefresh, 3000);
}

async function fullRender() {
  try {
    const { chain, entries, stats, closed } = await getJSON('/api/chains/' + detailId);
    const me = localStorage.getItem('jl_uid');
    const myEntry = entries.find((e) => e.userId === me);

    let html = `<div class="card"><div class="d-title">${esc(chain.title)}</div>`;
    if (chain.description) html += `<div class="muted" style="margin-top:8px">${esc(chain.description)}</div>`;
    html += `<div class="muted" style="margin-top:8px">共 ${stats.total} 人参与 ${closed ? '· 已截止' : (chain.deadline ? '· 截止 ' + fmt(chain.deadline) : '')}</div></div>`;

    html += `<div class="card" id="d-stats"><div class="sec">统计</div>`;
    html += statsHtml(chain, stats) + `</div>`;

    if (!closed && !myEntry) {
      let f = `<div class="card"><div class="sec">我要接龙</div>`;
      f += `<input id="d-name" class="input" placeholder="你的姓名" value="${esc(localStorage.getItem('jl_name') || '')}" />`;
      f += `<div class="opt-group">`;
      (chain.options || []).forEach((o) => { f += `<button class="chip" data-v="${esc(o)}">${esc(o)}</button>`; });
      f += `</div><div id="d-fields">`;
      (chain.fields || []).forEach((fl) => {
        f += `<div class="field-row"><span class="field-name">${esc(fl.label)}</span><input class="input flex1" data-k="${esc(fl.key)}" type="${fl.type === 'number' ? 'number' : 'text'}" placeholder="填写${esc(fl.label)}" /></div>`;
      });
      f += `</div><button class="primary" id="d-submit">提交接龙</button></div>`;
      html += f;
    } else if (myEntry) {
      html += `<div class="card tip">你已接龙：${esc(buildAns(myEntry.answers, chain))}</div>`;
    } else if (closed) {
      html += `<div class="card tip">接龙已截止，以下是最终结果</div>`;
    }

    html += `<div class="card" id="d-list"><div class="sec">接龙名单（${stats.total}）</div>`;
    html += listHtml(chain, entries) + `</div>`;

    el('detail').innerHTML = html;

    if (!closed && !myEntry) {
      el('detail').querySelectorAll('.chip').forEach((ch) => {
        ch.onclick = () => {
          el('detail').querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
          ch.classList.add('active');
        };
      });
      el('d-submit').onclick = submitEntry;
    }
  } catch (e) { toast(e.message); }
}

function statsHtml(chain, stats) {
  return (chain.options || []).map((name) => {
    const c = stats.options[name] || 0;
    const pct = stats.total ? Math.round((c / stats.total) * 100) : 0;
    return `<div class="stat-row"><span class="stat-name">${esc(name)}</span><span class="bar-bg"><span class="bar" style="width:${pct}%"></span></span><span class="stat-num">${c}</span></div>`;
  }).join('') || '<div class="muted">无选项</div>';
}
function listHtml(chain, entries) {
  if (entries.length === 0) return '<div class="muted">还没有人接龙</div>';
  return entries.slice().reverse().map((e) => {
    const txt = buildAns(e.answers, chain);
    return `<div class="entry"><div class="entry-head"><b>${esc(e.userName)}</b><span class="muted">${fmt(e.createdAt)}</span></div>${txt ? `<div class="muted">${esc(txt)}</div>` : ''}</div>`;
  }).join('');
}

// 轮询只刷新统计与名单，不打断正在填写的表单
async function pollRefresh() {
  try {
    const { chain, entries, stats, closed } = await getJSON('/api/chains/' + detailId);
    const me = localStorage.getItem('jl_uid');
    const joined = entries.some((e) => e.userId === me);
    const sBox = el('d-stats');
    const lBox = el('d-list');
    if (sBox) sBox.innerHTML = `<div class="sec">统计</div>` + statsHtml(chain, stats);
    if (lBox) lBox.innerHTML = `<div class="sec">接龙名单（${stats.total}）</div>` + listHtml(chain, entries);
    if ((closed || joined) && !el('detail').querySelector('.tip')) fullRender();
  } catch (e) { /* 忽略轮询错误 */ }
}

async function submitEntry() {
  const name = el('d-name').value.trim();
  if (!name) { toast('请填写姓名'); return; }
  const active = el('detail').querySelector('.chip.active');
  if (!active) { toast('请选择一个选项'); return; }
  const option = active.dataset.v;
  let uid = localStorage.getItem('jl_uid');
  if (!uid) { uid = 'web_' + Math.random().toString(36).slice(2); localStorage.setItem('jl_uid', uid); }
  localStorage.setItem('jl_name', name);
  const answers = { option };
  el('detail').querySelectorAll('[data-k]').forEach((inp) => { if (inp.value.trim()) answers[inp.dataset.k] = inp.value.trim(); });
  try {
    await postJSON('/api/chains/' + detailId + '/entries', { userId: uid, userName: name, answers });
    toast('接龙成功');
    fullRender();
  } catch (e) { toast(e.message); }
}

el('d-copy').onclick = () => {
  const link = location.origin + '/?id=' + detailId;
  navigator.clipboard.writeText(link).then(() => toast('链接已复制')).catch(() => toast('复制失败'));
};
el('d-export').onclick = () => { window.location.href = '/api/chains/' + detailId + '/export'; };
el('d-back').onclick = () => { if (pollTimer) clearInterval(pollTimer); setNav('list'); show('list'); loadList(); };

/* ---------- 初始化 ---------- */
window.addEventListener('DOMContentLoaded', () => {
  initCreate();
  const params = new URLSearchParams(location.search);
  if (params.get('id')) openDetail(params.get('id'));
  else loadList();
});
