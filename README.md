# 群接龙小程序

一个**群报名 / 统计接龙**的微信小程序，数据**云端共享**（多人实时看到同一份接龙）。

- 发起人创建接龙：标题、说明、可选项（如「参加/不参加」）、自定义字段（如「携带人数」）、可选截止时间
- 参与者按顺序接龙：填写姓名 + 选项 + 自定义字段
- 实时统计各选项人数、一键分享到群、导出 CSV 名单
- 同一身份防重复，超过截止时间自动只读

工程由三部分组成：

| 目录 | 说明 |
|---|---|
| `miniprogram/` | 微信小程序前端工程（导入微信开发者工具后真机使用） |
| `server/` | Node.js 后端服务（REST API + JSON 持久化，可部署到任意公网） |
| `web-preview/` | 网页演示页（对接同一套 API，沙箱验证 / 无 AppID 时的轻量入口） |

---

## 1. 本地快速体验（无需 AppID）

后端和网页演示页同源，浏览器即可体验全部功能：

```bash
cd server
npm install
npm start
# 打开 http://localhost:3000
```

- 用 `?id=xxx` 可直达某个接龙详情（分享链接格式即为此）。
- 网页演示页用浏览器 localStorage 作为身份，可开两个标签页 / 两个浏览器模拟多人接龙，验证实时统计。

> 微信小程序无法在沙箱浏览器中真机预览，因此用网页演示页验证后端与交互逻辑；小程序工程调的是**同一套 API**，逻辑一致。

---

## 2. 微信小程序部署

### 2.1 准备 AppID
1. 登录 [微信公众平台](https://mp.weixin.qq.com/) → 注册 / 进入「小程序」。
2. 在「开发 → 开发管理 → 开发设置」拿到你的 **AppID**。

### 2.2 导入并配置
1. 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 导入项目，目录选 `miniprogram/`，AppID 填你自己的。
3. 打开 `miniprogram/app.js`，把 `globalData.baseUrl` 改为你的后端 **HTTPS 地址**（不要带结尾斜杠）：
   ```js
   baseUrl: 'https://your-domain.com'
   ```
   - 本地联调可临时填 `http://你的局域网IP:3000`（需把开发者工具里「详情 → 本地设置 → 不校验合法域名」勾上）。

### 2.3 配置服务器域名（线上必做）
微信公众平台 → 开发 → 开发管理 → 开发设置 → **服务器域名**：
- `request 合法域名` 添加：`https://your-domain.com`
- `downloadFile 合法域名` 添加：`https://your-domain.com`（导出 CSV 用到）

> 小程序线上环境强制 HTTPS + 合法域名；本地调试勾选「不校验」可跳过。

### 2.4 获取用户身份（openid，可选）
- 不配置也能用：未配 AppSecret 时 `/api/login` 返回演示 openid，小程序本地缓存后稳定，防重复生效。
- 要真实 openid：在后端设置 `WX_APPID` 和 `WX_APPSECRET`（`server/config.js` 或环境变量），小程序 `wx.login()` 拿 code 调 `/api/login` 换取。

---

## 3. 后端公网部署

后端是标准 Node 服务，零原生依赖。两种常见方式：

### 方式 A：直接用 Node（pm2 守护）
```bash
cd server
npm install --production
WX_APPID=xxx WX_APPSECRET=yyy PORT=3000 node server.js
# 或用 pm2：npm i -g pm2 && pm2 start server.js --name jielong
```
前置一层 Nginx / Caddy 提供 **HTTPS** 并反代到该端口即可。

### 方式 B：云函数 / 容器
- 腾讯云 SCF、阿里云 FC、Railway、Render 等均可直接跑（入口 `server.js`）。
- 用 Docker 时基于 `node:18` 以上镜像，`EXPOSE 3000`，挂载 `server/data` 做持久化卷。

> 无论哪种方式，确保对外是 **HTTPS**，且域名已加入小程序的合法域名。

---

## 4. 配置项

| 配置 | 方式 | 默认值 | 说明 |
|---|---|---|---|
| `PORT` | 环境变量 | `3000` | 监听端口 |
| `WX_APPID` | 环境变量 | 空 | 微信 AppID，配置后启用真实 openid |
| `WX_APPSECRET` | 环境变量 | 空 | 微信 AppSecret |
| `CORS_ORIGIN` | 环境变量 | `*` | CORS 允许的源，部署建议改为具体域名 |
| `data/db.json` | 文件 | 自动创建 | 持久化数据（JSON 落盘） |

---

## 5. 数据持久化与扩展

- 当前用 **JSON 文件落盘**（`server/data/db.json`），适合中小规模群接龙。
- 量大或需更高并发时，把 `server/store.js` 的存储实现替换为 SQLite / Redis / 云数据库即可，路由层无需改动。
- 实时性用**前端每 3 秒轮询**详情接口，对群接龙足够。如需更强实时（秒级推送），可在 `server.js` 引入 `ws` 或 Socket.IO，在 `addEntry` 后向房间内连接广播更新。

---

## 6. API 说明

基础前缀 `/api`，返回统一结构 `{ code, data, message }`（`code:0` 为成功）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/chains` | 接龙列表（按创建时间倒序，含参与人数） |
| POST | `/api/chains` | 创建接龙。body：`{title, description?, options?, fields?, deadline?, creator?}` |
| GET | `/api/chains/:id` | 接龙详情 + 记录 + 统计 + `closed` 状态 |
| POST | `/api/chains/:id/entries` | 加入接龙。body：`{userId, userName, answers:{option, 字段key...}}` |
| GET | `/api/chains/:id/export` | 导出 CSV（UTF-8 BOM，Excel 直接可读） |
| POST | `/api/login` | `code` 换 openid（配 AppSecret 时返回真实 openid） |

错误码：`1` 参数/业务错误，`2` 已截止，`3` 已接过龙。

---

## 7. 目录结构

```
workspace/
├── miniprogram/          # 微信小程序前端
│   ├── app.js/json/wxss
│   ├── utils/request.js
│   └── pages/{index,create,detail}/
├── server/               # 后端
│   ├── server.js         # 入口
│   ├── store.js          # 存储层（内存 + JSON 落盘）
│   ├── routes/chains.js  # 路由
│   ├── config.js
│   └── data/db.json      # 运行时生成
└── web-preview/          # 网页演示页（同 API）
```
