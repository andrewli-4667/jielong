-- ============================================================
-- 群接龙 · 员工每日业务达成  —— Supabase (Postgres) 建表脚本
-- 用法：Supabase 左侧菜单 SQL Editor -> New query -> 粘贴本文件全部内容 -> Run
-- 可重复执行（用了 if not exists）
-- ============================================================

-- 1. 接龙表：一条接龙 = 一段长期开启的日报
create table if not exists chains (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  status      text not null default 'open',        -- open=进行中, closed=已停止
  created_at  timestamptz not null default now()
);

-- 2. 字段表：每天要填的指标（可增删改）
create table if not exists fields (
  id          uuid primary key default gen_random_uuid(),
  chain_id    uuid not null references chains(id) on delete cascade,
  label       text not null,                       -- 字段名，如"呼出"
  type        text not null default 'number',      -- number / text / select
  required    boolean not null default true,       -- 是否必填
  options     jsonb,                               -- select 类型的可选项
  sort_order  int not null default 0,              -- 排序
  is_active   boolean not null default true,       -- 软删除：false=已停用（不显示但仍保留历史）
  created_at  timestamptz not null default now()
);

-- 3. 员工表：名单（可增减）
create table if not exists employees (
  id          uuid primary key default gen_random_uuid(),
  chain_id    uuid not null references chains(id) on delete cascade,
  name        text not null,                       -- 姓名
  sort_order  int not null default 0,
  is_active   boolean not null default true,       -- 软删除：移出名单但不影响已接龙记录
  created_at  timestamptz not null default now(),
  unique (chain_id, name)
);

-- 4. 记录表：每人每天一条
create table if not exists entries (
  id            uuid primary key default gen_random_uuid(),
  chain_id      uuid not null references chains(id) on delete cascade,
  employee_id   uuid references employees(id) on delete set null,
  employee_name text not null,                     -- 冗余姓名：名单改了/删了，历史仍可读
  entry_date    date not null,                     -- 接龙日期（打开当天）
  values        jsonb not null default '{}'::jsonb,-- 键=field id, 值=员工填的数字
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (chain_id, employee_name, entry_date)      -- 同一人同一天只有一条
);

-- 索引：按接龙+日期查询、按字段排序
create index if not exists idx_entries_chain_date on entries(chain_id, entry_date);
create index if not exists idx_fields_chain       on fields(chain_id, sort_order);
create index if not exists idx_employees_chain    on employees(chain_id, sort_order);

-- ============================================================
-- 权限：后端用“发布密钥(publishable/anon)”访问本库，所以这里
-- 显式关闭 RLS 并把表的读写权限授予 anon/authenticated 角色。
-- （管理员口令在服务端校验，不依赖数据库权限；数据只经你的后端读写。）
-- 若以后想更严格，可改成开启 RLS 并只给登录用户策略，但当前方案足够。
-- ============================================================
alter table chains    disable row level security;
alter table fields    disable row level security;
alter table employees disable row level security;
alter table entries   disable row level security;

grant all privileges on table  chains, fields, employees, entries to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;
