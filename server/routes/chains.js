// 接龙相关路由
const express = require('express');
const router = express.Router();
const store = require('../store');
const config = require('../config');

// 列表（含参与人数）
router.get('/', (req, res) => {
  const chains = store.listChains().map(c => ({
    id: c.id,
    title: c.title,
    description: c.description,
    deadline: c.deadline,
    createdAt: c.createdAt,
    participantCount: store.getEntries(c.id).length,
  }));
  res.json({ code: 0, data: chains });
});

// 创建接龙
router.post('/', (req, res) => {
  const { title, description, options, fields, deadline, creator } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.json({ code: 1, message: '标题不能为空' });
  }
  const chain = store.createChain({
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    options,
    fields,
    deadline: deadline || null,
    creator: creator || '',
  });
  const shareUrl = `${req.protocol}://${req.get('host')}/?id=${chain.id}`;
  res.json({ code: 0, data: { ...chain, shareUrl } });
});

// 接龙详情（含记录与统计）
router.get('/:id', (req, res) => {
  const chain = store.getChain(req.params.id);
  if (!chain) return res.json({ code: 1, message: '接龙不存在' });
  const entries = store.getEntries(chain.id);
  const stats = store.getStats(chain);
  const closed = !!(chain.deadline && new Date(chain.deadline).getTime() < Date.now());
  res.json({ code: 0, data: { chain, entries, stats, closed } });
});

// 加入 / 接龙
router.post('/:id/entries', (req, res) => {
  const chain = store.getChain(req.params.id);
  if (!chain) return res.json({ code: 1, message: '接龙不存在' });

  const { userId, userName, answers } = req.body || {};
  if (!userId) return res.json({ code: 1, message: '缺少用户标识' });
  if (!userName || !String(userName).trim()) return res.json({ code: 1, message: '请填写姓名' });

  if (chain.deadline && new Date(chain.deadline).getTime() < Date.now()) {
    return res.json({ code: 2, message: '接龙已截止' });
  }
  if (store.hasEntry(chain.id, userId)) {
    return res.json({ code: 3, message: '你已经接过龙了' });
  }

  // 校验选项合法性
  const ans = answers || {};
  if (ans.option !== undefined && !chain.options.includes(ans.option)) {
    return res.json({ code: 1, message: '非法的选项' });
  }

  const entry = store.addEntry({
    chainId: chain.id,
    userId,
    userName: String(userName).trim(),
    answers: ans,
  });
  res.json({ code: 0, data: entry });
});

// 导出 CSV（带 UTF-8 BOM，Excel 直接可读）
router.get('/:id/export', (req, res) => {
  const chain = store.getChain(req.params.id);
  if (!chain) return res.json({ code: 1, message: '接龙不存在' });
  const entries = store.getEntries(chain.id);

  const headers = [
    '姓名',
    ...(chain.options || []).map(o => `选项:${o}`),
    ...(chain.fields || []).map(f => f.label || f.key),
    '接龙时间',
  ];
  const rows = entries.map(e => {
    const ans = e.answers || {};
    return [
      e.userName,
      ans.option || '',
      ...(chain.fields || []).map(f => ans[f.key] || ''),
      e.createdAt,
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
});

// 小程序登录：code 换 openid。未配置 AppSecret 时返回演示 openid。
router.post('/login', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.json({ code: 1, message: '缺少 code' });

  if (!config.wxAppId || !config.wxAppSecret) {
    return res.json({ code: 0, data: { openid: 'demo_' + code, demo: true } });
  }
  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wxAppId}` +
      `&secret=${config.wxAppSecret}&js_code=${code}&grant_type=authorization_code`;
    const r = await fetch(url);
    const json = await r.json();
    if (json.openid) return res.json({ code: 0, data: { openid: json.openid } });
    return res.json({ code: 1, message: json.errmsg || '登录失败', wx: json });
  } catch (e) {
    return res.json({ code: 1, message: '请求微信失败: ' + e.message });
  }
});

module.exports = router;
