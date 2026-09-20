// 时间格式化工具（后端用，纯函数）。
// 数据库的 created_at / updated_at 是 timestamptz，存的是 UTC 时刻。
// 展示给中国用户时必须显式转换成「北京时间 (Asia/Shanghai, UTC+8)」，
// 否则会直接把 UTC 的时分秒显示出来，看起来比实际晚 8 小时。
//
// 注意：这里只负责「展示格式化」，不动存储。数据库继续存 UTC（timestamptz 的最佳实践），
// 展示层统一在 Node 端转北京时间即可。

function fmtDateCN(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // en-CA 输出 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
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

module.exports = { fmtDateCN, fmtDateTimeCN };
