// 服务端配置。部署时通过环境变量覆盖即可，无需改代码。
const path = require('path');

module.exports = {
  // 监听端口
  port: process.env.PORT || 3000,

  // 微信登录（openid 换取）所需的 AppID / AppSecret。
  // 不填时 /api/login 返回演示用 openid（demo 模式）。
  wxAppId: process.env.WX_APPID || '',
  wxAppSecret: process.env.WX_APPSECRET || '',

  // 数据持久化文件路径（JSON 落盘）
  dataFile: path.join(__dirname, 'data', 'db.json'),

  // CORS 允许的源。演示用 '*'；部署到微信时建议改为你的前端/小程序域名。
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Supabase（数据库）：两个值来自 Supabase → Project Settings → API
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || '',

  // 管理员口令：管理操作（建接龙/导名单/改字段/删记录/导出）需要它
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
};
