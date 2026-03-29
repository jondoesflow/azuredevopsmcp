const { writeFileSync, readdirSync, readFileSync } = require("fs");
const { join, relative } = require("path");
const os = require("os");

const srcDir = process.argv[2] || ".";
const outPath = join(os.tmpdir(), "bff-unix.zip");

const crc32Table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crc32Table[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crc32Table[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else results.push(full);
  }
  return results;
}

const files = walk(srcDir);
console.log(`Packaging ${files.length} files from ${srcDir}...`);
const locals = [];
const centrals = [];
let offset = 0;

for (const f of files) {
  const rel = relative(srcDir, f).split("\\").join("/");
  const content = readFileSync(f);
  const nameB = Buffer.from(rel);
  const crc = crc32(content);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0, 8);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(content.length, 18);
  lh.writeUInt32LE(content.length, 22);
  lh.writeUInt16LE(nameB.length, 26);
  locals.push(lh, nameB, content);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(content.length, 20);
  ch.writeUInt32LE(content.length, 24);
  ch.writeUInt16LE(nameB.length, 28);
  ch.writeUInt32LE(offset, 42);
  centrals.push(Buffer.concat([ch, nameB]));

  offset += 30 + nameB.length + content.length;
}

const cSize = centrals.reduce((s, b) => s + b.length, 0);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(cSize, 12);
eocd.writeUInt32LE(offset, 16);

writeFileSync(outPath, Buffer.concat([...locals, ...centrals, eocd]));
console.log(`Done: ${outPath} (${(Buffer.concat([...locals, ...centrals, eocd]).length / 1024 / 1024).toFixed(1)} MB)`);
