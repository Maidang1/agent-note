// 课程元数据（构建期，仅服务端使用）：导航、模块、原版行号映射都来自 scripts/build_course.py 生成的 nav-order.json。
import fs from 'node:fs';
import path from 'node:path';
import nav from '../nav-order.json';

export type SourceFile = 'bigram.py' | 'gpt.py';
export type Ref = { file: SourceFile; start: number; end: number };
export type LessonMeta = {
  order: number;
  id: string;
  slug: string;
  title: string;
  goal: string;
  module: string;
  refs: Ref[];
};
export type ModuleMeta = { id: string; title: string; milestone: string };

export const modules = nav.modules as ModuleMeta[];
export const lessons = nav.lessons as LessonMeta[];

export const SOURCE_URL = 'https://github.com/karpathy/ng-video-lecture/blob/52201428ed7b46804849dea0b3ccf0de9df1a5c3';
const ORIGINALS = path.resolve('../runtime/tutorial_runtime/_originals');
const cache = new Map<SourceFile, string[]>();

export function originalLines(file: SourceFile): string[] {
  if (!cache.has(file)) {
    cache.set(file, fs.readFileSync(path.join(ORIGINALS, file), 'utf-8').replace(/\n$/, '').split('\n'));
  }
  return cache.get(file)!;
}

export function refLabel(ref: Ref): string {
  return `${ref.file} L${ref.start}–${ref.end}`;
}

export function refSnippet(ref: Ref): string {
  return originalLines(ref.file).slice(ref.start - 1, ref.end).join('\n');
}
