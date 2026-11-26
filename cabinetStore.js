const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const slugPattern = /^[a-z0-9-]{1,60}$/;

function paths(root) {
  return {
    profile: path.join(root, '.cabinet', 'profile.json'),
    logo: path.join(root, '.cabinet', 'logo.png'),
    legacyLogo: path.join(root, 'assets', 'cabinet', 'logo.png')
  };
}

function migrateLegacyLogo(root) {
  const files = paths(root);
  if (fs.existsSync(files.logo) || !fs.existsSync(files.legacyLogo)) return;
  try {
    const buf = fs.readFileSync(files.legacyLogo);
    if (!buf.length) return;
    fs.mkdirSync(path.dirname(files.logo), { recursive: true, mode: 0o700 });
    const tmp = `${files.logo}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tmp, buf, { flag: 'wx', mode: 0o600 });
      fs.renameSync(tmp, files.logo);
    } finally { fs.rmSync(tmp, { force: true }); }
    fs.rmSync(files.legacyLogo, { force: true });
  } catch { /* la migration réessaiera à la prochaine lecture */ }
}

function readLogo(root) {
  migrateLegacyLogo(root);
  const files = paths(root);
  if (!fs.existsSync(files.logo)) return null;
  try { return fs.readFileSync(files.logo); }
  catch { return null; }
}

function read(root) {
  migrateLegacyLogo(root);
  const files = paths(root);
  let profile = {};
  try {
    const value = JSON.parse(fs.readFileSync(files.profile, 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) profile = value;
  } catch { /* profil par défaut */ }
  return {
    name: typeof profile.name === 'string' ? profile.name.slice(0, 120) : '',
    architect: typeof profile.architect === 'string' ? profile.architect.slice(0, 120) : '',
    logoUrl: fs.existsSync(files.logo) ? '/api/cabinet/logo' : ''
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseLogo(value) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value));
  if (!match) throw Object.assign(new Error('Le logo doit être un fichier PNG.'), { status: 422 });
  const image = Buffer.from(match[1], 'base64');
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (image.length < 45 || !image.subarray(0, 8).equals(signature)) throw Object.assign(new Error('Le fichier ne contient pas un PNG valide.'), { status: 422 });
  let offset = 8, first = true, hasHeader = false, hasImageData = false, hasEnd = false, transparent = false;
  let width = 0, height = 0;
  while (offset + 12 <= image.length) {
    const length = image.readUInt32BE(offset), end = offset + 12 + length;
    if (length > 10 * 1024 * 1024 || end > image.length) break;
    const type = image.toString('ascii', offset + 4, offset + 8);
    const chunkData = image.subarray(offset + 8, offset + 8 + length);
    const chunkCrc = image.readUInt32BE(offset + 8 + length);
    if (crc32(image.subarray(offset + 4, offset + 8 + length)) !== chunkCrc) break;
    if (first) {
      if (type !== 'IHDR' || length !== 13) break;
      hasHeader = true; first = false;
      width = chunkData.readUInt32BE(0); height = chunkData.readUInt32BE(4);
      const bitDepth = chunkData[8], colorType = chunkData[9];
      if (![1, 2, 4, 8, 16].includes(bitDepth) || ![0, 2, 3, 4, 6].includes(colorType)) break;
      transparent = colorType === 4 || colorType === 6;
    } else if (type === 'IDAT') hasImageData = true;
    else if (type === 'tRNS' && length) transparent = true;
    else if (type === 'IEND' && length === 0) { hasEnd = true; offset = end; break; }
    offset = end;
  }
  if (!hasHeader || !hasImageData || !hasEnd || offset !== image.length || !width || !height || width > 4000 || height > 4000) {
    throw Object.assign(new Error('Le fichier ne contient pas un PNG valide.'), { status: 422 });
  }
  if (!transparent) throw Object.assign(new Error('Le PNG doit comporter une transparence.'), { status: 422 });
  return image;
}

function save(root, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Profil invalide.'), { status: 422 });
  const name = String(input.name || '').trim().slice(0, 120);
  const architect = String(input.architect || '').trim().slice(0, 120);
  if (!name) throw Object.assign(new Error('Indiquez le nom du cabinet.'), { status: 422 });
  const logoImage = input.logo && input.logo !== '' ? parseLogo(input.logo) : null;
  const files = paths(root);
  fs.mkdirSync(path.dirname(files.profile), { recursive: true });
  const tmp = `${files.profile}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ name, architect }, null, 2), { flag: 'wx' });
    fs.renameSync(tmp, files.profile);
  } finally { fs.rmSync(tmp, { force: true }); }

  if (input.logo !== undefined) {
    if (!logoImage) {
      fs.rmSync(files.logo, { force: true });
      fs.rmSync(files.legacyLogo, { force: true });
    } else {
      fs.mkdirSync(path.dirname(files.logo), { recursive: true, mode: 0o700 });
      const logoTmp = `${files.logo}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(logoTmp, logoImage, { flag: 'wx', mode: 0o600 }); fs.renameSync(logoTmp, files.logo); }
      finally { fs.rmSync(logoTmp, { force: true }); }
      fs.rmSync(files.legacyLogo, { force: true });
    }
  }
  return read(root);
}

function projectSheetsValid(sheets) {
  if (sheets === undefined) return true;
  if (!Array.isArray(sheets) || sheets.length > 100) return false;
  return sheets.every(sheet => sheet === null || (sheet && typeof sheet === 'object' && !Array.isArray(sheet) &&
    ['title', 'number', 'level', 'revision', 'date', 'status', 'scale'].every(key => sheet[key] === undefined ||
      (typeof sheet[key] === 'string' && sheet[key].length <= (key === 'title' ? 160 : 80)))));
}

module.exports = { read, save, readLogo, migrateLegacyLogo, slugPattern, projectSheetsValid };
