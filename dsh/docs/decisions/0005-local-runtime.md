# 0005 课程代码在本机运行

状态：已采纳。日期：2026-11-02。修订 [0003](0003-tutorialkit.md) 的第 2、5 条：课程代码不再运行在 WebContainer 里，改为在学习者本机的 Node 上运行；TutorialKit 的界面保持不变。

## 背景

WebContainer 带来了几处代价：

- 首次进入课程要在浏览器里从 npm 安装上游包，本机测试约 20 秒，而且必须联网；
- 浏览器里的 `AsyncLocalStorage` 不跨 `await` 传播，只能用单上下文替身绕过，测试也要为它多跑一遍；
- 运行时由 StackBlitz 托管，商业使用需要单独授权。

这个教程本来就要求克隆仓库、`pnpm install`，上游包已经装在本机，没有必要在浏览器里再装一次。

## 决定

1. **替换运行时，不改 TutorialKit。** TutorialKit 1.6 只用到 `@webcontainer/api` 的一小部分：`boot`、`mount`、`fs`（读写、列目录、建删、监听）、`spawn`、`port` 事件、`export`，以及 `@webcontainer/api/utils` 的 `reloadPreview`。`astro.config.ts` 用 Vite 别名把这两个模块换成 `apps/tutorial/runtime/client.ts`，它经 WebSocket（`/__lesson-runtime`）把每个调用交给本机运行时 `runtime/server.ts` 执行。
2. **本机运行时。**
   - 文件写在仓库内的 `.cache/lesson-workspace/`，页面每次连接（`boot`）时清空。工作区在仓库里，课程代码按 Node 的模块解析直接用到根目录 `node_modules` 里的上游包，不需要安装步骤，`meta.md` 去掉了 `prepareCommands`。
   - 命令在 `node-pty` 的伪终端里运行，输出带颜色、能调整尺寸。TutorialKit 的交互终端（`/bin/jsh`）换成用户自己的 `$SHELL`，工作目录是课程工作区。
   - 结束进程时结束整个进程组（`npm → sh → node`），两秒后强制结束；新进程等旧进程退出后才启动，避免抢端口。
   - WebContainer 会主动报告端口，本机运行时改为每 300 毫秒探测 `runtime/config.ts` 里登记的预览端口（4300）。
   - 最近连上的页面独占工作区，打开第二个标签页会结束第一个标签页的进程。
3. **只接受本机连接。** 运行时能执行任意命令，所以连接的来源地址必须是回环地址，`Host` 和 `Origin` 也必须是 `localhost`、`127.0.0.1` 或 `[::1]`。文件路径限制在工作区内。
4. **两个入口。** `pnpm dev` 在 Astro 开发服务器上挂运行时（`astro:server:setup`）；`pnpm start` 构建后用 `runtime/serve.ts` 提供 `dist/` 并挂运行时，端到端测试也用它。两者都发送 COOP/COEP 响应头（TutorialKit 的浏览器检查要求 `SharedArrayBuffer`），流程图服务器相应地带上 `Cross-Origin-Resource-Policy: cross-origin`。
5. **去掉 AsyncLocalStorage 替身。** 本机 Node 的 `AsyncLocalStorage` 正常工作，`harness/async-context.ts`、`harness/async-hooks-single.ts` 和测试里的 `single` 模式一起删除。
6. **页脚。** TutorialKit 每页底部的“运行环境由 WebContainers 提供”链接是写死的，用 `pnpm patch` 删掉（`patches/@tutorialkit__astro@1.6.0.patch`）。

## 后果

- 站点不能再作为纯静态页面部署到线上，只能在本机运行。
- 进入课程不再需要联网，也没有安装等待；端到端测试里运行一课从约 25 秒降到约 5 秒。
- `node-pty` 是原生模块：macOS 和 Windows 有预编译包，Linux 需要编译工具（python3、make、g++）。预编译包里的 `spawn-helper` 在安装脚本被跳过时没有执行权限，运行时启动时会补上。
- 课程代码使用本机 `PATH` 里的 `node` 和 `npm`，版本需要满足 Node.js 22.19 以上。
- 课程代码和交互终端都以当前用户的权限运行，和在本机终端里运行没有区别。
