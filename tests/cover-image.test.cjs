const assert = require('node:assert/strict');
const { test } = require('node:test');
const { replace } = require('../js/coverImage');

function currentImage() {
  return { id: 'cover-image', replaceWith(node) { this.parent.image = node; }, parent: null };
}
function container() {
  const old = currentImage();
  const parent = { image: old };
  old.parent = parent;
  return parent;
}
function imageClass(decode = async () => {}) {
  return class FakeImage {
    constructor() { this.style = {}; this._src = ''; }
    set src(value) { this._src = value; }
    get src() { return this._src; }
    decode() { return decode(this); }
  };
}

const request = (current, ImageConstructor, options = {}) => replace(current, {
  ImageConstructor, source: 'published.jpg', original: 'published.jpg', alt: 'Vue publiée',
  isCurrent: () => true, ...options
});

test('Le point focal est appliqué à l’image finale insérée dans la couverture', async () => {
  const page = container();
  const finalImage = await request(page.image, imageClass(), { focal: { x: 15, y: 80 } });
  assert.equal(page.image, finalImage);
  assert.equal(finalImage.id, 'cover-image');
  assert.equal(finalImage.style.objectPosition, '15% 80%');
});

test('Sans point focal, l’image finale conserve le cadrage CSS de repli', async () => {
  const page = container();
  const finalImage = await request(page.image, imageClass(), { focal: undefined });
  assert.equal(page.image, finalImage);
  assert.equal(Object.hasOwn(finalImage.style, 'objectPosition'), false);
});

test('Un chargement périmé ne remplace pas la vue choisie après un changement rapide', async () => {
  let finishOldDecode;
  const ControlledImage = imageClass(image => image.src === 'ancienne.jpg'
    ? new Promise(resolve => { finishOldDecode = resolve; }) : Promise.resolve());
  const page = container();
  let version = 1;
  const oldView = replace(page.image, {
    ImageConstructor: ControlledImage, source: 'ancienne.jpg', original: 'ancienne.jpg', alt: 'Ancienne vue',
    focal: { x: 15, y: 80 }, isCurrent: () => version === 1
  });
  version = 2;
  const currentView = await replace(page.image, {
    ImageConstructor: ControlledImage, source: 'courante.jpg', original: 'courante.jpg', alt: 'Vue courante',
    focal: undefined, isCurrent: () => version === 2
  });
  finishOldDecode();
  assert.equal(await oldView, null);
  assert.equal(page.image, currentView);
  assert.equal(currentView.alt, 'Vue courante');
  assert.equal(Object.hasOwn(currentView.style, 'objectPosition'), false);
});

test('Un aperçu illisible retombe sur l’image originale avant l’insertion', async () => {
  const page = container();
  const ImageWithPreviewFallback = imageClass(async image => {
    if (image.src === 'apercu.webp') throw new Error('aperçu indisponible');
  });
  const finalImage = await request(page.image, ImageWithPreviewFallback, {
    source: 'apercu.webp', original: 'originale.jpg', focal: { x: 15, y: 80 }
  });
  assert.equal(page.image, finalImage);
  assert.equal(finalImage.src, 'originale.jpg');
  assert.equal(finalImage.style.objectPosition, '15% 80%');
});
