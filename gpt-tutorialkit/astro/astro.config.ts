import tutorialkit from '@tutorialkit/astro';
import { defineConfig } from 'astro/config';

// 我们不使用 WebContainer 预览（它跑不了本机 native PyTorch）。
// 关闭默认注入的 WebContainer 课程路由，改用本项目 src/pages 下自建页面：
// 左侧仍是 TutorialKit 的内容集合 / MDX / 主题，右侧换成本机 Python 执行面板。
export default defineConfig({
  devToolbar: { enabled: false },
  server: { host: '127.0.0.1', port: 4321 },
  vite: { server: { strictPort: true } },
  integrations: [tutorialkit({ defaultRoutes: false })],
});
