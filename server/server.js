// 入口：启动 Express 服务，挂载 API 与静态演示页
const express = require('express');
const path = require('path');
const config = require('./config');
const chainsRouter = require('./routes/chains');

const app = express();
app.use(express.json());

// CORS（演示开放，部署时改 config.corsOrigin 为具体域名）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', config.corsOrigin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/chains', chainsRouter);

// 静态演示页（沙箱预览 / 无 AppID 时的轻量入口）
app.use(express.static(path.join(__dirname, 'public')));

// 兜底错误处理
app.use((err, req, res, next) => {
  console.error('[server] 未捕获错误：', err);
  res.status(500).json({ code: 1, message: '服务器错误' });
});

app.listen(config.port, () => {
  console.log(`接龙后端已启动: http://localhost:${config.port}`);
  console.log(`演示页: http://localhost:${config.port}/`);
});
