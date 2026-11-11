#!/usr/bin/env node
// Merge named free blocks into the current spec while holding its shared pen lock.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const BASE = '.f-root{height:100%;display:flex;flex-direction:column;gap:32px;padding-block-end:32px}.f-title{margin:0;font-family:var(--cs-font-display);font-size:var(--cs-fs-title)}.f-body{margin:0;font-size:var(--cs-fs-body);line-height:1.5}.f-bridge{margin:0;line-height:1.5;font-size:var(--cs-fs-small);font-weight:700;color:var(--cs-ink)}';
const USAGE = 'usage: node merge-free.mjs --spec FILE [--free-dir DIR] --slides s02 [s03 ...]';

function fail(code, message) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function read(file) {
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(fs.readFileSync(file)).replace(/\r\n?/g, '\n');
  } catch (error) {
    fail(error.code === 'ENOENT' ? 66 : 65, `${file}: ${error.message}`);
  }
}

export function mergeFree(specFile, freeDir, ids) {
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !/^s[0-9]{2}$/.test(id))) {
    fail(64, 'name each slide once, using its stable id (s02)');
  }
  // Read only the explicitly named assets. An old s01 file never replays a cover.
  const blocks = ids.map(id => {
    const html = read(path.join(freeDir, `${id}.html`)).trim();
    const css = BASE + read(path.join(freeDir, `${id}.css`)).trim();
    if (!html || Buffer.byteLength(html) > 12000 || Buffer.byteLength(css) > 6000) {
      fail(2, `${id}: free html must be nonempty and at most 12000 bytes; css including the base at most 6000`);
    }
    return [id, {html, css}];
  });
  const lock = `${specFile}.lock`;
  let lockFd;
  let temp;
  try {
    try {
      lockFd = fs.openSync(lock, 'wx');
    } catch (error) {
      if (error.code === 'EEXIST') fail(75, `another writer holds ${lock}; wait for the handoff`);
      fail(error.code === 'ENOENT' ? 66 : 73, `cannot take the pen: ${error.message}`);
    }
    // No cached spec is accepted. Read the latest bytes only after taking the pen.
    const original = fs.readFileSync(specFile);
    let spec;
    try {
      spec = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(original));
    } catch (error) {
      fail(65, `${specFile}: ${error.message}`);
    }
    if (!spec || !Array.isArray(spec.slides)) fail(2, 'spec.slides must be an array');
    for (const [id, free] of blocks) {
      const matches = spec.slides.filter(slide => slide?.id === id);
      if (matches.length !== 1 || matches[0].type === 'cover') fail(2, `${id}: name one existing inner slide`);
      matches[0].free = free;
    }
    temp = `${specFile}.${process.pid}.${Date.now()}.tmp`;
    const fd = fs.openSync(temp, 'wx');
    try {
      fs.writeFileSync(fd, JSON.stringify(spec, null, 2) + '\n', 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (!fs.readFileSync(specFile).equals(original)) fail(75, 'spec changed while the pen was held; re-read after the handoff');
    fs.renameSync(temp, specFile);
    temp = undefined;
  } catch (error) {
    if (error.exitCode) throw error;
    fail(error.code === 'ENOENT' ? 66 : 73, error.message);
  } finally {
    if (temp) fs.rmSync(temp, {force: true});
    if (lockFd !== undefined) {
      fs.closeSync(lockFd);
      fs.unlinkSync(lock);
    }
  }
}

export function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length === 1 && argv[0] === '--help') {
      console.log(USAGE);
      return 0;
    }
    let spec, freeDir;
    const ids = [];
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if ((arg === '--spec' || arg === '--free-dir') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
        if (arg === '--spec') spec = argv[++i];
        else freeDir = argv[++i];
      } else if (arg === '--slides') {
        while (argv[i + 1] && !argv[i + 1].startsWith('--')) ids.push(argv[++i]);
      } else fail(64, USAGE);
    }
    if (!spec) fail(64, USAGE);
    spec = path.resolve(spec);
    mergeFree(spec, freeDir ? path.resolve(freeDir) : path.join(path.dirname(spec), 'free'), ids);
    console.log(`Merged free blocks: ${ids.join(', ')}`);
    return 0;
  } catch (error) {
    const code = error.exitCode || 70;
    const name = {2: 'E_SCHEMA', 64: 'E_USAGE', 65: 'E_DATA', 66: 'E_NO_INPUT', 73: 'E_WRITE', 75: 'E_CONFLICT'}[code] || 'E_INTERNAL';
    console.error(`cs-error: ${name}: ${error.message}`);
    return code;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main();
