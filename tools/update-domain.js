/*
 * update-domain.js — swap a hardcoded domain inside an obfuscated Nuvio provider.
 *
 * The provider files are packed with javascript-obfuscator: every string literal
 * lives in an array, encoded as base64 with a CUSTOM alphabet (lowercase first)
 * and with the "=" padding stripped. So you can't just find/replace the URL —
 * you have to re-encode the new one the same way.
 *
 * Usage:
 *   node tools/update-domain.js providers/netmirror.js https://net77.cc https://net87.cc
 *
 * It rewrites the file in place and prints how many strings it replaced.
 * If it reports 0 replacements, the old string you gave doesn't appear verbatim —
 * dump the provider's strings first (see tools/dump-strings.js) to find the real one.
 */

const fs = require('fs');

const ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';

function encode(str) {
  const bytes = Buffer.from(str, 'utf8');
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    const n = (b0 << 16) | ((b1 || 0) << 8) | (b2 || 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (b1 !== undefined) out += ALPHABET[(n >> 6) & 63];
    if (b2 !== undefined) out += ALPHABET[n & 63];
  }
  return out; // padding intentionally omitted — the obfuscator strips it
}

const [file, from, to] = process.argv.slice(2);
if (!file || !from || !to) {
  console.error('usage: node tools/update-domain.js <provider.js> <oldUrl> <newUrl>');
  process.exit(1);
}

// A domain can appear both bare and with API paths appended, and each full
// string is encoded separately, so patch every known suffix.
const suffixes = ['', '/api/embed-tmdb/', '/api/proxy/video?url='];

let src = fs.readFileSync(file, 'utf8');
let total = 0;

for (const suffix of suffixes) {
  const oldToken = "'" + encode(from + suffix) + "'";
  const newToken = "'" + encode(to + suffix) + "'";
  const count = src.split(oldToken).length - 1;
  if (count) {
    console.log(`  ${from + suffix}  ->  ${to + suffix}   (${count}x)`);
    src = src.split(oldToken).join(newToken);
    total += count;
  }
}

if (!total) {
  console.log('no matches — nothing changed');
  process.exit(1);
}

fs.writeFileSync(file, src);
console.log(`${total} string(s) replaced in ${file}`);
