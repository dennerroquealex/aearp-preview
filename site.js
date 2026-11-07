const nav = [
  { label: 'Início', href: 'index.html', id: 'home' },
  { label: 'Sobre nós', href: 'quem-somos.html', id: 'sobre', children: [
    { label: 'Quem somos', href: 'quem-somos.html', id: 'quem-somos' },
    { label: 'História e atuação', href: 'historia.html', id: 'historia' },
    { label: 'Diretoria e conselhos', href: 'diretoria.html', id: 'diretoria' }
  ] },
  { label: 'Agenda', href: 'agenda.html', id: 'agenda' },
  { label: 'Profissionais', href: 'profissionais.html', id: 'profissionais' },
  { label: 'Notícias', href: 'noticias.html', id: 'noticias' },
  { label: 'Contato', href: 'contato.html', id: 'contato' },
  { label: 'Benefícios', href: 'beneficios.html', id: 'beneficios' }
];
const page = document.body.dataset.page;
const navMarkup = nav.map((item) => {
  const active = item.id === page || item.children?.some((child) => child.id === page);
  if (!item.children) return `<a class="nav-link ${active ? 'active' : ''}" href="${item.href}" ${active ? 'aria-current="page"' : ''}>${item.label}</a>`;
  return `<div class="nav-group ${active ? 'active' : ''}"><a class="nav-link nav-parent ${active ? 'active' : ''}" href="${item.href}" aria-haspopup="true">${item.label}<span class="nav-caret">⌄</span></a><div class="nav-dropdown">${item.children.map((child) => `<a href="${child.href}" ${child.id === page ? 'aria-current="page"' : ''}>${child.label}</a>`).join('')}</div></div>`;
}).join('');
document.querySelector('#site-header').innerHTML = `<div class="utility-bar"><div class="container utility-inner"><span>Associação dos Engenheiros e Arquitetos de Ribeirão Pires</span><div><a href="https://www.confea.org.br/" target="_blank" rel="noreferrer">CONFEA</a><a href="https://www.creasp.org.br/" target="_blank" rel="noreferrer">CREA-SP</a><a href="https://www.mutua.com.br/" target="_blank" rel="noreferrer">Mútua</a></div></div></div><header class="site-header"><div class="container header-inner"><a class="brand" href="index.html" aria-label="AEARP, início"><img src="assets/logo-aearp.png" alt="AEARP - Associação dos Engenheiros e Arquitetos de Ribeirão Pires"></a><button class="menu-toggle" id="menuToggle" aria-label="Abrir menu" aria-expanded="false"><span></span><span></span><span></span></button><nav class="main-nav" id="mainNav" aria-label="Navegação principal">${navMarkup}<a class="member-nav ${page === 'associado' ? 'active' : ''}" href="associado.html">Área do associado <span>↗</span></a></nav></div></header>`;
document.querySelector('#site-footer').innerHTML = `<footer class="site-footer"><div class="container footer-main"><div class="footer-brand"><img src="assets/logo-aearp.png" alt="AEARP"><p>Associação dos Engenheiros e Arquitetos de Ribeirão Pires.</p></div><div class="footer-column"><b>ASSOCIAÇÃO</b><a href="quem-somos.html">Quem somos</a><a href="historia.html">História e atuação</a><a href="diretoria.html">Diretoria e conselhos</a><a href="beneficios.html">Benefícios</a><a href="privacidade.html">Privacidade</a></div><div class="footer-column"><b>ACOMPANHE</b><a href="agenda.html">Agenda</a><a href="noticias.html">Notícias</a><a href="profissionais.html">Profissionais</a><a href="contato.html">Contato</a></div><div class="footer-column"><b>FALE CONOSCO</b><a href="mailto:contato@aearp.com.br">contato@aearp.com.br</a><a href="contato.html">Enviar uma mensagem ↗</a><a href="associado.html">Área do associado ↗</a></div></div><div class="footer-partners"><div class="container footer-partners-inner"><span class="footer-partners-title">SISTEMA CONFEA/CREA E MÚTUA</span><div class="footer-partner-logos"><a href="https://www.confea.org.br/" target="_blank" rel="noopener noreferrer" aria-label="Acessar o site do CONFEA"><img src="assets/logo-confea-crea.png?v=20261026b" alt="CONFEA e CREA-SP"></a><a href="https://www.mutua.com.br/" target="_blank" rel="noopener noreferrer" aria-label="Acessar o site da Mútua"><img src="assets/logo-mutua.png?v=20261026d" alt="Mútua"></a></div></div></div><div class="container footer-bottom"><span>© AEARP 2026 · Ribeirão Pires, SP</span><span>Engenharia e arquitetura a serviço da cidade.</span></div></footer>`;
document.querySelector('#site-footer')?.insertAdjacentHTML('afterend', '<a class="whatsapp-float" href="https://wa.me/5511988384634?text=Ol%C3%A1%20AEARP%2C%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es." target="_blank" rel="noopener noreferrer" aria-label="Falar com a AEARP pelo WhatsApp"><span aria-hidden="true">◔</span><b>WhatsApp</b></a>');
document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="footer-contact.css?v=20261026b">');

const menuToggle = document.querySelector('#menuToggle');
menuToggle?.addEventListener('click', () => {
  const open = document.querySelector('#mainNav').classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});

const topic = new URLSearchParams(location.search).get('tema');
if (topic && document.querySelector('#contactTopic')) {
  const option = [...document.querySelector('#contactTopic').options].find((item) => item.text.toLocaleLowerCase('pt-BR') === topic.toLocaleLowerCase('pt-BR'));
  if (option) option.selected = true;
}

document.querySelector('#contactForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const contactForm = event.currentTarget;
  const submitButton = contactForm.querySelector('[type="submit"]');
  const feedback = document.querySelector('#contactFeedback');
  const fields = Object.fromEntries(new FormData(contactForm));
  const honeypot = contactForm.elements.website?.value || '';
  feedback.textContent = '';
  submitButton.disabled = true;
  submitButton.textContent = 'Enviando…';
  try {
    const response = await fetch(window.AEARP_CONTACT_ENDPOINT || '/wp-json/aearp/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...fields, website: honeypot, consent: contactForm.elements.consent.checked })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Não foi possível enviar sua mensagem agora. Tente novamente mais tarde.');
    contactForm.reset();
    feedback.textContent = result.message || 'Mensagem enviada com sucesso. A equipe da AEARP recebeu seu contato.';
    feedback.dataset.state = 'success';
  } catch (error) {
    feedback.textContent = error.message || 'Falha de conexão. Tente novamente ou escreva para contato@aearp.com.br.';
    feedback.dataset.state = 'error';
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Enviar mensagem <span>↗</span>';
  }
});

document.querySelectorAll('.instagram-panel').forEach(panel=>{const frame=panel.querySelector('iframe'),fallback=panel.querySelector('.instagram-fallback');if(!frame||!fallback)return;let loaded=false;frame.addEventListener('load',()=>{loaded=true;});setTimeout(()=>{if(!loaded){fallback.style.display='block';frame.hidden=true;}},9000);});
