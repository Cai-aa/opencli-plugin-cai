/**
 * obsidian.ts — OpenCLI adapter for Obsidian vault management
 *
 * Supports:
 *   opencli obsidian search <query>     — Full-text search across all notes
 *   opencli obsidian read <title>       — Read a note by title
 *   opencli obsidian recent [n]         — Recent notes (default 10)
 *   opencli obsidian tags               — List all tags in vault
 *   opencli obsidian new <title> <path> — Create a new note
 *
 * Vault path: ~/Data/Obsidian/CAIVault/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { cli, Strategy } from '@jackwener/opencli/registry';

const VAULT_PATH = path.join(process.env.HOME || '', 'Data', 'Obsidian', 'CAIVault');

function readDirRecursive(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      readDirRecursive(full, files);
    } else if (entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function noteTitle(fp: string): string {
  const basename = path.basename(fp, '.md');
  // Remove date prefix like "2026-01-15 - "
  return basename.replace(/^\d{4}-\d{2}-\d{2}(?:-\s*)?/, '');
}

function readNote(fp: string): { title: string; content: string; path: string; mtime: Date } {
  const stat = fs.statSync(fp);
  const content = fs.readFileSync(fp, 'utf-8');
  return {
    title: noteTitle(fp),
    content,
    path: fp,
    mtime: stat.mtime,
  };
}

function searchInVault(query: string, limit: number) {
  const allFiles = readDirRecursive(VAULT_PATH);
  const lowerQuery = query.toLowerCase();
  const results: any[] = [];

  for (const fp of allFiles) {
    const { title, content, mtime } = readNote(fp);
    const lowerContent = content.toLowerCase();
    const idx = lowerContent.indexOf(lowerQuery);
    if (idx === -1 && !title.toLowerCase().includes(lowerQuery)) continue;

    // Extract context around match
    let context = '';
    if (idx !== -1) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(content.length, idx + query.length + 80);
      context = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
    }

    // Extract tags
    const tagMatches = [...content.matchAll(/#[\w-]+/g)].slice(0, 5).map((m) => m[0]);

    results.push({
      title,
      path: fp.replace(VAULT_PATH + '/', ''),
      context: context || title,
      tags: tagMatches.join(' '),
      updated: mtime.toISOString().slice(0, 10),
      score: idx !== -1 ? 'content' : 'title',
    });

    if (results.length >= limit) break;
  }

  return results;
}

// ─── Command: search ────────────────────────────────────────────────────

cli({
  site: 'myvault',
  name: 'search',
  description: 'Search notes in Obsidian vault',
  domain: 'file://',
  strategy: Strategy.PUBLIC,

  args: [
    { name: 'query', required: true, positional: true, help: 'Search query' },
    { name: 'limit', type: 'int', default: 15, help: 'Max results' },
  ],

  columns: ['rank', 'title', 'tags', 'updated', 'path'],

  func: async (_page, kwargs) => {
    const { query, limit = 15 } = kwargs;
    const results = searchInVault(String(query), Number(limit));

    return results.map((r, i) => ({
      rank: i + 1,
      title: r.title,
      tags: r.tags || '-',
      updated: r.updated,
      path: r.path,
      context: r.context,
    }));
  },
});

// ─── Command: read ─────────────────────────────────────────────────────

cli({
  site: 'myvault',
  name: 'read',
  description: 'Read a note by title',
  domain: 'file://',
  strategy: Strategy.PUBLIC,

  args: [
    { name: 'title', required: true, positional: true, help: 'Note title (or partial name)' },
  ],

  columns: ['title', 'path', 'updated'],

  func: async (_page, kwargs) => {
    const { title } = kwargs;
    const query = String(title).toLowerCase();
    const allFiles = readDirRecursive(VAULT_PATH);

    // Find best match
    const matches = allFiles
      .map((fp) => {
        const t = noteTitle(fp);
        const score = t.toLowerCase() === query ? 2 : t.toLowerCase().includes(query) ? 1 : 0;
        return { fp, t, score };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      console.log(`No note found matching: ${title}`);
      return [];
    }

    const { fp, t } = matches[0];
    const { content, mtime } = readNote(fp);

    console.log(`\n📄 ${t}\n${'─'.repeat(60)}\n${content}\n${'─'.repeat(60)}\n`);

    return [
      {
        title: t,
        path: fp.replace(VAULT_PATH + '/', ''),
        updated: mtime.toISOString().slice(0, 10),
        lines: content.split('\n').length,
        chars: content.length,
      },
    ];
  },
});

// ─── Command: recent ────────────────────────────────────────────────────

cli({
  site: 'myvault',
  name: 'recent',
  description: 'Recent notes in vault',
  domain: 'file://',
  strategy: Strategy.PUBLIC,

  args: [
    { name: 'limit', type: 'int', default: 10, help: 'Number of notes' },
  ],

  columns: ['rank', 'title', 'tags', 'updated', 'path'],

  func: async (_page, kwargs) => {
    const { limit = 10 } = kwargs;
    const allFiles = readDirRecursive(VAULT_PATH);

    const withMtime = allFiles.map((fp) => {
      const stat = fs.statSync(fp);
      const { title, content } = readNote(fp);
      const tagMatches = [...content.matchAll(/#[\w-]+/g)].slice(0, 5).map((m) => m[0]);
      return { fp, title, tags: tagMatches.join(' '), mtime: stat.mtime };
    });

    withMtime.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return withMtime.slice(0, Number(limit)).map((r, i) => ({
      rank: i + 1,
      title: r.title,
      tags: r.tags || '-',
      updated: r.mtime.toISOString().slice(0, 10),
      path: r.fp.replace(VAULT_PATH + '/', ''),
    }));
  },
});

// ─── Command: tags ────────────────────────────────────────────────────

cli({
  site: 'myvault',
  name: 'tags',
  description: 'List all tags in vault',
  domain: 'file://',
  strategy: Strategy.PUBLIC,

  args: [
    { name: 'limit', type: 'int', default: 30, help: 'Max tags to show' },
  ],

  columns: ['rank', 'tag', 'count'],

  func: async (_page, kwargs) => {
    const { limit = 30 } = kwargs;
    const allFiles = readDirRecursive(VAULT_PATH);
    const tagCount: Record<string, number> = {};

    for (const fp of allFiles) {
      const { content } = readNote(fp);
      const tags = content.match(/#[\w-]+/g) || [];
      for (const tag of tags) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }

    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Number(limit))
      .map(([tag, count], i) => ({ rank: i + 1, tag, count }));
  },
});

// ─── Command: new ─────────────────────────────────────────────────────

cli({
  site: 'myvault',
  name: 'new',
  description: 'Create a new note in vault',
  domain: 'file://',
  strategy: Strategy.PUBLIC,

  args: [
    { name: 'title', required: true, positional: true, help: 'Note title' },
    { name: 'folder', required: false, help: 'Folder path inside vault' },
  ],

  columns: ['title', 'path', 'status'],

  func: async (_page, kwargs) => {
    const { title, folder } = kwargs;
    const titleStr = String(title);
    const folderStr = String(folder || '').trim();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date} - ${titleStr}.md`;

    let targetDir = VAULT_PATH;
    if (folderStr) {
      targetDir = path.join(VAULT_PATH, folderStr);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }

    const fp = path.join(targetDir, filename);
    const content = `# ${titleStr}\n\n`;

    fs.writeFileSync(fp, content, 'utf-8');

    return [{ title: titleStr, path: fp.replace(VAULT_PATH + '/', ''), status: '✅ Created' }];
  },
});
