// Supabase 客户端封装（数据真正存储在这里，重启不丢）
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

// 未配置环境变量时先不创建客户端，避免启动时崩溃（部署后填环境变量即生效）
let supabase = null;
if (config.supabaseUrl && config.supabaseKey) {
  supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else {
  console.warn('[db] 未配置 SUPABASE_URL / SUPABASE_KEY，接口将返回“数据库未连接”，请在环境变量补上后重启');
}

module.exports = { supabase };
