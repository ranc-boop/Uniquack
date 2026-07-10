# G-LOGIN1 Google 登录 / 账号绑定 实施计划

| 项 | 值 |
| --- | --- |
| 计划 ID | G-LOGIN1 |
| 分支 | `codex/google-login-account-linking-plan` |
| 日期 | 2026-07-10 |
| 状态 | 计划稿，不写代码 |
| 父计划 | `docs/bank-first-implementation-plan.md` 的 PR 13 |
| 父护栏 | `AGENTS.md` / `CONTEXT.md` / `docs/student-teacher-boundary-plan.md` |

> **一句话**: Google 登录只证明"你是谁"，不决定"你能干什么"。角色、班级、题库权限全部由 EduStruct 自己的表决定。

---

## 0. 铁律（不要违反）

1. **Google 邮箱 ≠ 教师身份**。新用户默认 `student`。
2. **学校域名 ≠ 权限**。`hd` 提示只是提示，不自动给任何角色。
3. **Google Classroom ≠ EduStruct Classroom**。只作外部数据源，roster 不能直接写 `classroom_members`，更不能给题库访问权。
4. **EduStruct 自己的题库 / 作业 / 练习证据 / 教师洞察全部保留**，本次只动登录和绑定。

---

## 1. 12 个问题的回答

### Q1. 现在 Supabase auth 是怎么接 Google 的？
**没接。** 现在只有 `src/app/auth/actions.ts` 里的用户名/密码登录（用户名前面拼 `username@local.app`），没有任何 Google provider、`signInWithOAuth`、回调路由。`auth.users` 是唯一的身份源。

### Q2. 用 Supabase OAuth 还是自己建回调？
**用 Supabase OAuth + 一个薄 Next.js 回调路由。**
- Supabase 保管 client secret、做 PKCE、验 `id_token`、建 `auth.users`。
- 我们只写：`signInWithGoogle` server action、`/auth/callback` 路由（`exchangeCodeForSession`）、`linkGoogleAccount`（`linkIdentity`）。
- 绝对不要自己接 Google，client secret 不能进仓库。

### Q3. 要不要 `google_account_links` 表？
**要。** 三件事放不进去就没法做：
- 用 `google_sub` 找回老账号（email 改了也能找到）。
- 记录 `email_at_link` / `email_verified` / `domain_hint` / `scopes` / `revoked_at`。
- 给未来的 Google Classroom 导入留字段。

它**不**决定角色，角色继续在 `profiles.role` 和 `organization_members.role`。

### Q4. 怎么把 Google 绑到 EduStruct profile？
两步规则：
- **主键**: `google_sub`（来自 `id_token.sub`，永远不变）。
- **次键**: `email`（只在 `sub` 从未见过时用，且**不**作为所有权证明）。
- 关联表唯一约束：`(google_sub) where revoked_at is null` 和 `(user_id, provider)`。

### Q5. email 撞上老账号怎么办？
**永远不静默合并**。决策表：

| 之前有 EduStruct 登录? | sub 已绑过? | 老账号 email == Google email? | 处理 |
| --- | --- | --- | --- |
| 无 | 无 | 无 | 新建 `auth.users` + `profiles.role='student'` + 写 `google_account_links` |
| 无 | 无 | **是** | 拒绝静默绑定，要求先登录老账号，再去"设置 → 绑定 Google" |
| 无 | **是** | (任意) | 复用同一个 `auth.users.id`，刷新 `last_seen_at` |
| 有 | 无 | (任意) | 走 `linkIdentity` 创建绑定 |
| 有 | 是，但绑的是别人 | (任意) | **硬错**: "Google 账号已绑到其他 EduStruct 账号" |

### Q6. email 不匹配怎么办？
正常新用户流程：
1. Supabase Auth 建 `auth.users`，`private.handle_new_user()` 触发器建 `profiles.role='student'`。
2. 写 `google_account_links` 行。
3. 如果 email 域名是学校（如 `*.edu.cn`），**不**自动加组织，只在"设置"页面提示"加入你的学校"。**绝对不**自动给角色。

### Q7. 重号怎么处理？
- **`google_sub` 已绑别人**: `unique(google_sub) where revoked_at is null` 索引硬拒，写 `link_rejected_duplicate_sub` 审计行。
- **`auth.users.email` 撞号**: 拒在 `/auth/callback`，写 `link_rejected_email_collision`，让用户去走显式绑定。
- **Alice 用 Gmail + Alice 用企业邮箱（不同的 Google 账号）**: 拒绝自动合并，让用户自己挑。

### Q8. 新 Google 用户默认角色？
**`student`**，走现有的 `private.handle_new_user()`。**不**加 `pending` 角色。

### Q9. 教师角色从哪来？
优先级从高到低：
1. **Admin 提升**：`super_admin` 改 `profiles.role` + 写 `organization_members`。这是唯一能给"全局教师"的路。
2. **组织邀请**：组织 admin 邀请 → 用户接受 → 写 `organization_members.role='teacher'`。`profiles.role` 仍为 `student`，这是有意为之：组织内教师不等于全局教师。教师工作台读两个信号（`private.is_teacher_or_admin()` + `private.is_org_staff()`）。
3. **学校域名**: 永远只是 hint，永远不给角色。

### Q10. 怎么解绑 / 撤销？
两条路：
- **用户自助**（设置 → 绑定账号 → 解绑 Google）：
  - 调 `supabase.auth.unlinkIdentity`。
  - 软删：置 `revoked_at=now()`，不删行。
  - 如果用户没密码且这是唯一身份 → **强制先设密码**，否则写 `unlink_blocked_last_identity` 审计行。
- **Admin 撤销**：super_admin 置 `revoked_at`，强制下次登录重新绑定。**不**删账号。

**不**调 Google 的 token revoke 接口（我们不存 refresh token）。

### Q11. 审计日志要记什么？
新建 `public.identity_link_audit_log`，只追加。字段：

| 字段 | 含义 |
| --- | --- |
| `event_at` | 事件时间 |
| `actor_user_id` | 操作的 EduStruct 用户（系统事件可空） |
| `target_user_id` | 被改的用户 |
| `provider` | 默认 `'google'` |
| `event_kind` | `signin_new` / `signin_existing` / `link` / `unlink_user` / `unlink_admin` / `link_rejected_duplicate_sub` / `link_rejected_email_collision` / `unlink_blocked_last_identity` |
| `google_sub` | 事件发生时的 `sub` |
| `email_at_event` | 当时的 email |
| `domain_hint` | `hd` 提示 |
| `ip_hash` | SHA-256(ip + 日轮换 salt) |
| `user_agent_hash` | 同上 |
| `reason` | 拒因 / 撤销原因 |
| `metadata` | JSONB 小上下文 |

**不**记：`id_token` / `access_token` / `refresh_token` / 原 IP / 原 UA。保留 18 个月起。

读权限：用户能读自己（限 `signin_*` / `link` / `unlink_user`），super_admin 读全部。

### Q12. 后续 Classroom 导入依赖什么？
未来 G-CLASS-IMPORT 会读这些字段（**今天就必须在 schema 里留出来**）：

| 未来需要 | 今天的字段 |
| --- | --- |
| Google `sub` | `google_account_links.google_sub` |
| 学生邮箱 | `google_account_links.email_at_link` + `auth.users.email` |
| 是否已验证 | `google_account_links.email_verified` |
| Workspace 租户 | `google_account_links.domain_hint` + `profiles.email_domain` |
| 绑定的 EduStruct 用户 | `google_account_links.user_id` |
| 用户授权的 scope | `google_account_links.scopes` |
| 上次 token 校验时间 | `google_account_links.last_seen_at` |
| 撤销状态 | `google_account_links.revoked_at` |

> 未来加的 `google_classroom_courses` / `google_classroom_roster` 是**只读镜像**，映射到 `public.classrooms` 必须经老师手动操作，**绝不**自动建 `classroom_members`。

---

## 2. 推荐 schema

`supabase/clean-migrations/0032_google_account_links.sql`（计划稿，**不**本次应用）。包括：

- `public.google_account_links`：主键 `id`、外键 `user_id→auth.users`、`google_sub` 唯一（仅未撤销时）、`email_at_link` / `email_verified` / `domain_hint` / `scopes` / `linked_at` / `last_seen_at` / `revoked_at` / `revoked_reason`。
- `public.profiles` 加 3 个可空列：`google_sub`（部分唯一索引）、`email_domain`、`last_google_signin_at`。
- `public.identity_link_audit_log`：12 列，append-only，super_admin 全读 / 用户自读窄切片。
- `private.sync_profile_google_sub` 触发器：保持 `profiles.google_sub` / `email_domain` 跟主表一致。
- 4 个 RPC（`security definer`，不在今晚实现）：
  - `public.record_google_signin` — 写入/刷新 `google_account_links` + 审计行。
  - `public.reject_google_link` — 写 `*_rejected_*` 审计行。
  - `public.unlink_google_account` — 软撤销，含 last-identity 检查。
  - `public.identity_link_audit_read` — 读审计。
- RLS：`google_account_links` 用户读自己 + super_admin 读全部；`identity_link_audit_log` 用户读自己窄切片 + super_admin 读全部。`insert/update/delete` 只走 RPC。

**不**加的：
- 不存 `google_refresh_tokens`（不存任何 Google 端的 token）。
- 不加 `classroom_oauth_tokens`（同上）。
- 不加新角色值，不加 `pending`。

---

## 3. 推荐登录流程

### 3.1 登录

```text
浏览器点 "Continue with Google"
  -> 服务端调 supabase.auth.signInWithOAuth({ provider:'google', scopes:'openid email profile' })
  -> 302 跳 Google
Google 同意后跳回 /auth/callback?code=...
  -> 调 exchangeCodeForSession(code)
  -> 调 public.record_google_signin(..., 'signin_new' | 'signin_existing')
  -> 跳到 next 或默认 landing
```

`scopes` 固定 `openid email profile`，**不**要 Classroom scope。

### 3.2 在已登录态绑定

```text
设置 → 绑定账号 → 绑 Google
  -> 调 supabase.auth.linkIdentity({ provider:'google' })
  -> Google 同意
  -> /auth/callback 调 record_google_signin(..., 'link')
```

如果返回 `identity_already_exists` → 调 `reject_google_link(..., 'link_rejected_duplicate_sub')` 并提示用户。

### 3.3 解绑

```text
设置 → 绑定账号 → 解绑 Google
  -> unlinkGoogleAccount()
     - 没密码且是唯一身份 → 写 unlink_blocked_last_identity 拒掉
     - 否则 supabase.auth.unlinkIdentity + revoked_at=now()
  -> 跳设置页
```

### 3.4 角色与默认 landing
完全不动。`private.handle_new_user()` 继续写 `profiles.role='student'`。登录后跳转沿用现有规则：admin → `/admin`，teacher → `/teacher`，student → `/questions`（或 `/student`）。

---

## 4. 风险

| 类别 | 风险 | 缓解 | 残余 |
| --- | --- | --- | --- |
| 授权 | 用 Google 邮箱撞老账号，冒充接管 | 永不静默合并，强制显式 link 流程 | 用户社会工程学被骗，审计日志兜底 |
| 授权 | 学校域名被当权限 | `hd` 只做 hint，不给角色；组织成员仍 invite-only | 老用户邮箱后缀变了但仍信任旧组织 |
| 授权 | Google 账号 email 被改 | 保留 `email_at_link`，sub 仍是主键 | `profiles.email_domain` 可能滞后，每次成功登录重算 |
| 授权 | 误绑到错账号 | `(google_sub) where revoked_at is null` 唯一索引 + 拒因审计 | — |
| 授权 | 最后一根身份解绑 → 锁死 | 必须先设密码 | — |
| 运维 | Supabase 配错 Site URL / Redirect URLs | 文档明确 dashboard 步骤 + smoke 必跑 | 配错会让所有人进不来 |
| 运维 | 审计日志膨胀 | 18 个月起，按 `(target, event_at desc)` 索引 | 大体量需分区，后续 PR |
| 运维 | 日轮换 salt 没真正轮换 | 本计划只建表，pg_cron 推到后续 PR | 不轮换也能用，只是降级 |
| 运维 | `auth.users.email` 撞号 | 在 callback 捕 `link_rejected_email_collision` | Supabase Auth 当前会先撞 → 我们不试图合并 |
| 隐私 | 存了不该存的东西 | scope 只 `openid email profile`，不存任何 token | 保留 `email` 永久，跟现有 `auth.users.email` 同隐私级 |
| 迁移 | 改坏了旧 migration | 严格追加 `0032`，旧 migration 不动 | — |

---

## 5. 下一 PR

**标题**: `feat(auth): Google OAuth 登录、显式绑定、解绑流程（G-LOGIN1 落地）`

| 项 | 内容 |
| --- | --- |
| 目标 | 把本计划落成代码，**不**改授权模型 |
| 非目标 | Classroom 导入、domain-wide delegation、Google refresh token 存储、自动按域名授权、Workspace 目录读取 |
| 影响工作流 | 只动 auth 表面；题库 / 班级 / 作业 / 练习 全部不动 |
| 角色边界 | 不加新角色；`student` 仍是默认；admin 提升 / 邀请教师 路径不变 |
| 数据所有权 | `profiles` 加 3 个可空列；新增 2 张表；老数据零改动 |
| 旧 demo 重叠 | 无（老 demo 没 Google 登录） |
| 迁移风险 | 只加 `0032_google_account_links.sql`，可加可减；回滚就是 drop |
| 烟囱测试 | `npm run lint` / `npm run build` / `node scripts/security-smoke.mjs` / `node scripts/supabase-rls-smoke.mjs` / `node scripts/route-smoke.mjs` / **新增** `google-account-links-smoke.mjs` / `google-account-links-rls-smoke.mjs` / `google-account-links-policy-smoke.mjs` / `npm run smoke` / `npm run perf:budget` |
| 回滚风险 | 中。按钮可关；drop 两表 + 删 3 列即可；零用户数据损失 |

**后续 PR（不在本 PR）**：
- G-CLASS-IMPORT：Google Classroom 课程/花名册只读镜像 + 显式映射到 `public.classrooms`。
- "加入你的学校" 入口：根据 `domain_hint` 提示 `organizations.slug`，不自动加组织。

---

## 6. Supabase 控制台步骤（运营执行，不在 PR 内）

1. Supabase 项目 → **Authentication → Providers → Google → Enable**。
2. 在 Google Cloud Console 建 Web OAuth Client：
   - Authorized JavaScript origins: 生产域名。
   - Authorized redirect URIs: Supabase 给的回调 URL（**不是** Next.js 域名）。
3. 把 Google Client ID / Secret 粘到 Supabase Google provider 配置里。
4. **Authentication → URL Configuration**：Site URL + 额外重定向 URL（含 `/auth/callback`，覆盖生产 / 预览 / `localhost:3000`）。
5. Next.js 项目只设已有的 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`。**不**加 `GOOGLE_CLIENT_SECRET` 到 `.env.local`。
6. 跑第 5 节所有 smoke。

---

## 7. 关键文件指引

- 现有登录: `src/app/auth/actions.ts`、`src/app/auth/login/page.tsx`、`src/lib/auth/roles.ts`、`src/lib/auth/guards.ts`、`src/lib/auth/username.ts`
- Supabase 接线: `src/lib/supabase/server.ts`、`src/lib/supabase/middleware.ts`、`src/lib/supabase/config.ts`
- 身份基线: `supabase/clean-migrations/0001_foundations_identity_organizations.sql`
- 班级: `0018_classroom_foundation.sql` / `0030_teacher_classroom_rls_fix.sql`
- 教师 / 题库 边界: `0029_teacher_role_bank_public_boundary.sql`
- 父计划: `docs/bank-first-implementation-plan.md`（PR 13）
- 师生边界: `docs/student-teacher-boundary-plan.md`
