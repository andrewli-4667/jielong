# 员工每日业务达成 · 接龙

一个给**团队每天填业务数据**的轻量工具：发起人建一个接龙，导入员工名单，员工每天打开点自己名字、填当天的 8 个数字（呼出/接通/有效/微信/意向/成交/激活/私人微信），系统自动汇总、可导出 CSV。

- 长期有效、每天都能填，员工打开自动定位到「今天」
- 预先导入员工姓名，员工只选自己名字即可，不用每次手打
- 字段可增删改（以后加指标不用改代码）
- 管理操作（建接龙/导名单/改字段/删记录/导出）带管理员口令保护
- 数据存 **Supabase（免费 Postgres）**，真正持久化、重启不丢

> 部署形态：网页 H5。员工在微信/浏览器里点链接即用，无需安装、无需小程序审核。

## 目录结构

| 目录 | 说明 |
|---|---|
| `server/` | Node.js 后端（Express + Supabase） |
| `server/public/` | 网页前端（员工端 + 管理端，单页） |
| `server/sql/schema.sql` | 建表脚本（Supabase 里运行一次） |
| `render.yaml` | Render 部署配置 |

## 一、准备数据库（一次性，5 分钟）

1. 打开 [supabase.com](https://supabase.com) → 用 GitHub 登录 → **New project**
   - 名字 `jielong`，设一个数据库密码（自己记住），Region 选 **Southeast Asia (Singapore)**
2. 左侧 **SQL Editor → New query**，把 `server/sql/schema.sql` 全部内容粘进去 → 点 **Run**（出现 Success 即可）
3. 左侧 **Project Settings → API**，记下：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **Publishable key**（以 `sb_publishable_` 开头）

## 二、部署上线（Render，免费）

1. 把整个 `server/` 目录 + `render.yaml` 上传到 GitHub 仓库（或 git push）
2. [render.com](https://render.com) → **New + → Web Service** → 连 GitHub → 选仓库
   - 它会读 `render.yaml`：Root Directory = `server`，Build = `npm install`，Start = `npm start`
3. 在 Render 服务的 **Environment** 里加 3 个环境变量：

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | 上面的 Project URL |
   | `SUPABASE_KEY` | 上面的 Publishable key |
   | `ADMIN_PASSWORD` | 你自己定的管理员口令（如 `laoban2026`） |

4. 点 **Deploy** → 变绿 **Live** 后，访问它给的网址即可。

> 第一次打开可能慢 30~50 秒（免费实例「睡醒」），之后就快了。

## 三、本地运行（开发 / 自测）

```bash
cd server
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_KEY=sb_publishable_xxxx
export ADMIN_PASSWORD=laoban2026
npm install
npm start
# 打开 http://localhost:3000
```

## 四、怎么用

**员工端**：打开链接 → 选自己名字 → 填今天的数字 → 提交（当天可改自己那条）。
**管理端**：点右上角「管理」→ 输入口令 →
- 字段：增删改每天的指标
- 员工名单：批量粘贴导入、改名、移出
- 记录：按日期查看/修改/删除某条
- 设置：开关接龙、导出 CSV（范围=创建日→今天，明细行）

## 五、接口一览（REST）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/chains` | 接龙列表 |
| POST | `/api/chains` | 建接龙（需口令） |
| GET | `/api/chains/:id` | 详情（字段/名单/记录/今天） |
| POST | `/api/chains/:id/fields` | 加字段（需口令） |
| POST | `/api/chains/:id/employees` | 导入名单（需口令） |
| POST | `/api/chains/:id/entries` | 员工提交/当天修改（upsert） |
| PATCH/DELETE | `/api/chains/:id/entries/:eid` | 改/删记录（需口令） |
| GET | `/api/chains/:id/export` | 导出 CSV（需口令） |

历史记录：每人每天一条保存在 Supabase，导出 CSV 即全量明细。建议定期用「导出 CSV」备份一份到本地。

## 六、数据安全提示

- `ADMIN_PASSWORD` 是管理口令，只在后端校验，别设太简单。
- `SUPABASE_KEY` 用 publishable key 即可（已在库里对 anon 授权读写）；如果将来想更严格，可改 `schema.sql` 开启 RLS。
- Supabase 免费档有容量上限，长期大量数据可升级套餐；当前业务量完全够用。
