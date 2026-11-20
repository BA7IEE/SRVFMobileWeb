# ADR 001 队员 H5 会话

维护者于 2026-11-20 批准第一版采用同源 HTTPS 和安全 Cookie 恢复会话。该决定覆盖 SRVFMobileWeb 的真实构建。代码合并、配对部署和手机实机验收分别留证。

页面与 `/api/` 必须共用 HTTPS 协议、主机和端口。反向代理保留 Host、覆盖转发协议，后端只信任指定代理。H5 复用 Nest 现有登录、轮换与撤销事务。[后端契约](https://github.com/BA7IEE/srvf-nest-api/blob/479594029d46bb9ab0e00e01411368830e2e6a24/docs/handoff/h5-session.md)

- 登录只向同源 H5 login 提交账号密码。短期 Bearer 仅在本页内存，用于 App 接口。页面刷新时调用无请求体的 H5 refresh 恢复。
- 服务端维护 opaque refresh family，以 HttpOnly、Secure、SameSite=Strict 的 host-only Cookie 传输，Path=/。每次成功刷新都轮换，保留最初的绝对期限。服务端校验 Origin、HTTPS 与浏览器提供的 Fetch Metadata。
- 同源标签页通过 Web Locks 串行登录、刷新与退出。浏览器存储只保存随机代际标记与退出状态，用于使其他标签页丢弃旧身份。密码、Access Token 和 Refresh Token 均不写 Web Storage。浏览器无法提供协调能力时，显示不可用。
- 退出先清除页面身份，再调用 H5 logout 撤销 family。未收到回执时保留本机退出标记，下一次显式登录前重试退出。改密、账号禁用、重放和凭证轮换遵从 P0-E；已签发的 access 按服务端契约自然到期。业务写入不自动重放。
- 使用 `pnpm build:h5` 生成 `dist-h5/`。部署响应头的 CSP 必须允许 `connect-src 'self'`。回退时可恢复原有未配置静态产物。模拟构建继续使用合成数据。

首发需要在实际 HTTPS 拓扑和手机浏览器分别验证 Cookie、跨标签、刷新、注销及业务页面。模拟器与离线测试单列。
