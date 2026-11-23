const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'js', 'app.js');
let code = fs.readFileSync(file, 'utf8');

// 1. Mise à jour de createViewCard
const oldCardInit = `    card.className = 'rg-card rg-view-card';
    card.dataset.id = shot.id;
    card.dataset.category = '3d';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'rg-thumb-wrap';
    const badge = document.createElement('span');
    badge.className = \`rg-badge \${aiImage ? 'rg-badge-ultra' : 'rg-badge-3d'}\`;
    badge.textContent = aiImage ? 'Rendu IA disponible' : 'Vue 3D de base';
    thumbWrap.appendChild(badge);

    const img = document.createElement('img');
    img.alt = \`\${shot.label} — vue 3D de référence\`;
    img.loading = 'lazy';
    img.src = shot.url;
    thumbWrap.appendChild(img);
    card.appendChild(thumbWrap);

    const meta = document.createElement('div');
    meta.className = 'rg-card-meta';
    meta.innerHTML = \`<div><div class="rg-card-title">\${escapeHtml(shot.label)}</div><div class="rg-card-sub">Vue capturée depuis la maquette Three.js</div></div>\`;`;

const newCardInit = `    const isPlan = shot.category === 'plan' || /plan|coupe|facade|elevation|masse/i.test(\`\${shot.id || ''} \${shot.label || ''}\`);
    card.className = \`rg-card rg-view-card\${isPlan ? ' is-plan' : ''}\`;
    card.dataset.id = shot.id;
    card.dataset.category = isPlan ? 'plan' : '3d';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'rg-thumb-wrap';
    const badge = document.createElement('span');
    const isAi = Boolean(aiImage || shot.generator?.includes('OpenRouter'));
    badge.className = \`rg-badge \${isAi ? 'rg-badge-ultra' : 'rg-badge-3d'}\`;
    badge.textContent = aiImage ? 'Rendu IA disponible' : shot.generator?.includes('OpenRouter') ? (isPlan ? 'Rendu 2D sublimé' : 'Rendu IA') : 'Vue 3D de base';
    thumbWrap.appendChild(badge);

    const img = document.createElement('img');
    img.alt = \`\${shot.label} — vue 3D de référence\`;
    img.loading = 'lazy';
    img.src = shot.url;
    thumbWrap.appendChild(img);
    card.appendChild(thumbWrap);

    const meta = document.createElement('div');
    meta.className = 'rg-card-meta';
    const subText = shot.generator
      ? \`Rendu d’ambiance IA · \${isPlan ? 'Planche 2D' : 'Persp. 3D'}\`
      : (isPlan ? 'Planche architecturale' : 'Vue capturée depuis la maquette Three.js');
    meta.innerHTML = \`<div><div class="rg-card-title">\${escapeHtml(shot.label)}</div><div class="rg-card-sub">\${escapeHtml(subText)}</div></div>\`;`;

// Normalize CRLF to LF for matching
const normalize = s => s.replace(/\r\n/g, '\n');

if (normalize(code).includes(normalize(oldCardInit))) {
  code = normalize(code).replace(normalize(oldCardInit), normalize(newCardInit));
  console.log('✓ createViewCard initialisation mise à jour');
} else {
  console.warn('! oldCardInit non trouvé');
}

// 2. Action bouton comparer dans createViewCard
const oldAction = `    if (aiImage) {
      Icons.label(action, 'compare', 'Comparer Avant (3D) / Après (IA)');
      action.addEventListener('click', event => {
        event.stopPropagation();
        openLightbox(shot, aiImage, true);
      });
    } else if (!invited && shot.ext !== 'png') {`;

const newAction = `    if (aiImage) {
      Icons.label(action, 'compare', 'Comparer Avant (3D) / Après (IA)');
      action.addEventListener('click', event => {
        event.stopPropagation();
        openLightbox(shot, aiImage, true);
      });
    } else if (shot.reference) {
      Icons.label(action, 'compare', 'Comparer Source / Rendu IA');
      action.addEventListener('click', event => {
        event.stopPropagation();
        openLightbox({ id: \`\${shot.id}-ref\`, label: \`\${shot.label} (Source technique)\`, url: shot.reference }, shot, true);
      });
    } else if (!invited && shot.ext !== 'png') {`;

if (normalize(code).includes(normalize(oldAction))) {
  code = normalize(code).replace(normalize(oldAction), normalize(newAction));
  console.log('✓ createViewCard bouton comparer mis à jour');
} else {
  console.warn('! oldAction non trouvé');
}

// 3. Flags et onclick dans createViewCard
const oldCardEnd = `      appendFlags(baseImage || { id: \`render-\${shot.id}\`, catalog: false, book: false }, 'vue 3D');
      if (aiImage?.id) appendFlags(aiImage, 'retouche IA');
    }
    if (action.textContent !== 'Ouvrir la vue') {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn-toggle btn-small rg-card-action';
      view.textContent = 'Ouvrir la vue';
      view.setAttribute('aria-label', \`Ouvrir la vue : \${shot.label}\`);
      card.appendChild(view);
    }
    card.onclick = () => openLightbox(shot, aiImage, false);`;

const newCardEnd = `      if (baseImage || !shot.reference) {
        appendFlags(baseImage || { id: \`render-\${shot.id}\`, catalog: false, book: false }, 'vue 3D');
      }
      if (aiImage?.id) appendFlags(aiImage, 'retouche IA');
      else if (shot.reference && shot.id) appendFlags(shot, 'rendu IA');
    }
    if (action.textContent !== 'Ouvrir la vue') {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn-toggle btn-small rg-card-action';
      view.textContent = 'Ouvrir la vue';
      view.setAttribute('aria-label', \`Ouvrir la vue : \${shot.label}\`);
      card.appendChild(view);
    }
    card.onclick = () => {
      if (shot.reference) {
        openLightbox({ id: \`\${shot.id}-ref\`, label: \`\${shot.label} (Source technique)\`, url: shot.reference }, shot, false);
      } else {
        openLightbox(shot, aiImage, false);
      }
    };`;

if (normalize(code).includes(normalize(oldCardEnd))) {
  code = normalize(code).replace(normalize(oldCardEnd), normalize(newCardEnd));
  console.log('✓ createViewCard flags et onclick mis à jour');
} else {
  console.warn('! oldCardEnd non trouvé');
}

// 4. openLightbox plan detection et meta
const oldLbMeta = `      captionEl.textContent = item.label;
      metaEl.textContent = aiImage ? 'Vue Three.js avant · rendu IA après' : 'Capture locale de la maquette Three.js';`;

const newLbMeta = `      const isPlanLike = item.category === 'plan' || /plan|coupe|facade|elevation|masse/i.test(\`\${item.id || ''} \${item.label || ''} \${aiImage?.label || ''}\`);
      lightbox.classList.toggle('is-plan-view', Boolean(isPlanLike));
      fullImg.classList.toggle('is-plan-media', Boolean(isPlanLike));
      compareView.querySelectorAll('.rg-compare-panel').forEach(p => p.classList.toggle('is-plan-view', Boolean(isPlanLike)));

      captionEl.textContent = item.label;
      if (item.reference || (aiImage && aiImage.reference)) {
        metaEl.textContent = 'Planche technique avant · rendu d’ambiance IA après';
      } else if (aiImage) {
        metaEl.textContent = 'Vue Three.js avant · rendu IA après';
      } else {
        metaEl.textContent = item.generator || (isPlanLike ? 'Planche architecturale' : 'Capture locale de la maquette Three.js');
      }`;

if (normalize(code).includes(normalize(oldLbMeta))) {
  code = normalize(code).replace(normalize(oldLbMeta), normalize(newLbMeta));
  console.log('✓ openLightbox détection plan & méta mis à jour');
} else {
  console.warn('! oldLbMeta non trouvé');
}

// 5. closeLightbox nettoyage
const oldCloseLb = `  function closeLightbox() {
    const videoEl = document.getElementById('rg-video');
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
    videoEl.load();
    }
    if (lightbox.open) lightbox.close();
    lightbox.classList.add('hidden');
  }`;

const newCloseLb = `  function closeLightbox() {
    const videoEl = document.getElementById('rg-video');
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    }
    const fullImg = document.getElementById('rg-full');
    if (fullImg) fullImg.classList.remove('is-plan-media');
    if (lightbox) {
      lightbox.classList.remove('is-plan-view');
      if (lightbox.open) lightbox.close();
      lightbox.classList.add('hidden');
    }
  }`;

if (normalize(code).includes(normalize(oldCloseLb))) {
  code = normalize(code).replace(normalize(oldCloseLb), normalize(newCloseLb));
  console.log('✓ closeLightbox nettoyage mis à jour');
} else {
  console.warn('! oldCloseLb non trouvé');
}

// 6. Section planches dans buildGallery pour tous les utilisateurs
const oldGalleryExtra = `    if (invited) {
      const extra = media.images.filter(image => !shots3D.some(shot => aiImageForShot(shot, [image])));
      if (extra.length) addSection('Rendus disponibles', 'Images enregistrées dans ce projet');
      extra.forEach(image => grid.appendChild(createViewCard({ ...image, url: image.file, ext: image.file.split('.').pop() }, null)));
    }`;

const newGalleryExtra = `    const extra = media.images.filter(image => !shots3D.some(shot => aiImageForShot(shot, [image])));
    if (extra.length) {
      addSection('Planches & élévations architecturales (IA)', 'Rendus d’ambiance 2D, élévations et coupes sublimés par IA');
      extra.forEach(image => grid.appendChild(createViewCard({ ...image, url: image.file, ext: image.file.split('.').pop() }, null)));
    }`;

if (normalize(code).includes(normalize(oldGalleryExtra))) {
  code = normalize(code).replace(normalize(oldGalleryExtra), normalize(newGalleryExtra));
  console.log('✓ buildGallery section planches IA pour tous mise à jour');
} else {
  console.warn('! oldGalleryExtra non trouvé');
}

fs.writeFileSync(file, code, 'utf8');
console.log('✓ js/app.js mis à jour avec succès.');
