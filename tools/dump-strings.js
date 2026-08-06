/*
 * dump-strings.js — print every decoded string inside an obfuscated Nuvio provider.
 *
 * Use this to find what domain/endpoint a provider actually hardcodes, so you know
 * what to feed update-domain.js.
 *
 * Usage:
 *   node tools/dump-strings.js providers/netmirror.js
 *   node tools/dump-strings.js providers/netmirror.js http     # filter to matches
 */

const fs = require('fs');
const vm = require('vm');

const [file, filter] = process.argv.slice(2);
if (!file) {
  console.error('usage: node tools/dump-strings.js <provider.js> [filter]');
  process.exit(1);
}

const src = fs.readFileSync(file, 'utf8');

// The obfuscator emits a decoder shaped like:
//   function _0xABCD(_0xa, _0xb) { _0xa = _0xa - 0xNN; ... }
// Find its name so we can call it for every index.
const m = src.match(/function (_0x[0-9a-f]+)\((_0x[0-9a-f]+),(_0x[0-9a-f]+)\)\{\2=\2-(0x[0-9a-f]+);/);
if (!m) {
  console.error('no obfuscated decoder found — file may be plain JS, just read it');
  process.exit(1);
}

const ctx = {
  module: { exports: {} },
  exports: {},
  console: { log() {}, error() {}, warn() {}, info() {}, debug() {} },
  setTimeout, clearTimeout, Buffer, URL, URLSearchParams,
  TextEncoder, TextDecoder,
  fetch: () => Promise.reject(new Error('offline')),
  require: () => ({}),
};
ctx.global = ctx;
ctx.globalThis = ctx;
ctx.window = ctx;

vm.createContext(ctx);
vm.runInContext(src + `\n;globalThis.__DECODE=${m[1]};`, ctx, { timeout: 10000 });

const decode = ctx.__DECODE;
const re = filter ? new RegExp(filter, 'i') : null;

for (let i = 0; i < 0x600; i++) {
  let v;
  try { v = decode(i); } catch (e) { continue; }
  if (typeof v !== 'string' || v.length < 3) continue;
  if (re && !re.test(v)) continue;
  console.log(i.toString(16) + '\t' + v);
}
