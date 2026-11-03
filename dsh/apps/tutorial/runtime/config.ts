/** 本机运行时的配置，开发服务器（astro.config.ts）和 serve.ts 共用。 */
import { resolve } from 'node:path'

/** 课程工作区：页面里的文件写到这里，命令在这里运行。放在仓库内，模块解析能找到根目录的 node_modules。 */
export const WORKSPACE = resolve(import.meta.dirname, '../../../.cache/lesson-workspace')

/** 需要探测的预览端口，和 src/content/tutorial/meta.md 的 `previews` 一致。 */
export const PREVIEW_PORTS = [4300]
