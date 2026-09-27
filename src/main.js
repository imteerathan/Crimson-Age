const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { autoUpdater } = require('electron-updater');

let win;
let db;
let logFile;
let updaterState = {
  status: 'IDLE',
  message: 'Updater ready',
  version: app.getVersion(),
  downloaded: false,
  error: null
};

function dataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function baselineSnapshotDir() {
  return path.join(dataDir(), 'baseline-snapshots');
}

function emitUpdaterState(extra = {}) {
  updaterState = { ...updaterState, ...extra, version: app.getVersion() };
  if (win && !win.isDestroyed()) win.webContents.send('updater:state', updaterState);
  console.log('Updater state', updaterState);
}

function initLogging() {
  const logsDir = app.getPath('logs');
  fs.mkdirSync(logsDir, { recursive: true });
  logFile = path.join(logsDir, 'crimson-age.log');

  const write = (level, args) => {
    const line = `[${new Date().toISOString()}] ${level} ${args.map(v => {
      if (v instanceof Error) return v.stack || v.message;
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch { return String(v); }
    }).join(' ')}\n`;
    try { fs.appendFileSync(logFile, line, 'utf8'); } catch {}
  };

  for (const [name, fn] of [['log', console.log], ['warn', console.warn], ['error', console.error]]) {
    console[name] = (...args) => { write(name.toUpperCase(), args); fn(...args); };
  }

  process.on('uncaughtException', err => write('UNCAUGHT_EXCEPTION', [err]));
  process.on('unhandledRejection', reason => write('UNHANDLED_REJECTION', [reason]));
  console.log('Crimson Age session started', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    logFile
  });
}

function initDb() {
  fs.mkdirSync(dataDir(), { recursive: true });
  const dbPath = path.join(dataDir(), 'crimson-age.db');

  db = new Database(dbPath);
  db.pragma('journal_mode=WAL');
  try {
    const columns = db.prepare("PRAGMA table_info(save_baseline)").all();
    if (!columns.some(c => c.name === 'snapshot_path')) {
      db.exec('ALTER TABLE save_baseline ADD COLUMN snapshot_path TEXT');
    }
  } catch (err) {
    console.error('save_baseline migration failed', err);
    throw err;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS player_state(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ca_record(
      ca_id TEXT PRIMARY KEY,
      type TEXT,
      name TEXT,
      region TEXT,
      status TEXT NOT NULL DEFAULT 'UNKNOWN',
      denominator INTEGER NOT NULL DEFAULT 0,
      data_json TEXT
    );
    CREATE TABLE IF NOT EXISTS save_baseline(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      last_modified TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      snapshot_path TEXT
    );
  `);

  const count = db.prepare('SELECT COUNT(*) n FROM player_state').get().n;
  if (!count) {
    db.prepare('INSERT INTO player_state(id,json) VALUES(1,?)')
      .run(JSON.stringify({ phase: 'D1', finalPhase: 'D10', items: [] }));
  }
}

const SAVE_DEFAULT_KEY_HEX = '9a4beb127f9e748b148d6690c25cc9379a315bd56c28af6319fd559f1152ac00';
const SAVE_HEADER_SIZE = 0x80;
const SAVE_NONCE_OFFSET = 0x1A;
const SAVE_HMAC_OFFSET = 0x2A;
const SAVE_NONCE_SIZE = 0x10;
const SAVE_HMAC_SIZE = 0x20;
const RAW_MAGIC = Buffer.from([0xFF, 0xFF, 0x04, 0x00]);

function u16le(buf, offset) {
  if (offset + 2 > buf.length) throw new Error('u16 read overruns buffer');
  return buf.readUInt16LE(offset);
}

function u32le(buf, offset) {
  if (offset + 4 > buf.length) throw new Error('u32 read overruns buffer');
  return buf.readUInt32LE(offset);
}

function rotl32(v, n) {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function chachaQuarterRound(state, a, b, c, d) {
  state[a] = (state[a] + state[b]) >>> 0;
  state[d] = rotl32((state[d] ^ state[a]) >>> 0, 16);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotl32((state[b] ^ state[c]) >>> 0, 12);
  state[a] = (state[a] + state[b]) >>> 0;
  state[d] = rotl32((state[d] ^ state[a]) >>> 0, 8);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotl32((state[b] ^ state[c]) >>> 0, 7);
}

function chacha20Block(key32, counterNonce16) {
  if (key32.length !== 32 || counterNonce16.length !== 16) {
    throw new Error('ChaCha20 requires a 32-byte key and 16-byte counter/nonce');
  }
  const state = new Uint32Array(16);
  state.set([0x61707865, 0x3320646E, 0x79622D32, 0x6B206574]);
  for (let i = 0; i < 8; i++) state[4 + i] = key32.readUInt32LE(i * 4);
  for (let i = 0; i < 4; i++) state[12 + i] = counterNonce16.readUInt32LE(i * 4);

  const working = new Uint32Array(state);
  for (let i = 0; i < 10; i++) {
    chachaQuarterRound(working, 0, 4, 8, 12);
    chachaQuarterRound(working, 1, 5, 9, 13);
    chachaQuarterRound(working, 2, 6, 10, 14);
    chachaQuarterRound(working, 3, 7, 11, 15);
    chachaQuarterRound(working, 0, 5, 10, 15);
    chachaQuarterRound(working, 1, 6, 11, 12);
    chachaQuarterRound(working, 2, 7, 8, 13);
    chachaQuarterRound(working, 3, 4, 9, 14);
  }

  const out = Buffer.alloc(64);
  for (let i = 0; i < 16; i++) out.writeUInt32LE((working[i] + state[i]) >>> 0, i * 4);
  return out;
}

function chacha20Xor(key32, counterNonce16, data) {
  const words = [
    counterNonce16.readUInt32LE(0),
    counterNonce16.readUInt32LE(4),
    counterNonce16.readUInt32LE(8),
    counterNonce16.readUInt32LE(12)
  ];
  const out = Buffer.alloc(data.length);
  for (let pos = 0; pos < data.length; pos += 64) {
    const ctr = Buffer.alloc(16);
    for (let i = 0; i < 4; i++) ctr.writeUInt32LE(words[i] >>> 0, i * 4);
    const stream = chacha20Block(key32, ctr);
    const count = Math.min(64, data.length - pos);
    for (let i = 0; i < count; i++) out[pos + i] = data[pos + i] ^ stream[i];
    words[0] = (words[0] + 1) >>> 0;
    if (words[0] === 0) words[1] = (words[1] + 1) >>> 0;
  }
  return out;
}

function lz4BlockDecompress(src, expectedSize) {
  const dst = Buffer.alloc(expectedSize);
  let ip = 0;
  let op = 0;

  while (ip < src.length) {
    const token = src[ip++];
    let literalLen = token >>> 4;
    if (literalLen === 15) {
      while (ip < src.length) {
        const s = src[ip++];
        literalLen += s;
        if (s !== 255) break;
      }
    }
    if (ip + literalLen > src.length || op + literalLen > expectedSize) {
      throw new Error('LZ4 literal overruns input/output');
    }
    src.copy(dst, op, ip, ip + literalLen);
    ip += literalLen;
    op += literalLen;
    if (ip >= src.length) break;

    if (ip + 2 > src.length) throw new Error('LZ4 offset overruns input');
    const matchOffset = src.readUInt16LE(ip);
    ip += 2;
    if (matchOffset === 0 || matchOffset > op) throw new Error('LZ4 invalid match offset');

    let matchLen = token & 0x0F;
    if (matchLen === 15) {
      while (ip < src.length) {
        const s = src[ip++];
        matchLen += s;
        if (s !== 255) break;
      }
    }
    matchLen += 4;
    if (op + matchLen > expectedSize) throw new Error('LZ4 match overruns output');

    for (let i = 0; i < matchLen; i++) {
      dst[op + i] = dst[op - matchOffset + i];
    }
    op += matchLen;
  }

  if (op !== expectedSize) throw new Error(`LZ4 decompressed size mismatch: expected ${expectedSize}, got ${op}`);
  return dst;
}

function printableStrings(buf, minLength = 6) {
  const strings = [];
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const ok = i < buf.length && buf[i] >= 32 && buf[i] <= 126;
    if (ok && start < 0) start = i;
    if ((!ok || i === buf.length) && start >= 0) {
      const end = i;
      if (end - start >= minLength) {
        strings.push({ offset: start, length: end - start, value: buf.subarray(start, end).toString('utf8').slice(0, 240) });
      }
      start = -1;
    }
  }
  return strings;
}

function fnv1a64Append(hash, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  const prime = 0x100000001B3n;
  const mask = 0xFFFFFFFFFFFFFFFFn;
  let out = hash;
  for (const byte of data) {
    out ^= BigInt(byte);
    out = (out * prime) & mask;
  }
  return out;
}

function fnv1a64String(hash, value) {
  return fnv1a64Append(fnv1a64Append(hash, value), Buffer.from([0]));
}

function parseParcSchema(raw) {
  if (!raw.subarray(0, 4).equals(RAW_MAGIC)) throw new Error('Raw blob does not start with PARC magic FFFF0400');

  let pos = 0x0E;
  const headerTag = u16le(raw, pos); pos += 2;
  const headerZero = u16le(raw, pos); pos += 2;
  const typeCount = u16le(raw, pos); pos += 2;
  const rootLen = u32le(raw, pos); pos += 4;
  if (rootLen > raw.length - pos) throw new Error('Root type name overruns raw blob');
  const rootType = raw.subarray(pos, pos + rootLen).toString('utf8'); pos += rootLen;

  const types = [];
  let currentName = rootType;
  let fingerprint = 14695981039346656037n;

  for (let typeIndex = 0; typeIndex < typeCount; typeIndex++) {
    const startOffset = pos;
    const fieldCount = u16le(raw, pos); pos += 2;
    const fields = [];
    fingerprint = fnv1a64String(fingerprint, currentName);

    for (let i = 0; i < fieldCount; i++) {
      const nameLen = u32le(raw, pos); pos += 4;
      if (nameLen > raw.length - pos) throw new Error('Field name overruns raw blob');
      const name = raw.subarray(pos, pos + nameLen).toString('utf8'); pos += nameLen;

      const typeLen = u32le(raw, pos); pos += 4;
      if (typeLen > raw.length - pos) throw new Error('Field type overruns raw blob');
      const typeName = raw.subarray(pos, pos + typeLen).toString('utf8'); pos += typeLen;

      const metaKind = u16le(raw, pos);
      const metaSize = u16le(raw, pos + 2);
      const metaAux = u32le(raw, pos + 4);
      pos += 8;

      fields.push({ index: i, name, typeName, metaKind, metaSize, metaAux });
      fingerprint = fnv1a64String(fingerprint, name);
      fingerprint = fnv1a64String(fingerprint, typeName);
      const meta = Buffer.alloc(8);
      meta.writeUInt16LE(metaKind, 0);
      meta.writeUInt16LE(metaSize, 2);
      meta.writeUInt32LE(metaAux, 4);
      fingerprint = fnv1a64Append(fingerprint, meta);
    }

    types.push({ index: typeIndex, name: currentName, fieldCount, startOffset, endOffset: pos, fields });

    if (typeIndex + 1 < typeCount) {
      const nextLen = u32le(raw, pos); pos += 4;
      if (nextLen > raw.length - pos) throw new Error('Next type name overruns raw blob');
      currentName = raw.subarray(pos, pos + nextLen).toString('utf8'); pos += nextLen;
    }
  }

  return { headerTag, headerZero, typeCount, rootType, schemaEnd: pos, fingerprint: fingerprint.toString(16).padStart(16, '0'), types };
}

function parseParcToc(raw, schema) {
  if (schema.schemaEnd + 12 > raw.length) throw new Error('PARC TOC header overruns raw blob');

  const prefixZero = u32le(raw, schema.schemaEnd);
  const entryCount = u32le(raw, schema.schemaEnd + 4);
  const streamSize = u32le(raw, schema.schemaEnd + 8);
  const tocStart = schema.schemaEnd + 12;
  const maxEntries = Math.floor(Math.max(0, raw.length - tocStart) / 20);
  const parseCount = Math.min(entryCount, maxEntries);
  const classMap = new Map();
  const entries = [];

  for (let i = 0; i < parseCount; i++) {
    const off = tocStart + i * 20;
    const classIndex = u32le(raw, off);
    const sentinel1 = u32le(raw, off + 4);
    const sentinel2 = u32le(raw, off + 8);
    const dataOffset = u32le(raw, off + 12);
    const dataSize = u32le(raw, off + 16);
    const className = schema.types[classIndex]?.name || `<class_${classIndex}>`;

    const current = classMap.get(classIndex) || { classIndex, className, count: 0, totalBytes: 0, firstDataOffset: null, lastDataOffset: null, invalidBounds: 0 };
    current.count++;
    current.totalBytes += dataSize;
    current.firstDataOffset = current.firstDataOffset === null ? dataOffset : Math.min(current.firstDataOffset, dataOffset);
    current.lastDataOffset = current.lastDataOffset === null ? dataOffset : Math.max(current.lastDataOffset, dataOffset);
    if (dataOffset > raw.length || dataSize > raw.length - dataOffset) current.invalidBounds++;
    classMap.set(classIndex, current);

    if (entries.length < 128) entries.push({ index: i, classIndex, className, sentinel1, sentinel2, dataOffset, dataSize });
  }

  return {
    prefixZero,
    entryCount,
    parsedEntryCount: parseCount,
    streamSize,
    streamSizeMatchesRaw: streamSize === raw.length,
    boundsValid: Array.from(classMap.values()).every(x => x.invalidBounds === 0) && parseCount === entryCount,
    classSummaries: Array.from(classMap.values()).sort((a, b) => a.classIndex - b.classIndex),
    firstEntries: entries
  };
}

function decodeSaveContainer(filePath) {
  const fileData = fs.readFileSync(filePath);
  if (fileData.length < SAVE_HEADER_SIZE) throw new Error('SAVE container too small');

  if (!fileData.subarray(0, 4).equals(RAW_MAGIC) && fileData.subarray(0, 4).toString('ascii') !== 'SAVE') {
    throw new Error('Unsupported save: expected SAVE container or raw PARC blob');
  }

  if (fileData.subarray(0, 4).equals(RAW_MAGIC)) {
    const rawSha256 = crypto.createHash('sha256').update(fileData).digest('hex');
    const schema = parseParcSchema(fileData);
    const toc = parseParcToc(fileData, schema);
    return {
      mode: 'RAW_PARC',
      fileName: path.basename(filePath),
      fileSize: fileData.length,
      rawSize: fileData.length,
      rawSha256,
      rawMagic: fileData.subarray(0, 4).toString('hex'),
      containerPresent: false,
      hmacOk: null,
      compression: 'NONE',
      decryption: 'NONE',
      schema,
      toc,
      rawInterestingStrings: printableStrings(fileData).filter(x => /savedGameVersion|KnowledgeSaveData|QuestSaveData|main.?quest|version/i.test(x.value)).slice(0, 200)
    };
  }

  const payloadSize = u32le(fileData, 0x16);
  if (fileData.length !== SAVE_HEADER_SIZE + payloadSize) throw new Error('SAVE payload size does not match file length');

  const version = u16le(fileData, 0x04);
  const flags = u16le(fileData, 0x06);
  const floatFlag = fileData.readFloatLE(0x08);
  const field0C = u32le(fileData, 0x0C);
  const field10 = u16le(fileData, 0x10);
  const uncompressedSize = u32le(fileData, 0x12);
  const nonce = fileData.subarray(SAVE_NONCE_OFFSET, SAVE_NONCE_OFFSET + SAVE_NONCE_SIZE);
  const storedHmac = fileData.subarray(SAVE_HMAC_OFFSET, SAVE_HMAC_OFFSET + SAVE_HMAC_SIZE);
  const ciphertext = fileData.subarray(SAVE_HEADER_SIZE, SAVE_HEADER_SIZE + payloadSize);

  const key = Buffer.from(SAVE_DEFAULT_KEY_HEX, 'hex');
  const compressedPlaintext = chacha20Xor(key, nonce, ciphertext);
  const calculatedHmac = crypto.createHmac('sha256', key).update(compressedPlaintext).digest();
  const hmacOk = storedHmac.length === calculatedHmac.length && crypto.timingSafeEqual(storedHmac, calculatedHmac);
  const raw = lz4BlockDecompress(compressedPlaintext, uncompressedSize);
  const rawSha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const schema = parseParcSchema(raw);
  const toc = parseParcToc(raw, schema);
  const interesting = printableStrings(raw).filter(x => /savedGameVersion|KnowledgeSaveData|QuestSaveData|main.?quest|version/i.test(x.value)).slice(0, 200);

  return {
    mode: 'READ_ONLY_CONTAINER_DECODE',
    fileName: path.basename(filePath),
    fileSize: fileData.length,
    rawSize: raw.length,
    rawSha256,
    rawMagic: raw.subarray(0, 4).toString('hex'),
    containerPresent: true,
    version,
    flags,
    floatFlag,
    field0C,
    field10,
    uncompressedSize,
    payloadSize,
    payloadCompressionRatio: Number((raw.length / Math.max(1, payloadSize)).toFixed(4)),
    nonceHex: nonce.toString('hex'),
    storedHmacHex: storedHmac.toString('hex'),
    calculatedHmacHex: calculatedHmac.toString('hex'),
    hmacOk,
    compression: 'LZ4_BLOCK',
    decryption: 'CHACHA20',
    schema,
    toc,
    rawInterestingStrings: interesting,
    limitations: [
      'Read-only diagnostic decode. No save file writes are performed.',
      'Schema field semantics are reported only where directly decoded from the PARC schema.',
      'Object field values are not yet fully decoded.'
    ]
  };
}

function readDecodedRaw(filePath) {
  const fileData = fs.readFileSync(filePath);
  if (fileData.subarray(0, 4).equals(RAW_MAGIC)) return fileData;
  const payloadSize = u32le(fileData, 0x16);
  const nonce = fileData.subarray(SAVE_NONCE_OFFSET, SAVE_NONCE_OFFSET + SAVE_NONCE_SIZE);
  const ciphertext = fileData.subarray(SAVE_HEADER_SIZE, SAVE_HEADER_SIZE + payloadSize);
  const plaintext = chacha20Xor(Buffer.from(SAVE_DEFAULT_KEY_HEX, 'hex'), nonce, ciphertext);
  return lz4BlockDecompress(plaintext, u32le(fileData, 0x12));
}

function compareDecodedSaveFiles(firstPath, secondPath, options = {}) {
  const maxChangedChunks = options.maxChangedChunks === undefined ? 200 : options.maxChangedChunks;
  const first = decodeSaveContainer(firstPath);
  const second = decodeSaveContainer(secondPath);
  const firstRaw = readDecodedRaw(firstPath);
  const secondRaw = readDecodedRaw(secondPath);
  const minLength = Math.min(firstRaw.length, secondRaw.length);
  const chunkSize = 64;
  const changedChunks = [];
  let changedBytes = 0;
  let firstChangedOffset = null;
  let lastChangedOffset = null;

  for (let offset = 0; offset < minLength; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, minLength);
    let different = false;
    for (let i = offset; i < end; i++) {
      if (firstRaw[i] !== secondRaw[i]) {
        different = true;
        changedBytes++;
        if (firstChangedOffset === null) firstChangedOffset = i;
        lastChangedOffset = i;
      }
    }
    if (different) changedChunks.push({ offset, length: end - offset });
  }

  if (firstRaw.length !== secondRaw.length) {
    const start = minLength;
    const extra = Math.abs(firstRaw.length - secondRaw.length);
    changedBytes += extra;
    if (firstChangedOffset === null) firstChangedOffset = start;
    lastChangedOffset = Math.max(start, Math.max(firstRaw.length, secondRaw.length) - 1);
    changedChunks.push({ offset: start, length: extra, sizeChanged: true });
  }

  return {
    mode: 'READ_ONLY_RAW_PARC_DIFF',
    first: {
      fileName: path.basename(firstPath),
      fileSize: fs.statSync(firstPath).size,
      rawSize: first.rawSize,
      rawSha256: first.rawSha256,
      schemaFingerprint: first.schema.fingerprint,
      schemaTypeCount: first.schema.typeCount,
      tocEntryCount: first.toc.entryCount,
      tocParsedEntryCount: first.toc.parsedEntryCount
    },
    second: {
      fileName: path.basename(secondPath),
      fileSize: fs.statSync(secondPath).size,
      rawSize: second.rawSize,
      rawSha256: second.rawSha256,
      schemaFingerprint: second.schema.fingerprint,
      schemaTypeCount: second.schema.typeCount,
      tocEntryCount: second.toc.entryCount,
      tocParsedEntryCount: second.toc.parsedEntryCount
    },
    changed: first.rawSha256 !== second.rawSha256,
    changedBytes,
    changedChunkCount: changedChunks.length,
    firstChangedOffset,
    lastChangedOffset,
    changedChunks: maxChangedChunks === null ? changedChunks : changedChunks.slice(0, maxChangedChunks),
    changedChunksReturned: maxChangedChunks === null ? changedChunks.length : Math.min(changedChunks.length, maxChangedChunks),
    changedChunksTruncated: maxChangedChunks !== null && changedChunks.length > maxChangedChunks,
    schemaSame: first.schema.fingerprint === second.schema.fingerprint,
    tocCountDelta: second.toc.entryCount - first.toc.entryCount,
    rawSizeDelta: second.rawSize - first.rawSize,
    note: 'Raw PARC byte differences are observations only. Object/field semantic meaning is not inferred.'
  };
}

function analyzeSaveStructure(filePath) {
  const stat = fs.statSync(filePath);
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const printable = b => Array.from(b, c => c >= 32 && c <= 126 ? String.fromCharCode(c) : '.').join('');

  const strings = [];
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const ok = i < buf.length && buf[i] >= 32 && buf[i] <= 126;
    if (ok && start < 0) start = i;
    if ((!ok || i === buf.length) && start >= 0) {
      const end = i;
      if (end - start >= 6) strings.push({ offset: start, length: end - start, value: buf.subarray(start, end).toString('utf8').slice(0, 160) });
      start = -1;
    }
  }

  const interesting = strings.filter(x => /savedGameVersion|KnowledgeSaveData|QuestSaveData|HMAC|main.?quest|version/i.test(x.value)).slice(0, 80);
  const candidates = [];
  const scanLimit = Math.min(buf.length, 1024 * 1024);
  for (let o = 0; o + 8 <= scanLimit; o += 4) {
    const dataOffset = buf.readUInt32LE(o);
    const length = buf.readUInt32LE(o + 4);
    if (dataOffset > 0 && dataOffset < buf.length && length >= 4 && length <= buf.length * 0.25 && dataOffset + length <= buf.length) {
      candidates.push({ offset: o, dataOffset, length });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.dataOffset + ':' + c.length;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
    if (unique.length >= 40) break;
  }

  const headerSize = Math.min(64, buf.length);
  let savedGameVersion = null;
  const marker = strings.find(x => /savedGameVersion/i.test(x.value));
  if (marker) {
    const nearby = strings.find(x => x.offset > marker.offset && x.offset - marker.offset < 256 && /\d+\./.test(x.value));
    savedGameVersion = nearby?.value || marker.value;
  }

  return {
    fileName: path.basename(filePath),
    fileSize: stat.size,
    lastModified: stat.mtime.toISOString(),
    sha256,
    readOnly: true,
    format: {
      headerBytesInspected: headerSize,
      headerHex: buf.subarray(0, headerSize).toString('hex'),
      headerAscii: printable(buf.subarray(0, Math.min(32, buf.length))),
      candidatePointerLengthPairs: unique
    },
    strings: { printableStringCount: strings.length, interesting },
    known: {
      savedGameVersion,
      semanticMappings: 'CONTROLLED_LIMITATION: semantic type/pointer mapping is not inferred by this analyzer.'
    },
    integrity: {
      sha256: 'PASS',
      sourceFileModified: false,
      hmac: 'NOT_RECALCULATED'
    },
    analyzer: {
      mode: 'READ_ONLY_STRUCTURAL',
      heuristicCandidates: true,
      note: 'Pointer/length candidates are structural hints, not confirmed schema records.'
    }
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '../public/index.html'));
}

function configureUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  if (!app.isPackaged) {
    emitUpdaterState({
      status: 'DEV_NOT_PACKAGED',
      message: 'Update checks are enabled in packaged Windows builds.'
    });
    return;
  }

  autoUpdater.on('checking-for-update', () =>
    emitUpdaterState({ status: 'CHECKING', message: 'Checking GitHub for updates…', error: null })
  );
  autoUpdater.on('update-available', info =>
    emitUpdaterState({
      status: 'UPDATE_AVAILABLE',
      message: `Version ${info.version} is available.`,
      availableVersion: info.version,
      releaseName: info.releaseName || ''
    })
  );
  autoUpdater.on('update-not-available', info =>
    emitUpdaterState({
      status: 'UP_TO_DATE',
      message: `Already on the latest version (${info.version}).`,
      availableVersion: null,
      downloaded: false,
      error: null
    })
  );
  autoUpdater.on('download-progress', p =>
    emitUpdaterState({
      status: 'DOWNLOADING',
      message: `Downloading update… ${Math.round(p.percent)}%`,
      progress: Math.round(p.percent),
      downloaded: false
    })
  );
  autoUpdater.on('update-downloaded', info =>
    emitUpdaterState({
      status: 'READY_TO_INSTALL',
      message: `Update ${info.version} is ready. Restart to install.`,
      availableVersion: info.version,
      downloaded: true,
      progress: 100,
      error: null
    })
  );
  autoUpdater.on('error', err =>
    emitUpdaterState({
      status: 'ERROR',
      message: err?.message || 'Update failed.',
      error: err?.stack || String(err)
    })
  );
}

ipcMain.handle('db:getState', () => {
  console.log('IPC db:getState');
  return JSON.parse(db.prepare('SELECT json FROM player_state WHERE id=1').get().json);
});

ipcMain.handle('db:setState', (_, state) => {
  console.log('IPC db:setState', { itemCount: Array.isArray(state?.items) ? state.items.length : 0 });
  db.prepare('UPDATE player_state SET json=? WHERE id=1').run(JSON.stringify(state));
  return true;
});

ipcMain.handle('db:info', () => {
  console.log('IPC db:info');
  return {
    path: path.join(dataDir(), 'crimson-age.db'),
    records: db.prepare('SELECT COUNT(*) n FROM ca_record').get().n,
    baselines: db.prepare('SELECT COUNT(*) n FROM save_baseline').get().n,
    logsPath: app.getPath('logs'),
    version: app.getVersion()
  };
});

ipcMain.handle('save:listBaselines', () => {
  console.log('IPC save:listBaselines');
  return db.prepare(`
    SELECT id, label, file_name AS fileName, file_path AS filePath,
           file_size AS fileSize, last_modified AS lastModified,
           sha256, created_at AS createdAt,
           snapshot_path AS snapshotPath
    FROM save_baseline
    ORDER BY id DESC
  `).all();
});

ipcMain.handle('save:pick', async () => {
  console.log('IPC save:pick opened');

  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Save files', extensions: ['save', 'bin', 'dat'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    console.log('Save picker canceled');
    return null;
  }

  const filePath = result.filePaths[0];
  const stat = await fs.promises.stat(filePath);

  const sha256 = await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });

  const baseline = {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    lastModified: stat.mtime.toISOString(),
    sha256,
    readOnly: true,
    status: 'BASELINE_READY'
  };

  const createdAt = new Date().toISOString();

  fs.mkdirSync(baselineSnapshotDir(), { recursive: true });

  const insert = db.prepare(`
    INSERT INTO save_baseline(label,file_name,file_path,file_size,last_modified,sha256,created_at)
    VALUES(?,?,?,?,?,?,?)
  `).run(null, baseline.name, baseline.path, baseline.size,
         baseline.lastModified, baseline.sha256, createdAt);

  const snapshotPath = path.join(
    baselineSnapshotDir(),
    `baseline-${insert.lastInsertRowid}-${baseline.sha256}.save`
  );
  await fs.promises.copyFile(baseline.path, snapshotPath);
  const snapshotStat = await fs.promises.stat(snapshotPath);
  if (snapshotStat.size !== baseline.size) {
    throw new Error('Baseline snapshot size verification failed.');
  }

  db.prepare('UPDATE save_baseline SET snapshot_path=? WHERE id=?')
    .run(snapshotPath, insert.lastInsertRowid);

  console.log('Save baseline captured', {
    file: baseline.name,
    size: baseline.size,
    sha256: baseline.sha256,
    readOnly: baseline.readOnly
  });

  return { ...baseline, createdAt };
});


function compareSaveFiles(firstPath, secondPath, options = {}) {
  const maxChangedChunks = options.maxChangedChunks === undefined ? 200 : options.maxChangedChunks;
  if (!firstPath || !secondPath) throw new Error('Two save files are required.');
  if (firstPath === secondPath) throw new Error('Cannot compare the same snapshot twice.');
  if (!fs.existsSync(firstPath) || !fs.existsSync(secondPath)) throw new Error('One or both save files no longer exist.');

  const first = fs.readFileSync(firstPath);
  const second = fs.readFileSync(secondPath);
  const firstSha256 = crypto.createHash('sha256').update(first).digest('hex');
  const secondSha256 = crypto.createHash('sha256').update(second).digest('hex');
  const minLength = Math.min(first.length, second.length);
  const chunkSize = 64;
  const changedChunks = [];
  let changedBytes = 0;
  let firstChangedOffset = null;
  let lastChangedOffset = null;

  for (let offset = 0; offset < minLength; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, minLength);
    let different = false;
    for (let i = offset; i < end; i++) {
      if (first[i] !== second[i]) {
        different = true;
        changedBytes++;
        if (firstChangedOffset === null) firstChangedOffset = i;
        lastChangedOffset = i;
      }
    }
    if (different) changedChunks.push({ offset, length: end - offset });
  }

  if (first.length !== second.length) {
    const start = minLength;
    const extraLength = Math.abs(first.length - second.length);
    changedBytes += extraLength;
    if (firstChangedOffset === null) firstChangedOffset = start;
    lastChangedOffset = Math.max(start, Math.max(first.length, second.length) - 1);
    changedChunks.push({ offset: start, length: extraLength, sizeChanged: true });
  }

  return {
    mode: 'READ_ONLY_BINARY_DIFF',
    first: {
      fileName: path.basename(firstPath),
      fileSize: first.length,
      sha256: firstSha256
    },
    second: {
      fileName: path.basename(secondPath),
      fileSize: second.length,
      sha256: secondSha256
    },
    changed: firstSha256 !== secondSha256,
    changedBytes,
    changedChunkCount: changedChunks.length,
    firstChangedOffset,
    lastChangedOffset,
    changedChunks: maxChangedChunks === null ? changedChunks : changedChunks.slice(0, maxChangedChunks),
    changedChunksReturned: maxChangedChunks === null ? changedChunks.length : Math.min(changedChunks.length, maxChangedChunks),
    changedChunksTruncated: maxChangedChunks !== null && changedChunks.length > maxChangedChunks,
    note: 'Byte-level differences are observations only. No semantic meaning is inferred.'
  };
}

ipcMain.handle('save:analyzeContainer', (_, filePath) => {
  console.log('IPC save:analyzeContainer', filePath);
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Save file no longer exists.');
  return decodeSaveContainer(filePath);
});

ipcMain.handle('save:compareDecoded', (_, firstPath, secondPath) => {
  console.log('IPC save:compareDecoded', { firstPath, secondPath });
  return compareDecodedSaveFiles(firstPath, secondPath);
});

ipcMain.handle('save:analyzeStructure', (_, filePath) => {
  console.log('IPC save:analyzeStructure', filePath);
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Save file no longer exists.');
  return analyzeSaveStructure(filePath);
});

ipcMain.handle('save:compare', (_, firstPath, secondPath) => {
  console.log('IPC save:compare', { firstPath, secondPath });
  return compareSaveFiles(firstPath, secondPath);
});

ipcMain.handle('save:exportData', async () => {
  console.log('IPC save:exportData');

  const baselines = db.prepare(`
    SELECT id, label, file_name AS fileName, file_path AS filePath,
           file_size AS fileSize, last_modified AS lastModified,
           sha256, created_at AS createdAt,
           snapshot_path AS snapshotPath
    FROM save_baseline
    ORDER BY id DESC
  `).all();

  const snapshotBaselines = baselines.filter(b => b.snapshotPath);
  let latestAnalysis = null;
  let latestDiff = null;
  let latestContainerAnalysis = null;
  let latestRawDiff = null;

  if (snapshotBaselines.length >= 1) {
    try {
      latestAnalysis = analyzeSaveStructure(snapshotBaselines[0].snapshotPath);
      latestContainerAnalysis = decodeSaveContainer(snapshotBaselines[0].snapshotPath);
    } catch (err) {
      latestAnalysis = { exportError: `Latest snapshot analysis failed: ${err?.message || String(err)}` };
      latestContainerAnalysis = { exportError: `Latest container decode failed: ${err?.message || String(err)}` };
    }
  }

  if (snapshotBaselines.length >= 2) {
    try {
      latestDiff = compareSaveFiles(
        snapshotBaselines[1].snapshotPath,
        snapshotBaselines[0].snapshotPath,
        { maxChangedChunks: null }
      );
      latestRawDiff = compareDecodedSaveFiles(
        snapshotBaselines[1].snapshotPath,
        snapshotBaselines[0].snapshotPath,
        { maxChangedChunks: null }
      );
    } catch (err) {
      latestDiff = { exportError: `Latest baseline diff failed: ${err?.message || String(err)}` };
      latestRawDiff = { exportError: `Latest raw PARC diff failed: ${err?.message || String(err)}` };
    }
  }

  let logTail = null;
  if (logFile) {
    try {
      const logBuffer = await fs.promises.readFile(logFile);
      const tailBuffer = logBuffer.subarray(Math.max(0, logBuffer.length - 200000));
      logTail = tailBuffer.toString('utf8');
    } catch (err) {
      logTail = `Unable to read log: ${err?.message || String(err)}`;
    }
  }

  const payload = {
    exportFormat: 'crimson-age-field-test-v1',
    exportedAt: new Date().toISOString(),
    application: {
      name: 'Crimson Age Desktop',
      version: app.getVersion(),
      packaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch
    },
    database: {
      path: path.join(dataDir(), 'crimson-age.db'),
      recordCount: db.prepare('SELECT COUNT(*) n FROM ca_record').get().n,
      baselineCount: baselines.length
    },
    playerState: JSON.parse(db.prepare('SELECT json FROM player_state WHERE id=1').get().json),
    baselines,
    latestAnalysis,
    latestContainerAnalysis,
    latestDiff,
    latestRawDiff,
    logs: {
      path: logFile,
      included: Boolean(logTail),
      tailBytes: logTail ? Buffer.byteLength(logTail, 'utf8') : 0,
      tail: logTail
    },
    limitations: [
      'This export includes metadata and diagnostic observations only.',
      'Raw game save files are not embedded in the export.',
      'Binary diff regions are observations; no semantic meaning is inferred.',
      'The included log is limited to the most recent 200000 UTF-8 bytes.'
    ]
  };

  const defaultName = `Crimson-Age-FieldTest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const result = await dialog.showSaveDialog(win, {
    title: 'Export Crimson Age Field Test Data',
    defaultPath: defaultName,
    filters: [{ name: 'JSON diagnostics', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) {
    console.log('Field test export canceled');
    return { canceled: true };
  }

  const tempPath = result.filePath + '.tmp';
  const json = JSON.stringify(payload, null, 2);
  await fs.promises.writeFile(tempPath, json, 'utf8');
  await fs.promises.rename(tempPath, result.filePath);

  const exportedBytes = Buffer.byteLength(json, 'utf8');
  console.log('Field test export complete', {
    path: result.filePath,
    exportedBytes,
    baselineCount: baselines.length,
    changedBytes: latestDiff?.changedBytes ?? null,
    changedChunks: latestDiff?.changedChunkCount ?? null
  });

  return {
    canceled: false,
    path: result.filePath,
    bytes: exportedBytes,
    baselineCount: baselines.length,
    changedBytes: latestDiff?.changedBytes ?? null,
    changedChunks: latestDiff?.changedChunkCount ?? null
  };
});

ipcMain.handle('open:path', (_, targetPath) => {
  console.log('IPC open:path', targetPath);
  return shell.openPath(targetPath);
});

ipcMain.handle('updater:status', () => updaterState);

ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) {
    emitUpdaterState({
      status: 'DEV_NOT_PACKAGED',
      message: 'Build and run the Windows package to test GitHub updates.'
    });
    return updaterState;
  }

  try {
    emitUpdaterState({ status: 'CHECKING', message: 'Checking GitHub for updates…', error: null });
    await autoUpdater.checkForUpdates();
    return updaterState;
  } catch (err) {
    emitUpdaterState({
      status: 'ERROR',
      message: err?.message || 'Update check failed.',
      error: err?.stack || String(err)
    });
    return updaterState;
  }
});

ipcMain.handle('updater:download', async () => {
  if (!app.isPackaged) return updaterState;

  if (updaterState.status !== 'UPDATE_AVAILABLE') return updaterState;

  try {
    emitUpdaterState({ status: 'DOWNLOADING', message: 'Starting update download…', progress: 0 });
    await autoUpdater.downloadUpdate();
    return updaterState;
  } catch (err) {
    emitUpdaterState({
      status: 'ERROR',
      message: err?.message || 'Update download failed.',
      error: err?.stack || String(err)
    });
    return updaterState;
  }
});

ipcMain.handle('updater:install', () => {
  if (!app.isPackaged || !updaterState.downloaded) return false;
  console.log('Installing downloaded update and restarting');
  autoUpdater.quitAndInstall(false, true);
  return true;
});

app.whenReady().then(() => {
  initLogging();
  initDb();
  createWindow();
  configureUpdater();
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});
