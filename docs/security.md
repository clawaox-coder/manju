---
doc: security
scope: [all]
applies-to: 跨服务跨层, 见 §1 trigger-keywords
audience: [all-agents]
priority: critical
depends-on: [architecture, api, database]
provides: [authn, authz, encryption, content-safety, threat-model, response-plan]
purpose: 安全契约. agent 涉及鉴权/数据/加密/敏感动作时必读. 违反即合并阻断.
last-verified: 2026-05-24
---

# 安全规范

## 1. 触发关键词 (agent 看到这些立即加载本文档)

```yaml
trigger-keywords:
  - login | register | logout | password | 2fa | totp | jwt | session
  - oauth | sso | saml | oidc
  - api-key | secret | token
  - encryption | crypto | bcrypt | hash
  - permission | rbac | acl | rls
  - audit | log
  - pii | privacy | gdpr
  - upload | content-safety
  - payment | billing | refund
  - admin | sudo | impersonate
```

## 2. 认证 (Authentication)

```yaml
methods:
  password:
    hash:        bcrypt cost=12
    min-length:  10
    forbidden:   [常见弱密码字典, 用户邮箱 / 手机 / 姓名子串]
    rate-limit:  "5 fail in 5min → 锁 15min"

  2fa:
    type:        TOTP (RFC 6238)
    backup:      短信备用码 (10 个一次性)
    secret-storage: "pgcrypto AES 加密存储"

  oauth:
    providers:   [wechat, apple, google]
    flow:        PKCE
    state:       "必校验, 防 CSRF"

  api-key:
    format:      "sk-mjs-<env>-<random>"
    storage:     "bcrypt key_hash, 仅存储 hash + tail (后4位)"
    display:     "生成时返回明文一次, 之后不可恢复"
    rotation:    "用户可随时撤销; 系统密钥每季度强制轮换"

session:
  access-token:
    format:      JWT (HS512 or EdDSA)
    ttl:         15 分钟
    claims:      [sub, team_id, role, iat, exp, jti]
    payload:     "不放敏感数据 (邮箱, 手机)"

  refresh-token:
    format:      "opaque random (32 bytes)"
    ttl:         30 天
    storage:     "redis whitelist + httpOnly cookie + Secure + SameSite=Lax"
    rotation:    "每次 refresh 颁发新 token, 老的 30s 内仍有效 (race condition)"
    revoke:      "logout / 改密 / 强制下线"
```

## 3. 授权 (Authorization)

```yaml
model:        "RBAC + Resource ACL"

roles:
  owner:      "团队所有权限 + 删除团队"
  admin:      "成员管理 + 计费 + 项目全权限"
  editor:     "项目创建 / 编辑, 资产读写"
  viewer:     "项目只读"

resource-acl:
  override:   "项目级单独授权, 例如对外只读分享"
  table:      project_collaborators

enforcement:
  layer-1:    api-gateway (jwt 校验, 团队上下文)
  layer-2:    service (业务规则)
  layer-3:    postgres-rls (兜底防越权)

rls-policy-example:
  | CREATE POLICY project_team_isolation ON projects
  |   USING (team_id = current_setting('app.team_id', true)::uuid);

forbidden:
  - "在前端做权限判断 (仅 UI 隐藏)"
  - "用 client 传的 team_id 作为权威 (用 jwt 中的)"
  - "禁用 RLS 跑批 (用专门 batch 账户 + audit)"
```

## 4. 加密

```yaml
in-transit:
  protocol:       "TLS 1.3+"
  certificate:    "Let's Encrypt + cert-manager"
  hsts:           "max-age=31536000; includeSubDomains; preload"
  禁止:           "HTTP (除 health check)"

at-rest:
  database:       "pg + filesystem AES-256 (云盘加密)"
  s3:             "SSE-S3 (server-side encryption)"
  backups:        "AES-256 with kms-key"

column-level:
  enable-for:
    - users.password_hash    (bcrypt, not encryption)
    - users.two_factor_secret (pgcrypto AES)
    - users.phone            (pgcrypto AES, store hash for unique check)
    - payment.intent_id      (pgcrypto AES)

key-management:
  provider:       "aliyun KMS (or hashicorp vault)"
  rotation:       "master key 每年, dek 每季度"
  禁止:           "硬编码到代码 / 镜像 / 配置文件"

password-rules:
  hash:           bcrypt
  cost:           12
  pepper:         "全局静态 pepper (从 KMS 读取)"

api-key-rules:
  hash:           bcrypt cost=10
  prefix:         "前 8 字符明文存储, 用于识别"
  tail:           "后 4 字符明文存储, 用于用户对账"
```

## 5. 输入校验与防注入

```yaml
sql-injection:
  rule:           "ORM / 参数化查询 only"
  禁止:           "字符串拼接 SQL (包括 LIKE)"
  example-bad:    "WHERE name LIKE '%${q}%'"
  example-good:   "WHERE name ILIKE $1, [`%${q}%`]"

xss:
  frontend:
    - "禁止 dangerouslySetInnerHTML (除非 DOMPurify)"
    - "用户文本永远经 React 自动转义"
  backend:
    - "返回 user-generated content 时设 Content-Disposition"
    - "Content-Security-Policy header"

content-security-policy:
  default-src:    "'self'"
  script-src:     "'self' 'wasm-unsafe-eval'"
  style-src:      "'self' 'unsafe-inline'"   # tailwind 需要
  img-src:        "'self' data: https:"
  connect-src:    "'self' https://api.manju-ai.studio wss://api.manju-ai.studio"
  frame-ancestors: "'none'"
  upgrade-insecure-requests: ""

other-headers:
  X-Content-Type-Options: nosniff
  X-Frame-Options:        DENY
  Referrer-Policy:        strict-origin-when-cross-origin
  Permissions-Policy:     "camera=(), microphone=(), geolocation=()"

validation:
  layer:          "zod (frontend) + go-playground/validator (backend)"
  rule:           "白名单 > 黑名单"
  always-validate:
    - 长度上限 (string max-length)
    - 数字范围
    - 枚举值
    - 邮箱 / 手机格式
    - uuid 格式
    - 文件 mime-type + 大小
```

## 6. 文件上传

```yaml
flow:
  1. client 调 POST /v1/upload/sign (申请预签名)
  2. server 校验配额 / 类型 / 大小
  3. server 返回 s3 预签名 PUT URL (TTL 10min)
  4. client 直接 PUT 到 s3 (不经后端)
  5. client 拿 file_url 创建资源

restrictions:
  max-size-mb:    100
  allowed-types:
    image:   [image/png, image/jpeg, image/webp, image/svg+xml]
    audio:   [audio/mpeg, audio/wav, audio/mp4]
    video:   [video/mp4, video/webm]
    document: [application/pdf, text/markdown, text/plain]

post-upload-scan:
  - virus-scan (clamav)
  - content-safety (tencent-yaq for image; 自训文本审核)
  - mime-verify (libmagic 二次确认, 不信 Content-Type)

forbidden-upload:
  - exe / dll / sh / bat (任何可执行)
  - svg with <script> (会用 DOMPurify 清洗或直接拒绝)
  - polyglot files (假图片)
```

## 7. 内容安全

```yaml
pre-render-check:
  required:       true
  pipeline:
    - "剧本 → LLM 审核 (prompt + 敏感词)"
    - "分镜 image → tencent-yaq"
    - "对白 audio → 自训语音审核"
  threshold:      "任一不过 → reject"

aigc-watermark:
  enforce:        true
  free-plan:      forced
  pro-plan:       optional
  team-plan:      optional
  text:           "AIGC | 漫剧AI Studio"
  position:       bottom-right
  size:           "5% of frame width"
  metadata:       "EXIF / mp4 metadata 标注 'aigc=true'"

provider:
  primary:        tencent-yaq
  fallback:       netease-yidun
  cost-budget:    "0.01 cny / image"

report-channel:
  - "用户举报 button"
  - "管理后台 review queue"
  - "sla: 24h 响应"
```

## 8. 限流与反滥用

```yaml
rate-limit:
  api-gateway:    "全局 + per-key (见 api.md §10)"
  login:          "5 fail / 5 min / ip + per-account"
  register:       "3 / hour / ip"
  password-reset: "3 / day / account"
  upload:         "100 / hour / user"
  ai-call:        "see plan quota"

bot-detection:
  signals:
    - "user-agent 异常"
    - "无 referer (登录场景)"
    - "tor / 数据中心 ip"
    - "请求频率 > 人类阈值"
  action:
    - "captcha (geetest / hcaptcha)"
    - "shadow-ban (api 假成功)"
    - "封 ip 段"

ddos:
  protection:     cloudflare + aliyun-shield
  l7-rate-limit:  apisix
```

## 9. 审计日志

```yaml
must-log:
  - login / logout / failed-login
  - password change / 2fa enable/disable
  - api_key.create / revoke
  - team.member.invite / remove / role-change
  - project.delete / restore / purge
  - billing.subscribe / cancel / refund
  - admin-action (任何后台操作)

never-log:
  - password 明文 (即使在 audit)
  - api_key 完整字符串
  - jwt / refresh-token
  - 信用卡 / 完整身份证号

storage:
  table:          audit_logs (database.md §5.11)
  retention:      "90d in postgres, 1y in s3 cold"
  immutable:      "s3 object-lock"

access:
  read:           "admin role only"
  export:         "compliance ticket required"
```

## 10. 隐私 (PII)

```yaml
pii-fields:
  - users.email
  - users.phone
  - users.password_hash (technically derived)
  - users.two_factor_secret
  - users.real_name (if collected)
  - billing.payment_intent
  - audit_logs.ip

handling:
  display:        "脱敏 (a***@xx.com, 138****8888)"
  log:            "禁止 raw pii 进日志"
  export:         "用户可申请导出全部 (GDPR)"
  delete:         "T+30 天物理删除 + 备份脱敏"

retention:
  active-user:    "无限"
  inactive-12m:   "邮件提示, 24m 未活跃 → 自动归档"
  deleted:        "T+30 物理删除 + 异地备份脱敏 T+90"
```

## 11. 第三方依赖

```yaml
vetting:
  - "license 必须 MIT / Apache / BSD (禁止 GPL viral)"
  - "npm > 1k weekly downloads, github > 100 star"
  - "查看 maintenance: 最近 commit < 6 月"
  - "查 snyk 已知漏洞"

update:
  - "p0 漏洞: 24h 修"
  - "p1 漏洞: 7d 修"
  - "p2 漏洞: 30d 修"
  - "automated PR via dependabot"

禁用-清单:
  - "lodash full import (用 lodash-es 或原生 ES)"
  - "moment.js (deprecated, 用 date-fns)"
  - "request (deprecated, 用 fetch / undici)"
  - "node-fetch v2 (用 v3 或原生)"
```

## 12. 应急响应

```yaml
severity:
  p0:
    例:    "全站不可用 / 数据泄露"
    sla:   "30min 响应, 4h 缓解"
    page:  pagerduty + 全员

  p1:
    例:    "核心功能不可用 / 已发生越权"
    sla:   "1h 响应, 24h 修复"
    page:  oncall

  p2:
    例:    "部分功能降级"
    sla:   "next business day"

flow:
  detect:
    - alert (自动)
    - 用户举报
    - 安全研究员披露 (security@manju-ai.studio)

  triage:
    - 确认范围 + 影响
    - 分级 + 分配 owner
    - 启动作战室 (lark / zoom)

  contain:
    - 隔离影响 (吊销 token, 封 ip, 下线服务)
    - 立即审计可能影响的数据
    - 通知合规 / 法务 (如涉及 pii)

  remediate:
    - hotfix + 灰度
    - 验证修复有效
    - 移除遗留风险

  postmortem:
    - 48h 内提交 (无指责文化)
    - 时间线 + 根因 + 影响 + 修复 + 改进项
    - 改进项必须有 owner + due date
    - 公示给全员
```

## 13. 安全代码 PR Checklist

```yaml
涉及鉴权时:
  - [ ] 团队上下文从 jwt 取, 不信前端 input
  - [ ] 资源访问走 RLS, 应用层不依赖
  - [ ] 敏感操作必有 audit_log
  - [ ] 限流配置 (见 §8)

涉及数据时:
  - [ ] sql 全部参数化
  - [ ] 用户输入有 zod / validator 校验
  - [ ] 返回字段不泄漏 pii
  - [ ] log 不含敏感

涉及加密时:
  - [ ] 不自己实现 crypto (用 stdlib)
  - [ ] 密钥从 kms 取, 不硬编码
  - [ ] 密码 bcrypt cost >= 12

涉及上传时:
  - [ ] mime-verify + size-check
  - [ ] 异步 scan (clamav + content-safety)
  - [ ] s3 路径含 user_id (路径越权)

涉及 ai 时:
  - [ ] prompt 注入防护 (template parameterization)
  - [ ] 输入审核 (敏感词 + LLM 判断)
  - [ ] 输出审核 (内容安全 api)

涉及支付时:
  - [ ] 服务端校验金额 (不信客户端)
  - [ ] webhook 签名校验
  - [ ] 幂等 (Idempotency-Key)
```

## 14. 安全联系

```yaml
contact:
  responsible-disclosure: security@manju-ai.studio
  pgp-key:                "<published on website>"
  bug-bounty:             "m2 引入, hackerone"
  sla:                    "24h 响应, 7d 修复 + 致谢"
```
