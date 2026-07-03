-- Deno probe 改造的 schema 变更（2026-07-02）
-- 已在 Supabase SQL Editor 执行；此文件为 schema-as-code 留档，配合 server.ts / index.html 使用。
--   · probe_results 加 request_id/gaid：客户端 dump 关联键 + 设备维度
--   · nav_headers 新表：服务端 GET / 收到的导航请求头（含高熵 CH），RLS 仅允 anon INSERT

alter table probe_results add column if not exists request_id text;
alter table probe_results add column if not exists gaid text;
create index if not exists probe_results_request_id_idx on probe_results (request_id);

create table if not exists nav_headers (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  request_id text not null,
  src text,
  gaid text,
  ua text,
  has_high_entropy boolean not null default false,
  headers jsonb not null
);
create index if not exists nav_headers_request_id_idx on nav_headers (request_id);

alter table nav_headers enable row level security;
-- 与 probe_results 一致：anon 只能 INSERT（公开无妨）
create policy nav_headers_anon_insert on nav_headers for insert to anon with check (true);
