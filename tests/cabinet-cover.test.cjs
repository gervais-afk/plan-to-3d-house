const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { test } = require('node:test');
const cabinet = require('../cabinetStore');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function png(colorType = 6) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = colorType;
  const pixel = colorType === 6 ? Buffer.from([0, 22, 38, 30, 0]) : Buffer.from([0, 22, 38, 30]);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixel)), chunk('IEND', Buffer.alloc(0))]);
}

test('Profil Cabinet stocke le nom, l’architecte et un logo PNG transparent sans déformation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cabinet-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const empty = cabinet.read(root);
  assert.deepEqual(empty, { name: '', architect: '', logoUrl: '' });
  const data = `data:image/png;base64,${png().toString('base64')}`;
  const saved = cabinet.save(root, { name: 'Atelier Équinoxe', architect: 'A. Exemple', logo: data });
  assert.equal(saved.name, 'Atelier Équinoxe');
  assert.equal(saved.architect, 'A. Exemple');
  assert.equal(saved.logoUrl, '/assets/cabinet/logo.png');
  assert.deepEqual(fs.readFileSync(path.join(root, 'assets', 'cabinet', 'logo.png')), png());
  assert.throws(() => cabinet.save(root, { name: 'Modification rejetée', architect: '', logo: `data:image/png;base64,${png(2).toString('base64')}` }), /transparence/);
  assert.equal(cabinet.read(root).name, 'Atelier Équinoxe', 'un logo invalide ne modifie pas le profil existant');
  assert.equal(cabinet.save(root, { name: 'Atelier Équinoxe', architect: 'A. Exemple', logo: '' }).logoUrl, '');
});

test('Les métadonnées de feuilles restent manuelles et bornées', () => {
  assert.equal(cabinet.projectSheetsValid([{ title: 'Plan RDC', number: 'A-101', level: 'Rez-de-chaussée', revision: 'B', date: '2026-11-20', status: 'Pour validation', scale: '1:100' }]), true);
  assert.equal(cabinet.projectSheetsValid([null, { title: 'Plan' }]), true);
  assert.equal(cabinet.projectSheetsValid([{ scale: 'inférée depuis plan-final-100.jpg' + 'x'.repeat(100) }]), false);
  assert.equal(cabinet.projectSheetsValid({ title: 'Plan' }), false);
});
