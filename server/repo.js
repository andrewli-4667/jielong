// 数据访问层：所有读写都走 Supabase（Postgres）。
// 表结构见 sql/schema.sql。本文件只负责 SQL 调用，不含业务逻辑。
const { supabase } = require('./db');
const { fmtDateCN, fmtDateTimeCN } = require('./timeutil');

// 中国时区（Asia/Shanghai）今天的日期字符串 YYYY-MM-DD
function todayCN() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return f.format(new Date()); // en-CA 输出 YYYY-MM-DD
}

function nowCN() {
  // 数据库 timestamptz 存 UTC，直接写当前 UTC 时刻即可；展示层统一转北京时间
  return new Date().toISOString();
}

async function assertSupabase() {
  if (!supabase) throw new Error('数据库未连接（缺少 SUPABASE_URL / SUPABASE_KEY）');
}

// ---------- 接龙 ----------
async function listChains() {
  await assertSupabase();
  const { data, error } = await supabase
    .from('chains').select('id,title,status,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id, title: c.title, status: c.status, createdAt: c.created_at,
  }));
}

async function createChain({ title }) {
  await assertSupabase();
  const { data, error } = await supabase
    .from('chains').insert({ title }).select('id,title,status,created_at').single();
  if (error) throw error;
  return { id: data.id, title: data.title, status: data.status, createdAt: data.created_at };
}

async function getChain(id) {
  await assertSupabase();
  const { data, error } = await supabase
    .from('chains').select('id,title,status,created_at').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, title: data.title, status: data.status, createdAt: data.created_at } : null;
}

async function setChainStatus(id, status) {
  await assertSupabase();
  const { data, error } = await supabase
    .from('chains').update({ status }).eq('id', id)
    .select('id,status').single();
  if (error) throw error;
  return { id: data.id, status: data.status };
}

// 改接龙标题（管理）
async function updateChain(id, { title }) {
  await assertSupabase();
  const { data, error } = await supabase
    .from('chains').update({ title }).eq('id', id)
    .select('id,title,status,created_at').single();
  if (error) throw error;
  return { id: data.id, title: data.title, status: data.status, createdAt: data.created_at };
}

// 删除整个接龙（级联删除其字段/员工/记录）
async function deleteChain(id) {
  await assertSupabase();
  const { error } = await supabase.from('chains').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ---------- 字段（可增删改） ----------
async function listFields(chainId, includeInactive = false) {
  await assertSupabase();
  let q = supabase.from('fields').select('*').eq('chain_id', chainId);
  if (!includeInactive) q = q.eq('is_active', true);
  q = q.order('sort_order', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(f => ({
    id: f.id, label: f.label, type: f.type, required: f.required,
    options: f.options, sortOrder: f.sort_order, isActive: f.is_active,
  }));
}

async function addField(chainId, { label, type = 'number', required = true, options = null }) {
  await assertSupabase();
  const { count } = await supabase.from('fields').select('*', { count: 'exact', head: true }).eq('chain_id', chainId);
  const { data, error } = await supabase.from('fields')
    .insert({ chain_id: chainId, label, type, required, options, sort_order: count || 0 })
    .select('*').single();
  if (error) throw error;
  return data;
}

async function updateField(chainId, fieldId, patch) {
  await assertSupabase();
  const { data, error } = await supabase.from('fields')
    .update(patch).eq('id', fieldId).eq('chain_id', chainId).select('*').single();
  if (error) throw error;
  return data;
}

async function deleteField(chainId, fieldId) {
  await assertSupabase();
  const { error } = await supabase.from('fields').delete().eq('id', fieldId).eq('chain_id', chainId);
  if (error) throw error;
  return true;
}

// ---------- 员工（名单，可增减） ----------
async function listEmployees(chainId, includeInactive = false) {
  await assertSupabase();
  let q = supabase.from('employees').select('*').eq('chain_id', chainId);
  if (!includeInactive) q = q.eq('is_active', true);
  q = q.order('sort_order', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(e => ({ id: e.id, name: e.name, sortOrder: e.sort_order, isActive: e.is_active }));
}

async function addEmployees(chainId, names) {
  await assertSupabase();
  const { count } = await supabase.from('employees').select('*', { count: 'exact', head: true }).eq('chain_id', chainId);
  const rows = names.map((n, i) => ({ chain_id: chainId, name: n, sort_order: (count || 0) + i }));
  const { data, error } = await supabase.from('employees').insert(rows).select('*');
  if (error) throw error;
  return (data || []).map(e => ({ id: e.id, name: e.name }));
}

async function updateEmployee(chainId, empId, patch) {
  await assertSupabase();
  const { data, error } = await supabase.from('employees')
    .update(patch).eq('id', empId).eq('chain_id', chainId).select('*').single();
  if (error) throw error;
  return data;
}

async function deleteEmployee(chainId, empId) {
  await assertSupabase();
  const { error } = await supabase.from('employees').delete().eq('id', empId).eq('chain_id', chainId);
  if (error) throw error;
  return true;
}

// ---------- 记录（每人每天一条） ----------
// 返回某接龙全部记录（前端按日期/员工自行组织）
async function listEntries(chainId) {
  await assertSupabase();
  const { data, error } = await supabase
    .from('entries').select('*').eq('chain_id', chainId).order('entry_date', { ascending: true });
  if (error) throw error;
  return (data || []).map(e => ({
    id: e.id, employeeId: e.employee_id, employeeName: e.employee_name,
    entryDate: e.entry_date, values: e.values, createdAt: e.created_at, updatedAt: e.updated_at,
  }));
}

// 员工提交/当天修改：以 (chain, employee_name, date) 唯一，存在则更新
async function upsertEntry(chainId, { employeeId, employeeName, entryDate, values }) {
  await assertSupabase();
  const row = {
    chain_id: chainId, employee_id: employeeId || null,
    employee_name: employeeName, entry_date: entryDate, values,
  };
  const { data, error } = await supabase.from('entries')
    .upsert(row, { onConflict: 'chain_id,employee_name,entry_date' })
    .select('*').single();
  if (error) throw error;
  return {
    id: data.id, employeeId: data.employee_id, employeeName: data.employee_name,
    entryDate: data.entry_date, values: data.values, createdAt: data.created_at, updatedAt: data.updated_at,
  };
}

async function updateEntry(chainId, entryId, values) {
  await assertSupabase();
  const { data, error } = await supabase.from('entries')
    .update({ values, updated_at: nowCN() }).eq('id', entryId).eq('chain_id', chainId)
    .select('*').single();
  if (error) throw error;
  return data;
}

async function deleteEntry(chainId, entryId) {
  await assertSupabase();
  const { error } = await supabase.from('entries').delete().eq('id', entryId).eq('chain_id', chainId);
  if (error) throw error;
  return true;
}

// 导出用：日期范围 [from, to]，明细行
async function exportEntries(chainId, from) {
  await assertSupabase();
  let q = supabase.from('entries').select('*').eq('chain_id', chainId);
  if (from) q = q.gte('entry_date', from);
  q = q.order('entry_date', { ascending: true }).order('employee_name', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(e => ({
    id: e.id, employeeName: e.employee_name, entryDate: e.entry_date, values: e.values, createdAt: e.created_at,
  }));
}

module.exports = {
  todayCN, nowCN, fmtDateCN, fmtDateTimeCN,
  listChains, createChain, getChain, setChainStatus, updateChain, deleteChain,
  listFields, addField, updateField, deleteField,
  listEmployees, addEmployees, updateEmployee, deleteEmployee,
  listEntries, upsertEntry, updateEntry, deleteEntry,
  exportEntries,
};
