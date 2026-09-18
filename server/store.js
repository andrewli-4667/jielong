// 极简存储层：内存结构 + 防抖落盘到 JSON 文件。
// 适合中小规模群接龙；量大时可在 README 指引下迁移到 SQLite / 云数据库。
const fs = require('fs');
const config = require('./config');

const data = { chains: [], entries: [] };

function load() {
  try {
    if (fs.existsSync(config.dataFile)) {
      const raw = fs.readFileSync(config.dataFile, 'utf-8');
      const parsed = JSON.parse(raw);
      data.chains = Array.isArray(parsed.chains) ? parsed.chains : [];
      data.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    }
  } catch (e) {
    console.error('[store] 加载数据失败，使用空数据：', e.message);
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(config.dataFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[store] 保存数据失败：', e.message);
    }
  }, 100);
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map(f => ({
      key: String(f.key || '').trim(),
      label: String(f.label || f.key || '').trim(),
      type: (f.type === 'number' ? 'number' : 'text'),
    }))
    .filter(f => f.key);
}

const store = {
  createChain({ title, description, options, fields, deadline, creator }) {
    const chain = {
      id: uid('c'),
      title,
      description: description || '',
      options: Array.isArray(options) && options.length
        ? options.map(o => String(o).trim()).filter(Boolean)
        : ['参加', '不参加'],
      fields: normalizeFields(fields),
      deadline: deadline || null,
      creator: creator || '',
      createdAt: new Date().toISOString(),
    };
    data.chains.push(chain);
    save();
    return chain;
  },

  getChain(id) {
    return data.chains.find(c => c.id === id) || null;
  },

  listChains() {
    return data.chains
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  addEntry({ chainId, userId, userName, answers }) {
    const entry = {
      id: uid('e'),
      chainId,
      userId,
      userName,
      answers: answers || {},
      createdAt: new Date().toISOString(),
    };
    data.entries.push(entry);
    save();
    return entry;
  },

  getEntries(chainId) {
    return data.entries
      .filter(e => e.chainId === chainId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  hasEntry(chainId, userId) {
    return data.entries.some(e => e.chainId === chainId && e.userId === userId);
  },

  // 按选项计数 + 汇总自定义字段
  getStats(chain) {
    const entries = this.getEntries(chain.id);
    const stats = { total: entries.length, options: {}, fields: {} };
    (chain.options || []).forEach(opt => { stats.options[opt] = 0; });
    (chain.fields || []).forEach(f => { stats.fields[f.key] = []; });
    entries.forEach(e => {
      const ans = e.answers || {};
      if (ans.option !== undefined && stats.options[ans.option] !== undefined) {
        stats.options[ans.option] += 1;
      }
      (chain.fields || []).forEach(f => {
        if (ans[f.key] !== undefined && ans[f.key] !== '') {
          stats.fields[f.key].push({ name: e.userName, value: ans[f.key] });
        }
      });
    });
    return stats;
  },
};

load();

module.exports = store;
