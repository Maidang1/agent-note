import tutorialkit from '@tutorialkit/astro';
import type { AstroIntegration } from 'astro';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { PREVIEW_PORTS, WORKSPACE } from './runtime/config.ts';
import { attachRuntime } from './runtime/server.ts';

const client = fileURLToPath(new URL('./runtime/client.ts', import.meta.url));

/** 课程代码在本机运行：把 WebContainer 换成 runtime/client.ts，开发服务器上挂本机运行时。 */
const localRuntime: AstroIntegration = {
  name: 'local-runtime',
  hooks: {
    'astro:config:setup': ({ updateConfig }) => {
      updateConfig({
        vite: {
          resolve: {
            alias: [
              { find: /^@webcontainer\/api(\/utils)?$/, replacement: client },
            ],
          },
        },
      });
    },
    'astro:server:setup': ({ server }) => {
      if (server.httpServer) attachRuntime(server.httpServer as import('node:http').Server, { workspace: WORKSPACE, ports: PREVIEW_PORTS });
    },
  },
};

export default defineConfig({
  devToolbar: {
    enabled: false,
  },
  integrations: [
    tutorialkit({
      components: { TopBar: './src/components/TopBar.astro' },
    }),
    localRuntime,
  ],
});
