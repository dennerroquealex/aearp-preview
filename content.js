const CONTENT_DB = 'aearp-documentos-demo';
function readPublishedContent(storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONTENT_DB, 6);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['documents', 'applications', 'members', 'profileChanges', 'news', 'events', 'leadership', 'audit']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'members' || name === 'applications' || name === 'profileChanges' ? 'email' : 'id' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve([]); return; }
      const tx = db.transaction(storeName, 'readonly');
      const get = tx.objectStore(storeName).getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  });
}
const contentText = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const contentDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`)) : '';
const contentImage = image => image instanceof Blob ? URL.createObjectURL(image) : typeof image === 'string' && /^https?:\/\//i.test(image) ? image : '';
(async () => {
  try {
    if (document.querySelector('#publicNews')) {
      const news = (await readPublishedContent('news')).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
      if (news.length) document.querySelector('#publicNews').innerHTML = `<div class="published-grid">${news.map(item => { const image=contentImage(item.image); return `<article class="published-card">${image ? `<img src="${contentText(image)}" alt="Imagem da notícia: ${contentText(item.title)}" loading="lazy">` : ''}<div class="published-card-copy"><span class="published-date">${contentDate(item.date)}</span><h3><a href="noticia.html?id=${encodeURIComponent(item.id)}" target="_blank" rel="noopener">${contentText(item.title)}</a></h3><p>${contentText(item.summary)}</p><a class="arrow-link" href="noticia.html?id=${encodeURIComponent(item.id)}" target="_blank" rel="noopener" aria-label="Ler ${contentText(item.title)} em nova aba">Leia mais ↗</a></div></article>`; }).join('')}</div>`;
    }
    if (document.querySelector('#newsDetail')) {
      const item = (await readPublishedContent('news')).find(n => n.id === new URLSearchParams(location.search).get('id'));
      const target = document.querySelector('#newsDetail');
      if (item) {
        document.title = `${item.title} | AEARP`;
        document.querySelector('meta[name="description"]').content = item.summary || '';
        const image = contentImage(item.image);
        target.innerHTML = `<article class="news-detail"><span class="published-date">${contentDate(item.date)}</span><h1>${contentText(item.title)}</h1><p class="news-detail-summary">${contentText(item.summary)}</p>${image ? `<img src="${contentText(image)}" alt="Imagem da notícia: ${contentText(item.title)}">` : ''}<div class="news-detail-body">${contentText(item.body)}</div></article>`;
      } else {
        document.title = 'Notícia não encontrada | AEARP';
        target.innerHTML = '<h1>Notícia não encontrada</h1><p>Esta publicação foi removida ou não está disponível neste navegador.</p>';
      }
    }
    if (document.querySelector('#publicEvents')) {
      const events = (await readPublishedContent('events')).sort((a,b) => (a.date || '').localeCompare(b.date || ''));
      if (events.length) document.querySelector('#publicEvents').innerHTML = `<div class="published-grid">${events.map(item => `<article class="published-card event-card"><div class="event-date"><strong>${contentText(item.date?.slice(8,10))}</strong><span>${contentText(item.date?.slice(0,7))}</span></div><div class="published-card-copy"><span class="published-date">${contentDate(item.date)}${item.time ? ` · ${contentText(item.time)}` : ''}</span><h3>${contentText(item.title)}</h3><p>${contentText(item.description)}</p><span class="event-location">${contentText(item.location)}</span>${item.link ? `<a class="arrow-link" href="${contentText(item.link)}" target="_blank" rel="noreferrer">Inscreva-se <span>↗</span></a>` : ''}</div></article>`).join('')}</div>`;
    }
    if (document.querySelector('#publicProfessionals')) {
      const profiles = (await readPublishedContent('members')).filter(member => member.status === 'approved' && member.publicListing)
        .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
      const directory = document.querySelector('#publicProfessionals');
      if (profiles.length) {
        const profileCards = profiles.map(member => { const photo = member.showPublicPhoto && member.photo instanceof Blob ? URL.createObjectURL(member.photo) : ''; return `<article class="professional-card" data-profession="${contentText(member.profession)}">${photo ? `<img class="professional-photo" src="${photo}" alt="Foto de ${contentText(member.name)}">` : ''}<span class="professional-role">${contentText(member.profession)}</span><h3>${contentText(member.name)}</h3><p>${contentText(member.services)}</p><div class="professional-work">${member.workType === 'autonomo' ? 'Profissional autônomo' : contentText(member.organization || 'Atuação profissional')}</div>${member.publicPhone || member.publicEmail ? `<div class="professional-contact">${member.publicPhone ? `<a href="tel:${contentText(member.publicPhone.replace(/[^+0-9]/g,''))}">Telefone: ${contentText(member.publicPhone)}</a>` : ''}${member.publicEmail ? `<a href="mailto:${contentText(member.publicEmail)}">${contentText(member.publicEmail)}</a>` : ''}</div>` : ''}</article>`; });
        directory.innerHTML = `<div class="professional-grid">${profileCards.join('')}</div>`;
        const filterProfiles = () => {
          const query = document.querySelector('#professionalSearch').value.trim().toLocaleLowerCase('pt-BR');
          const profession = document.querySelector('#professionalFilter').value;
          let visible = 0;
          directory.querySelectorAll('.professional-card').forEach(card => {
            const show = (profession === 'all' || card.dataset.profession === profession)
              && (!query || card.textContent.toLocaleLowerCase('pt-BR').includes(query));
            card.hidden = !show;
            if (show) visible++;
          });
          let empty = directory.querySelector('.directory-no-results');
          if (!empty) { empty = document.createElement('p'); empty.className = 'directory-no-results'; directory.append(empty); }
          empty.hidden = visible > 0;
          empty.textContent = 'Nenhum profissional encontrado com esses filtros.';
        };
        document.querySelector('#professionalSearch').addEventListener('input', filterProfiles);
        document.querySelector('#professionalFilter').addEventListener('change', filterProfiles);
      }
    }
  } catch (error) { console.error('Não foi possível carregar as publicações de demonstração.', error); }
})();

