const DB_NAME = 'aearp-documentos-demo';
const DB_VERSION = 6;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_NEWS_IMAGE_SIZE = 12 * 1024 * 1024;
const allowedExtensions = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const demoUsers = {
  'secretaria@aearp.com.br': { password: 'aearp2026', name: 'Secretaria AEARP', role: 'secretary' },
  'associado@aearp.com.br': { password: 'aearp2026', name: 'Associado AEARP', role: 'member' }
};
const $ = (selector) => document.querySelector(selector);
let currentUser = null;
let toastTimer;
const submittingForms = new WeakSet();
const submitTimers = new WeakMap();

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('applications')) db.createObjectStore('applications', { keyPath: 'email' });
      if (!db.objectStoreNames.contains('members')) db.createObjectStore('members', { keyPath: 'email' });
      if (!db.objectStoreNames.contains('profileChanges')) db.createObjectStore('profileChanges', { keyPath: 'email' });
      if (!db.objectStoreNames.contains('news')) db.createObjectStore('news', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('leadership')) db.createObjectStore('leadership', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audit')) db.createObjectStore('audit', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function databaseAction(mode, action, storeName = 'documents') {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result;
    let requestError;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      db.close();
      callback(value);
    };
    let transaction;
    try {
      transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => { requestError = request.error; };
      transaction.oncomplete = () => finish(resolve, result);
      transaction.onerror = () => finish(reject, requestError || transaction.error);
      transaction.onabort = () => finish(reject, requestError || transaction.error || new Error('A transação foi cancelada.'));
    } catch (error) {
      finish(reject, error);
    }
  });
}

const getDocuments = () => databaseAction('readonly', (store) => store.getAll());
const saveDocument = (doc) => databaseAction('readwrite', (store) => store.put(doc));
const deleteDocument = (id) => databaseAction('readwrite', (store) => store.delete(id));
const getApplications = () => databaseAction('readonly', (store) => store.getAll(), 'applications');
const getApplication = (email) => databaseAction('readonly', (store) => store.get(email), 'applications');
const saveApplication = (application) => databaseAction('readwrite', (store) => store.put(application), 'applications');
const deleteApplication = (email) => databaseAction('readwrite', (store) => store.delete(email), 'applications');
const getMember = (email) => databaseAction('readonly', (store) => store.get(email), 'members');
const saveMember = (member) => databaseAction('readwrite', (store) => store.put(member), 'members');
const getMembers = () => databaseAction('readonly', (store) => store.getAll(), 'members');
const deleteMember = (email) => databaseAction('readwrite', (store) => store.delete(email), 'members');
const getProfileChanges = () => databaseAction('readonly', (store) => store.getAll(), 'profileChanges');
const getProfileChange = (email) => databaseAction('readonly', (store) => store.get(email), 'profileChanges');
const saveProfileChange = (item) => databaseAction('readwrite', (store) => store.put(item), 'profileChanges');
const deleteProfileChange = (email) => databaseAction('readwrite', (store) => store.delete(email), 'profileChanges');
const getContent = (type) => databaseAction('readonly', (store) => store.getAll(), type);
const saveContent = (type, item) => databaseAction('readwrite', (store) => store.put(item), type);
const deleteContent = (type, id) => databaseAction('readwrite', (store) => store.delete(id), type);
const getLeadership = () => databaseAction('readonly', store => store.getAll(), 'leadership');
const saveLeadership = item => databaseAction('readwrite', store => store.put(item), 'leadership');
const deleteLeadership = id => databaseAction('readwrite', store => store.delete(id), 'leadership');
const getAudit = () => databaseAction('readonly', store => store.getAll(), 'audit');
const saveAudit = item => databaseAction('readwrite', store => store.put(item), 'audit');
async function audit(action, detail='') { if (!currentUser) return; try { await saveAudit({ id:crypto.randomUUID(), actor:currentUser.email, role:currentUser.role, action, detail:String(detail).slice(0,180), at:new Date().toISOString() }); await renderAudit(); } catch(error) { console.error('Não foi possível registrar a atividade.',error); } }
const safeText = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const formatSize = (size) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1048576).toFixed(1)} MB`;
const formatDate = (date) => {
  const value = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00') : new Date(date);
  return new Intl.DateTimeFormat('pt-BR').format(value);
};
const MAX_IMAGE_SIDE = 900;
async function optimizeImage(file) {
  if (!file || !file.type?.startsWith('image/')) return file || '';
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.82));
  } catch { return file; }
}


function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 5000);
}

function releaseSubmit(form) {
  submittingForms.delete(form);
  clearTimeout(submitTimers.get(form));
  submitTimers.delete(form);
  form.removeAttribute('aria-busy');
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = false;
}
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches('#registerForm, #profileChangeForm, #memberEditForm, #secretaryCreateForm, #newsForm, #eventForm, #uploadForm')) return;
  if (submittingForms.has(form)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  submittingForms.add(form);
  form.setAttribute('aria-busy', 'true');
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  // Safety release for validation failures and unexpected browser errors.
  submitTimers.set(form, setTimeout(() => releaseSubmit(form), 15000));
}, true);
document.addEventListener('reset', (event) => setTimeout(() => releaseSubmit(event.target), 0), true);

function showDocuments(user) {
  currentUser = user;
  sessionStorage.setItem('aearp-demo-user', JSON.stringify({ email: user.email, role: user.role, name: user.name }));
  $('#memberLogin').hidden = true;
  $('#memberDocuments').hidden = false;
  $('#memberName').textContent = user.name;
  $('#uploadTrigger').hidden = user.role !== 'secretary';
  $('#secretaryDashboard').hidden = user.role !== 'secretary';
  $('#adminSubpageBar').hidden = true;
  for (const id of ['approvalPanel','memberManagement','contentManagement','leadershipManagement','auditManagement']) $(`#${id}`).hidden = true;
  $('#documentsManagement').hidden = user.role === 'secretary';
  $('#profileToggle').hidden = user.role !== 'member';
  $('#memberHomeStatus').hidden = true;
  $('#memberProfile').hidden = true;
  $('#profileToggle').textContent = 'Alterar meu cadastro';
  if (user.role === 'member') renderMemberProfile(user);
  if (user.role === 'secretary') {
    renderApplications();
    renderMembers();
    renderProfileChanges();
  }
  if (user.role === 'secretary') { renderManagedContent(); renderLeadershipManagement(); renderAudit(); }
  renderDocuments();
}

const leadershipDefaults = [
['Diretoria','Presidente','José Inácio Avelino Júnior'],['Diretoria','Vice-presidente','José Luiz Francia'],['Diretoria','Diretora financeira','Isabella Lara'],['Diretoria','Diretor financeiro adjunto','Djalmir Inácio Avelino'],['Diretoria','Diretora administrativa','Andreza de Araújo Batista'],['Diretoria','Diretora administrativa adjunta','Larissa Lobato Baumeister'],['Conselho fiscal','Presidente','Sérgio Poloni dos Reis'],['Conselho fiscal','1º conselheiro','Carlos José Almeida'],['Conselho fiscal','2º conselheiro','Valério Valente'],['Conselho fiscal','Suplente','José Cândido de Souza Lima']
];
async function ensureLeadershipDefaults() { const existing = await getLeadership(); if (existing.length) return existing; const seeded = leadershipDefaults.map(([group,role,name],i)=>({id:`leadership-${i+1}`,group,role,name,formation:'Formação a confirmar',summary:'Resumo da função a confirmar.',photo:''})); for (const item of seeded) await saveLeadership(item); return seeded; }
async function renderLeadershipManagement() {
  const list = $('#leadershipList'); if (!list || currentUser?.role !== 'secretary') return;
  const items = (await ensureLeadershipDefaults()).sort((a,b) => a.group.localeCompare(b.group) || a.role.localeCompare(b.role));
  list.innerHTML = items.map(item => `<article class="managed-item"><div><strong>${safeText(item.name)}</strong><span>${safeText(item.group)} · ${safeText(item.role)}</span></div><div class="managed-actions"><button type="button" class="managed-edit" data-leadership-edit="${safeText(item.id)}">Editar</button><button type="button" class="request-reject" data-leadership-delete="${safeText(item.id)}">Excluir</button></div></article>`).join('');
  $('#leadershipEmpty').hidden = items.length > 0;
}
$('#leadershipForm')?.addEventListener('submit', async event => {
  event.preventDefault(); const form=event.currentTarget; if(currentUser?.role!=='secretary'){releaseSubmit(form);return;}
  const data=Object.fromEntries(new FormData(form)); const isEdit=Boolean(data.id);
  const previous=data.id?(await getLeadership()).find(x=>x.id===data.id):null;
  await saveLeadership({id:data.id||crypto.randomUUID(),group:data.group,role:data.role.trim(),name:data.name.trim(),formation:data.formation.trim(),summary:data.summary.trim(),photo:data.removePhoto==='on'?'':data.photo?.size?await optimizeImage(data.photo):previous?.photo||''});
  await audit(isEdit?'Atualizou cargo da associação':'Cadastrou cargo da associação',data.role.trim());
  form.reset(); form.elements.id.value=''; await renderLeadershipManagement(); releaseSubmit(form); toast(isEdit?'Cargo atualizado com sucesso.':'Profissional cadastrado com sucesso.');
});
$('#leadershipManagement')?.addEventListener('click', async event => {
  const edit=event.target.closest('[data-leadership-edit]'); const remove=event.target.closest('[data-leadership-delete]');
  if(currentUser?.role!=='secretary')return;
  if(edit){const item=(await getLeadership()).find(x=>x.id===edit.dataset.leadershipEdit);if(!item)return;const f=$('#leadershipForm');for(const key of ['id','group','role','name','formation','summary','photo'])f.elements[key].value=item[key]||'';f.scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(remove&&window.confirm('Excluir este cargo da página pública?')){const item=(await getLeadership()).find(x=>x.id===remove.dataset.leadershipDelete);await deleteLeadership(remove.dataset.leadershipDelete);await renderLeadershipManagement();await audit('Removeu cargo da associação',item?.role||'');toast('Cargo removido com sucesso.');}
});

async function renderAudit(){const target=$('#auditList');if(!target||currentUser?.role!=='secretary')return;const rows=(await getAudit()).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,40);target.innerHTML=rows.map(x=>`<article class="audit-row"><strong>${safeText(x.action)}</strong><span>${safeText(x.actor)} · ${safeText(x.role)} · ${formatDate(x.at)}</span><small>${safeText(x.detail)}</small></article>`).join('')||'<p>Nenhuma atividade registrada.</p>';}

const adminViewLabels = { approvalPanel:'Solicitações', memberManagement:'Associados', newsManagement:'Notícias', agendaManagement:'Agenda', documentsManagement:'Documentos', leadershipManagement:'Diretoria e conselhos', auditManagement:'Histórico de atividades' };
const adminViewTargets = { approvalPanel:'approvalPanel', memberManagement:'memberManagement', newsManagement:'contentManagement', agendaManagement:'contentManagement', documentsManagement:'documentsManagement', leadershipManagement:'leadershipManagement', auditManagement:'auditManagement' };
document.querySelectorAll('[data-admin-view]').forEach(button => button.addEventListener('click', () => {
  if (currentUser?.role !== 'secretary') return;
  const id = button.dataset.adminView;
  if (!adminViewLabels[id]) return;
  $('#secretaryDashboard').hidden = true;
  for (const pane of new Set(Object.values(adminViewTargets))) $(`#${pane}`).hidden = pane !== adminViewTargets[id];
  if (id === 'newsManagement' || id === 'agendaManagement') {
    $('#contentManagementTitle').textContent = adminViewLabels[id];
    document.querySelectorAll('.news-admin-only').forEach(node => { node.hidden = id !== 'newsManagement'; });
    document.querySelectorAll('.agenda-admin-only').forEach(node => { node.hidden = id !== 'agendaManagement'; });
    $('.content-admin-grid').classList.add('single-admin-form');
  }
  $('#adminSubpageLabel').textContent = adminViewLabels[id];
  $('#adminSubpageBar').hidden = false;
  $(`#${adminViewTargets[id]}`).scrollIntoView({ behavior:'smooth', block:'start' });
}));
function openAdminDialog(id){ const dialog=$(`#${id}`); if(dialog?.showModal) dialog.showModal(); else if(dialog) dialog.hidden=false; }
function closeAdminDialog(id){ const dialog=$(`#${id}`); if(dialog?.open) dialog.close(); else if(dialog) dialog.hidden=true; }
$('#newsForm [data-modal-close]')?.addEventListener('click',()=>closeAdminDialog('newsDialog'));
$('#eventForm [data-modal-close]')?.addEventListener('click',()=>closeAdminDialog('eventDialog'));
for (const dialog of document.querySelectorAll('.content-dialog')) dialog.addEventListener('close', () => { dialog.querySelector('form')?.removeAttribute('aria-busy'); });
$('#memberCreateOpen')?.addEventListener('click',()=>openAdminDialog('memberCreateDialog'));
$('#memberCreateClose')?.addEventListener('click',()=>closeAdminDialog('memberCreateDialog'));
$('#secretaryCreateForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form=event.currentTarget;
  if(currentUser?.role!=='secretary'){releaseSubmit(form);return;}
  const data=Object.fromEntries(new FormData(form));
  const email=data.email.trim().toLowerCase();
  if(demoUsers[email] || await getMember(email) || await getApplication(email)){
    $('#secretaryCreateError').textContent='Este e-mail já está cadastrado ou possui uma solicitação.';
    releaseSubmit(form);return;
  }
  try {
    await saveMember({email,name:data.name.trim(),phone:data.phone.trim(),address:data.address.trim(),joinedAt:data.joinedAt,profession:data.profession,registration:data.registration.trim(),password:data.password,publicListing:false,showPublicPhoto:false,services:'',samePublicContact:true,publicPhone:'',publicEmail:'',workType:'autonomo',organization:'',status:'approved',createdAt:new Date().toISOString(),approvedAt:new Date().toISOString(),createdBy:currentUser.email});
    await audit('Cadastrou associado pela secretaria',email);
    form.reset();closeAdminDialog('memberCreateDialog');await renderMembers();releaseSubmit(form);
    toast('Associado cadastrado com sucesso. O usuário já aparece na lista de associados.');
  } catch { releaseSubmit(form);$('#secretaryCreateError').textContent='Não foi possível cadastrar o associado. Tente novamente.'; }
});
$('#newsCreateOpen')?.addEventListener('click',()=>{ const f=$('#newsForm'); f.reset(); f.elements.id.value=''; openAdminDialog('newsDialog'); });
$('#eventCreateOpen')?.addEventListener('click',()=>{ const f=$('#eventForm'); f.reset(); f.elements.id.value=''; openAdminDialog('eventDialog'); });
$('#registerForm')?.addEventListener('submit', () => { setTimeout(() => { if ($('#statusResult')?.textContent) { $('#memberAccess')?.scrollIntoView({ behavior:'smooth', block:'start' }); } }, 0); });
document.querySelector('[data-admin-back]')?.addEventListener('click', () => {
  if (currentUser?.role !== 'secretary') return;
  closeAdminDialog('newsDialog'); closeAdminDialog('eventDialog');
  for (const id of new Set(Object.values(adminViewTargets))) $(`#${id}`).hidden = true;
  $('#adminSubpageBar').hidden = true;
  $('#secretaryDashboard').hidden = false;
  $('#secretaryDashboard').scrollIntoView({ behavior:'smooth', block:'start' });
});
async function exportBackup(){if(currentUser?.role!=='secretary')return;const db=await openDatabase();const stores=[...db.objectStoreNames];const snapshot={schema:1,createdAt:new Date().toISOString(),stores:{}};for(const name of stores){snapshot.stores[name]=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),r=tx.objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}db.close();const toJson=async value=>{if(value instanceof Blob){const bytes=new Uint8Array(await value.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return{__blob:true,type:value.type,data:btoa(binary)};}if(Array.isArray(value))return Promise.all(value.map(toJson));if(value&&typeof value==='object'){const out={};for(const [k,v]of Object.entries(value))out[k]=await toJson(v);return out;}return value;};const json=JSON.stringify(await toJson(snapshot),null,2);const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`backup-aearp-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);await audit('Exportou backup local','Todas as coleções IndexedDB');toast('Backup baixado com sucesso. Guarde-o em local seguro.');}
$('#backupExport')?.addEventListener('click',exportBackup);
async function exportMembersExcel(){
  if(currentUser?.role!=='secretary')return;
  const members=(await getMembers()).filter(member=>member.status==='approved').sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const columns=[['Nome','name'],['E-mail','email'],['Telefone','phone'],['Endereço','address'],['Data de filiação','joinedAt'],['Atribuição','profession'],['Registro profissional','registration'],['Serviços','services'],['Forma de atuação','workType'],['Empresa','organization'],['Exibir no diretório','publicListing']];
  const esc=value=>`"${String(value??'').replace(/"/g,'""')}"`;
  const rows=[columns.map(item=>esc(item[0])).join(';'),...members.map(member=>columns.map(([,key])=>esc(key==='joinedAt'&&member[key]?formatDate(member[key]):key==='publicListing'?(member[key]?'Sim':'Não'):member[key])).join(';'))];
  const blob=new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`associados-aearp-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  await audit('Exportou relatório de associados',`${members.length} registros`);toast('Relatório de associados exportado. Abra o arquivo CSV no Excel.');
}
$('#membersExcelExport')?.addEventListener('click',exportMembersExcel);
window.addEventListener('error',event=>{try{const logs=JSON.parse(localStorage.getItem('aearp-error-log')||'[]');logs.push({at:new Date().toISOString(),message:String(event.message||'Erro de script').slice(0,200),page:location.pathname});localStorage.setItem('aearp-error-log',JSON.stringify(logs.slice(-30)));}catch{}});
window.addEventListener('unhandledrejection',event=>{try{const logs=JSON.parse(localStorage.getItem('aearp-error-log')||'[]');logs.push({at:new Date().toISOString(),message:String(event.reason?.message||event.reason||'Falha assíncrona').slice(0,200),page:location.pathname});localStorage.setItem('aearp-error-log',JSON.stringify(logs.slice(-30)));}catch{}});

function logout() {
  currentUser = null;
  sessionStorage.removeItem('aearp-demo-user');
  $('#memberDocuments').hidden = true;
  $('#memberLogin').hidden = false;
}

function renderRow(doc) {
  const extension = doc.fileName.split('.').pop().toLowerCase();
  const expired = doc.expiresAt && doc.expiresAt < new Date().toISOString().slice(0,10);
  const recent = Date.now() - new Date(doc.createdAt).getTime() < 14*86400000;
  const action = currentUser.role === 'secretary'
    ? `<button class="delete-button" data-delete="${safeText(doc.id)}" title="Excluir documento" aria-label="Excluir ${safeText(doc.title)}">×</button>`
    : `<button class="download-button" data-download="${safeText(doc.id)}" title="Baixar documento" aria-label="Baixar ${safeText(doc.title)}">↓</button>`;
  return `<article class="document-row"><div class="file-icon ${safeText(extension)}">${safeText(extension.toUpperCase())}</div><div class="file-info"><strong>${safeText(doc.title)}</strong><span>${safeText(doc.fileName)} · ${formatSize(doc.size)} · ${formatDate(doc.createdAt)}${doc.expiresAt ? ` · Validade ${formatDate(doc.expiresAt)}` : ''}${expired ? ' · EXPIRADO' : recent ? ' · NOVO' : ''}</span></div><span class="file-category">${safeText(doc.category)}</span>${action}</article>`;
}

async function renderDocuments() {
  const list = $('#documentList');
  const empty = $('#emptyState');
  if (!list || !currentUser) return;
  const query = $('#docSearch').value.trim().toLocaleLowerCase('pt-BR');
  const category = $('#categoryFilter').value;
  try {
    const docs = (await getDocuments()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const filtered = docs.filter((doc) => (category === 'all' || doc.category === category)
      && (!query || `${doc.title} ${doc.fileName} ${doc.category}`.toLocaleLowerCase('pt-BR').includes(query)));
    const categoryOrder = ['Comunicados', 'Atas', 'Documentos institucionais', 'Materiais técnicos', 'Outros'];
    const groups = categoryOrder.map(category => ({ category, docs: filtered.filter(doc => doc.category === category) })).filter(group => group.docs.length);
    const uncategorized = filtered.filter(doc => !categoryOrder.includes(doc.category));
    if (uncategorized.length) groups.push({ category: 'Outros', docs: uncategorized });
    list.innerHTML = groups.map(group => `<section class="document-category"><h2>${safeText(group.category)}</h2>${group.docs.map(renderRow).join('')}</section>`).join('');
    list.hidden = filtered.length === 0;
    empty.hidden = filtered.length !== 0;
    empty.querySelector('h2').textContent = docs.length && !filtered.length ? 'Nenhum resultado encontrado' : 'Nenhum documento disponível';
    empty.querySelector('p').textContent = docs.length && !filtered.length ? 'Ajuste a busca ou escolha outra categoria.' : 'Quando novos arquivos forem publicados, eles aparecerão nesta página.';
  } catch (error) {
    console.error(error);
    toast('Não foi possível carregar os documentos.');
  }
}

async function renderMemberProfile(user) {
  const member = await getMember(user.email);
  if (!member || member.status !== 'approved') { $('#memberProfile').hidden = true; return; }
  const form = $('#profileChangeForm');
  const pending = await getProfileChange(user.email);
  const source = pending?.status === 'pending' ? pending.proposed : member;
  $('#memberHomeStatus').hidden = pending?.status !== 'pending';
  $('#memberHomeStatus').textContent = 'Sua alteração de cadastro está aguardando aprovação da secretaria.';
  for (const key of ['name','email','phone','address','joinedAt','profession','registration','services','publicPhone','publicEmail','workType','organization']) if (form.elements[key]) form.elements[key].value = source[key] || '';
  form.elements.email.readOnly = true;
  form.elements.publicListing.checked = Boolean(source.publicListing);
  if(form.elements.showPublicPhoto)form.elements.showPublicPhoto.checked=Boolean(source.showPublicPhoto);
  form.elements.samePublicContact.checked = Boolean(source.samePublicContact);
  if (source.photo instanceof Blob) { const preview=form.querySelector('[data-photo-preview]'); if(preview){ preview.innerHTML=`<img src="${URL.createObjectURL(source.photo)}" alt="Prévia da foto">`; preview.hidden=false; form.querySelector('.photo-remove')?.removeAttribute('hidden'); } }
  $('#profileChangeStatus').textContent = pending?.status === 'pending' ? 'Você já tem uma alteração aguardando análise. Você pode atualizar essa proposta.' : '';
}
$('#profileChangeForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!currentUser || currentUser.role !== 'member') { releaseSubmit(form); return; }
  try {
  const member = await getMember(currentUser.email);
  if (!member || member.status !== 'approved') { logout(); return; }
  const data = Object.fromEntries(new FormData(form));
  if (data.publicListing === 'on' && (!data.services.trim() || !data.workType || (data.workType === 'empresa' && !data.organization.trim()))) {
    $('#profileChangeError').textContent = 'Para divulgar o perfil, informe serviços, forma de atuação e empresa, se aplicável.'; return;
  }
  const optimizedPhoto = data.photo?.size ? await optimizeImage(data.photo) : null;
  const proposed = { ...member, ...(data.removePhoto === 'on' ? { photo: '' } : optimizedPhoto ? { photo:optimizedPhoto } : {}), name:data.name.trim(), phone:data.phone.trim(), address:data.address.trim(), joinedAt:data.joinedAt, profession:data.profession, registration:data.registration.trim(), publicListing:data.publicListing === 'on', showPublicPhoto:data.showPublicPhoto === 'on', services:data.services.trim(), samePublicContact:data.samePublicContact === 'on', publicPhone:data.samePublicContact === 'on' ? data.phone.trim() : data.publicPhone.trim(), publicEmail:data.samePublicContact === 'on' ? data.email.trim().toLowerCase() : data.publicEmail.trim().toLowerCase(), workType:data.workType, organization:data.organization.trim() };
  await saveProfileChange({ email:member.email, proposed, status:'pending', submittedAt:new Date().toISOString() });
  $('#profileChangeError').textContent = '';
  await audit('Solicitou alteração de cadastro', member.email);
  await renderMemberProfile(member);
  $('#memberProfile').hidden = true;
  $('#profileToggle').textContent = 'Alterar meu cadastro';
  $('#memberHomeStatus').textContent = 'Alteração enviada com sucesso. Aguarde a aprovação da secretaria; seus dados atuais continuam válidos.';
  $('#memberHomeStatus').hidden = false;
  $('#memberHomeStatus').scrollIntoView({ behavior:'smooth', block:'center' });
  releaseSubmit(form);
  toast('Alteração enviada com sucesso à secretaria para aprovação.');
  } catch {
    $('#profileChangeError').textContent = 'Não foi possível enviar a alteração. Seus dados foram mantidos no formulário; tente novamente.';
  } finally { releaseSubmit(form); }
});
async function renderProfileChanges() {
  const list = $('#profileChangeList'); if (!list) return;
  const activeEmails = new Set((await getMembers()).filter(m => m.status === 'approved').map(m => m.email));
  const changes = (await getProfileChanges()).filter(item => item.status === 'pending' && activeEmails.has(item.email));
  list.innerHTML = changes.map(item => `<article class="approval-row"><div><strong>${safeText(item.proposed.name)}</strong><span>${safeText(item.email)} · ${safeText(item.proposed.profession)}</span><small>Recebida em ${formatDate(item.submittedAt)}. Revise e aprove para atualizar o perfil publicado.</small></div><button class="btn btn-blue" type="button" data-profile-approve="${safeText(item.email)}">Aprovar</button><button class="request-reject" type="button" data-profile-reject="${safeText(item.email)}">Recusar</button></article>`).join('');
  $('#profileChangeEmpty').hidden = changes.length > 0;
}
$('#profileChangeList')?.addEventListener('click', async event => {
  if (currentUser?.role !== 'secretary') return;
  const approve = event.target.closest('[data-profile-approve]'); const reject = event.target.closest('[data-profile-reject]'); const email = approve?.dataset.profileApprove || reject?.dataset.profileReject; if (!email) return;
  const change = await getProfileChange(email); const member = await getMember(email); if (!change || !member || member.status !== 'approved') return;
  if (approve) await saveMember({ ...member, ...change.proposed, email:member.email, status:'approved' });
  await deleteProfileChange(email); await audit(approve ? 'Aprovou alteração de perfil' : 'Recusou alteração de perfil',email); await renderProfileChanges(); await renderMembers();
  toast(approve ? 'Alteração aprovada e publicada no diretório.' : 'Alteração recusada; os dados atuais foram mantidos.');
});

$('#loginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('#emailInput').value.trim().toLowerCase();
  const user = demoUsers[email] || await getMember(email);
  if (!user || user.password !== $('#passwordInput').value || (!demoUsers[email] && user.status !== 'approved')) {
    $('#loginError').textContent = 'E-mail ou senha inválidos.';
    return;
  }
  $('#loginError').textContent = '';
  showDocuments({ ...user, email });
});

function setMemberView(view) {
  document.querySelectorAll('.member-view').forEach((form) => { form.hidden = form.id !== `${view}Form`; });
  document.querySelectorAll('.member-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.memberView === view));
}
document.querySelectorAll('.member-tab').forEach((tab) => tab.addEventListener('click', () => setMemberView(tab.dataset.memberView)));

$('#registerForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const email = data.email.trim().toLowerCase();
  const error = $('#registerError');
  const existingMember = await getMember(email);
  const existingApplication = await getApplication(email);
  if (demoUsers[email] || existingMember || existingApplication?.status === 'pending') {
    error.textContent = existingApplication?.status === 'pending'
      ? 'Já existe uma solicitação aguardando análise para este e-mail.'
      : 'Este e-mail já possui acesso aprovado.';
    releaseSubmit(form);
    return;
  }
  if (data.publicListing === 'on' && (!data.services.trim() || !data.workType || (data.workType === 'empresa' && !data.organization.trim()) || (data.samePublicContact !== 'on' && !data.publicPhone.trim() && !data.publicEmail.trim()))) {
    error.textContent = 'Para divulgar seu perfil, informe serviços, forma de atuação, empresa se aplicável e ao menos um contato profissional.';
    releaseSubmit(form);
    return;
  }
  const optimizedPhoto = data.photo?.size ? await optimizeImage(data.photo) : '';
  await saveApplication({ photo: optimizedPhoto, email, name: data.name.trim(), phone: data.phone.trim(), address: data.address.trim(), joinedAt: data.joinedAt, profession: data.profession, registration: data.registration.trim(), publicListing: data.publicListing === 'on', showPublicPhoto: data.showPublicPhoto === 'on', services: data.services.trim(), samePublicContact: data.samePublicContact === 'on', publicPhone: data.samePublicContact === 'on' ? data.phone.trim() : data.publicPhone.trim(), publicEmail: data.samePublicContact === 'on' ? email : data.publicEmail.trim().toLowerCase(), workType: data.workType, organization: data.organization.trim(), password: data.password, status: 'pending', createdAt: new Date().toISOString() });
  await audit('Enviou cadastro de associado',email);
  form.reset();
  releaseSubmit(form);
  setMemberView('status');
  $('#statusForm [name="email"]').value = email;
  $('#statusResult').textContent = 'Cadastro enviado com sucesso. A secretaria analisará seus dados.';
});

$('#statusForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = new FormData(event.currentTarget).get('email').trim().toLowerCase();
  const application = await getApplication(email);
  const member = await getMember(email);
  const messages = { pending: 'Sua solicitação está aguardando análise da secretaria.', rejected: 'A solicitação não foi aprovada. Entre em contato com a AEARP para mais informações.' };
  $('#statusResult').textContent = member?.status === 'approved' ? 'Cadastro aprovado. Você já pode entrar com seu e-mail e senha.' : application?.status === 'rejected' ? 'Solicitação negada. Você pode enviar um novo cadastro atualizado.' : messages[application?.status] || 'Não encontramos uma solicitação para este e-mail.';
});

async function renderApplications() {
  if (currentUser?.role !== 'secretary') return;
  const list = $('#requestList');
  const empty = $('#requestEmpty');
  const applications = (await getApplications()).filter((item) => item.status === 'pending');
  const activeEmails = new Set((await getMembers()).filter(m => m.status === 'approved').map(m => m.email));
  const profileRequests = (await getProfileChanges()).filter(item => item.status === 'pending' && activeEmails.has(item.email)).length;
  $('#pendingCount').textContent = String(applications.length + profileRequests);
  list.innerHTML = applications.map((item) => `<article class="approval-row"><div><strong>${safeText(item.name)}</strong><span>${safeText(item.email)} · ${safeText(item.phone)}</span><span>${safeText(item.profession)}${item.registration ? ` · Registro ${safeText(item.registration)}` : ''}</span><small>Recebida em ${formatDate(item.createdAt)}. Confirme o vínculo antes de aprovar.</small></div><button class="btn btn-blue" type="button" data-approve="${safeText(item.email)}">Aprovar</button><button class="request-reject" type="button" data-reject="${safeText(item.email)}">Recusar</button></article>`).join('');
  empty.hidden = applications.length > 0;
}

async function renderMembers() {
  if (currentUser?.role !== 'secretary') return;
  const list = $('#memberList');
  const empty = $('#memberListEmpty');
  const query = $('#memberSearch').value.trim().toLocaleLowerCase('pt-BR');
  const members = (await getMembers()).filter((member) => member.status === 'approved')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  $('#membersCount').textContent = String(members.length);
  const exportButton=$('#membersExcelExport'); if(exportButton) exportButton.disabled=members.length===0;
  const archived = (await getMembers()).filter(m => m.status === 'archived' && `${m.name} ${m.email} ${m.registration || ''}`.toLocaleLowerCase('pt-BR').includes(query));
  $('#archivedMemberList').innerHTML = archived.map(m => `<article class="member-admin-row"><div><strong>${safeText(m.name)}</strong><span>${safeText(m.email)} · Arquivado em ${formatDate(m.archivedAt)}</span><span>Dados e histórico preservados. Acesso suspenso.</span></div><button type="button" class="managed-edit" data-member-restore="${safeText(m.email)}">Restaurar usuário</button><button type="button" class="managed-edit" data-member-history="${safeText(m.email)}">Ver histórico</button></article>`).join('') || '<p>Nenhum usuário arquivado corresponde à busca.</p>';
  const filtered = members.filter((member) => `${member.name} ${member.email} ${member.profession} ${member.registration}`.toLocaleLowerCase('pt-BR').includes(query));
  list.innerHTML = filtered.map((member) => `<article class="member-admin-row"><div><strong>${safeText(member.name)}</strong><span>${safeText(member.email)} · ${safeText(member.phone || 'Sem telefone')}</span><span>${safeText(member.profession || 'Atribuição não informada')}${member.registration ? ` · Registro ${safeText(member.registration)}` : ''} · Filiação ${safeText(member.joinedAt ? formatDate(member.joinedAt) : 'não informada')}</span><small class="private-member-data">Endereço: ${safeText(member.address || 'não informado')}</small></div><button type="button" class="managed-edit" data-member-edit="${safeText(member.email)}">Editar</button><button type="button" class="managed-edit" data-member-history="${safeText(member.email)}">Ver histórico</button><button type="button" class="request-reject" data-member-delete="${safeText(member.email)}">Arquivar usuário</button></article>`).join('');
  empty.hidden = filtered.length > 0;
  empty.textContent = members.length && !filtered.length ? 'Nenhum associado corresponde à busca.' : 'Ainda não há associados aprovados.';
}
$('#memberSearch')?.addEventListener('input', renderMembers);
$('#memberManagement')?.addEventListener('click', async (event) => {
  if (currentUser?.role !== 'secretary') return;
  const restore = event.target.closest('[data-member-restore]');
  const history = event.target.closest('[data-member-history]');
  if (history) {
    const member = await getMember(history.dataset.memberHistory);
    if (!member) return;
    const emails = new Set([member.email, ...(member.previousEmails || [])]);
    const records = (await getAudit()).filter(x => emails.has(x.detail)).sort((a,b) => b.at.localeCompare(a.at));
    $('#memberHistoryName').textContent = member.name;
    $('#memberHistoryList').innerHTML = records.map(x => `<article class="audit-row"><strong>${safeText(x.action)}</strong><span>${safeText(new Date(x.at).toLocaleString('pt-BR'))}</span><small>${safeText(x.actor)}</small></article>`).join('') || '<p>Nenhuma atividade registrada para este associado.</p>';
    $('#memberHistoryDialog').showModal();
    return;
  }
  if (restore) {
    const member = await getMember(restore.dataset.memberRestore);
    if (!member || member.status !== 'archived' || !window.confirm(`Restaurar o acesso de ${member.name} com os dados anteriores?`)) return;
    try {
      await saveMember({ ...member, status:'approved', restoredAt:new Date().toISOString() });
      await audit('Restaurou acesso de associado',member.email);
      await renderMembers(); await renderProfileChanges(); await renderApplications();
      toast('Usuário restaurado com sucesso. Seu acesso e perfil foram reativados.');
    } catch { toast('Não foi possível restaurar o usuário. Tente novamente.'); }
    return;
  }
  const edit = event.target.closest('[data-member-edit]');
  const remove = event.target.closest('[data-member-delete]');
  if (edit) {
    const member = await getMember(edit.dataset.memberEdit);
    if (!member) return;
    const form = $('#memberEditForm');
    form.elements.originalEmail.value = member.email;
    form.elements.name.value = member.name || '';
    form.elements.email.value = member.email || '';
    form.elements.phone.value = member.phone || '';
    form.elements.address.value = member.address || '';
    form.elements.joinedAt.value = member.joinedAt || '';
    form.elements.profession.value = member.profession || '';
    form.elements.registration.value = member.registration || '';
    form.elements.publicListing.checked = Boolean(member.publicListing);
    form.elements.showPublicPhoto.checked=Boolean(member.showPublicPhoto);
    form.elements.services.value = member.services || '';
    form.elements.samePublicContact.checked = Boolean(member.samePublicContact);
    form.elements.publicPhone.value = member.publicPhone || '';
    form.querySelectorAll('.public-contact-field').forEach(field => { field.hidden = form.elements.samePublicContact.checked; });
    form.elements.publicEmail.value = member.publicEmail || '';
    if (member.photo instanceof Blob) { const preview=form.querySelector('[data-photo-preview]'); if(preview){ preview.innerHTML=`<img src="${URL.createObjectURL(member.photo)}" alt="Prévia da foto">`; preview.hidden=false; form.querySelector('.photo-remove')?.removeAttribute('hidden'); } }
    form.elements.workType.value = member.workType || '';
    form.elements.organization.value = member.organization || '';
    form.elements.password.value = '';
    $('#memberEditDialog').showModal();
  }
  if (remove) {
    const member = await getMember(remove.dataset.memberDelete);
    if (!member || member.status !== 'approved' || !window.confirm(`Arquivar ${member.name}? O acesso será suspenso e o perfil público ficará oculto. Os dados serão preservados para restauração.`)) return;
    try {
      await saveMember({ ...member, status:'archived', archivedAt:new Date().toISOString(), archivedBy:currentUser.email });
      await audit('Arquivou acesso de associado',member.email);
      await renderMembers(); await renderProfileChanges(); await renderApplications();
      toast('Usuário arquivado com sucesso. Você pode restaurá-lo em Usuários arquivados.');
    } catch { toast('Não foi possível arquivar o usuário. Tente novamente.'); }
  }
});
$('#memberHistoryClose')?.addEventListener('click', () => $('#memberHistoryDialog').close());
$('#memberEditClose')?.addEventListener('click', () => $('#memberEditDialog').close());
$('#memberEditForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (currentUser?.role !== 'secretary') return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const oldEmail = data.originalEmail;
  const member = await getMember(oldEmail);
  if (!member) return;
  const email = data.email.trim().toLowerCase();
  if (email !== oldEmail && (demoUsers[email] || await getMember(email))) {
    $('#memberEditError').textContent = 'Este e-mail já está cadastrado.';
    releaseSubmit(form);
    return;
  }
  if (data.publicListing === 'on' && (!data.services.trim() || !data.workType || (data.workType === 'empresa' && !data.organization.trim()))) {
    $('#memberEditError').textContent = 'Para divulgar o perfil, informe os serviços, a forma de atuação e, se aplicável, a empresa.';
    releaseSubmit(form);
    return;
  }
  const optimizedPhoto = data.photo?.size ? await optimizeImage(data.photo) : null;
  await saveMember({ ...member, ...(data.removePhoto === 'on' ? { photo: '' } : optimizedPhoto ? { photo:optimizedPhoto } : {}), email, name: data.name.trim(), phone: data.phone.trim(), address: data.address.trim(), joinedAt: data.joinedAt, profession: data.profession, registration: data.registration.trim(), publicListing: data.publicListing === 'on', showPublicPhoto: data.showPublicPhoto === 'on', services: data.services.trim(), samePublicContact: data.samePublicContact === 'on', publicPhone: data.samePublicContact === 'on' ? data.phone.trim() : data.publicPhone.trim(), publicEmail: data.samePublicContact === 'on' ? email : data.publicEmail.trim().toLowerCase(), workType: data.workType, organization: data.organization.trim(), ...(data.password ? { password: data.password } : {}) });
  if (email !== oldEmail) {
    const updated = await getMember(email);
    await saveMember({ ...updated, previousEmails:[...(member.previousEmails || []), oldEmail] });
    await deleteMember(oldEmail);
    await deleteProfileChange(oldEmail);
  }
  await audit('Editou cadastro de associado',email);
  $('#memberEditDialog').close();
  await renderMembers();
  closeAdminDialog('memberEditDialog');
  if (email !== oldEmail) {
    const user = JSON.parse(sessionStorage.getItem('aearp-demo-user') || '{}');
    if (user.email === oldEmail) sessionStorage.setItem('aearp-demo-user', JSON.stringify({ ...user, email }));
  }
  releaseSubmit(form);
  toast('Cadastro atualizado com sucesso.');
});

async function renderManagedContent() {
  if (currentUser?.role !== 'secretary') return;
  for (const [type, target] of [['news', '#managedNews'], ['events', '#managedEvents']]) {
    const items = (await getContent(type)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    $(target).innerHTML = items.map((item) => `<article class="managed-item"><div><strong>${safeText(item.title)}</strong><span>${type === 'news' ? formatDate(item.date) : `${formatDate(item.date)} · ${safeText(item.time || '')} · ${safeText(item.location || '')}`}</span></div><div class="managed-actions"><button type="button" class="managed-edit" data-content-edit="${type}" data-id="${safeText(item.id)}">Editar</button><button type="button" class="request-reject" data-content-delete="${type}" data-id="${safeText(item.id)}">Excluir</button></div></article>`).join('') || '<p class="managed-empty">Nenhum conteúdo publicado ainda.</p>';
  }
}

$('#newsForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (currentUser?.role !== 'secretary') { releaseSubmit(form); return; }
  const data = Object.fromEntries(new FormData(form));
  const isEdit = Boolean(data.id);
  try {
    const imageFile = data.imageFile;
    if (imageFile?.size && (!imageFile.type.startsWith('image/') || imageFile.size > MAX_NEWS_IMAGE_SIZE)) {
      $('#newsImageError').textContent = 'Escolha uma imagem válida de até 12 MB.';
      releaseSubmit(form);
      return;
    }
    const previous = isEdit ? (await getContent('news')).find(item => item.id === data.id) : null;
    const image = data.removeImage === 'on' ? '' : imageFile?.size ? await optimizeImage(imageFile) : previous?.image || '';
    await saveContent('news', { id: data.id || crypto.randomUUID(), title: data.title.trim(), summary: data.summary.trim(), body: data.body.trim(), date: data.date, image, createdAt: previous?.createdAt || new Date().toISOString() });
    await audit(isEdit?'Atualizou notícia':'Publicou notícia',data.title);
    await renderManagedContent();
    form.reset();
    closeAdminDialog('newsDialog');
    $('#newsImagePreview').replaceChildren();
    $('#newsImagePreview').hidden = true;
    $('.news-image-remove').hidden = true;
    $('#newsImageError').textContent = '';
    form.querySelector('[type="submit"]').textContent = 'Publicar notícia ↗';
    $('#managedNews').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast(isEdit ? 'Notícia atualizada com sucesso e exibida na lista de notícias.' : 'Notícia cadastrada com sucesso e exibida na lista de notícias.');
  } catch (error) {
    console.error(error);
    $('#newsImageError').textContent = 'Não foi possível processar ou salvar a imagem. Tente outro arquivo.';
    releaseSubmit(form);
    toast('Não foi possível salvar a notícia. Tente novamente.');
  }
});

$('#eventForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (currentUser?.role !== 'secretary') { releaseSubmit(form); return; }
  const data = Object.fromEntries(new FormData(form));
  const isEdit = Boolean(data.id);
  try {
    await saveContent('events', { id: data.id || crypto.randomUUID(), title: data.title.trim(), description: data.description.trim(), date: data.date, time: data.time, location: data.location.trim(), link: data.link.trim() });
    await audit(isEdit?'Atualizou evento':'Publicou evento',data.title);
    await renderManagedContent();
    form.reset();
    closeAdminDialog('eventDialog');
    form.querySelector('[type="submit"]').textContent = 'Adicionar à agenda ↗';
    $('#managedEvents').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast(isEdit ? 'Evento atualizado com sucesso e exibido na lista de eventos.' : 'Evento cadastrado com sucesso e exibido na lista de eventos.');
  } catch (error) {
    console.error(error);
    releaseSubmit(form);
    toast('Não foi possível salvar o evento. Tente novamente.');
  }
});

$('#contentManagement')?.addEventListener('click', async (event) => {
  if (currentUser?.role !== 'secretary') return;
  const button = event.target.closest('[data-content-delete]');
  const editButton = event.target.closest('[data-content-edit]');
  if (editButton) {
    const form = editButton.dataset.contentEdit === 'news' ? $('#newsForm') : $('#eventForm');
    const item = (await getContent(editButton.dataset.contentEdit)).find((entry) => entry.id === editButton.dataset.id);
    if (!item) return;
    for (const field of new FormData(form).keys()) if (form.elements[field] && !['imageFile','removeImage'].includes(field)) form.elements[field].value = item[field] || '';
    if (editButton.dataset.contentEdit === 'news') {
      form.elements.removeImage.checked = false;
      const preview = $('#newsImagePreview');
      const image = item.image instanceof Blob ? URL.createObjectURL(item.image) : typeof item.image === 'string' && /^https?:\/\//i.test(item.image) ? item.image : '';
      preview.replaceChildren();
      if (image) { const img = document.createElement('img'); img.src = image; img.alt = 'Imagem atual da notícia'; preview.append(img); preview.hidden = false; $('.news-image-remove').hidden = false; }
      else { preview.hidden = true; $('.news-image-remove').hidden = true; }
    }
    form.elements.id.value = item.id;
    form.querySelector('[type="submit"]').textContent = editButton.dataset.contentEdit === 'news' ? 'Salvar alterações ↗' : 'Salvar alterações ↗';
    openAdminDialog(editButton.dataset.contentEdit === 'news' ? 'newsDialog' : 'eventDialog');
    return;
  }
  if (!button) return;
  await deleteContent(button.dataset.contentDelete, button.dataset.id);
  await audit(`Removeu ${button.dataset.contentDelete === 'news' ? 'notícia' : 'evento'}`,button.closest('.managed-item')?.querySelector('strong')?.textContent || '');
  await renderManagedContent();
  toast('Conteúdo removido.');
});

const newsImageInput = $('#newsForm [name="imageFile"]');
newsImageInput?.addEventListener('change', () => {
  const file = newsImageInput.files?.[0];
  const preview = $('#newsImagePreview');
  preview.replaceChildren();
  if (file) {
    const img = document.createElement('img'); img.src = URL.createObjectURL(file); img.alt = 'Prévia da imagem da notícia'; preview.append(img); preview.hidden = false;
    $('#newsForm [name="removeImage"]').checked = false;
    $('.news-image-remove').hidden = false;
    $('#newsImageError').textContent = file.size > MAX_NEWS_IMAGE_SIZE ? 'A imagem excede o limite de 12 MB.' : '';
  }
});
$('#newsForm [name="removeImage"]')?.addEventListener('change', event => {
  if (event.target.checked) { $('#newsImagePreview').hidden = true; newsImageInput.value = ''; }
});
$('#requestList')?.addEventListener('click', async (event) => {
  if (currentUser?.role !== 'secretary') return;
  const approve = event.target.closest('[data-approve]');
  const reject = event.target.closest('[data-reject]');
  const email = approve?.dataset.approve || reject?.dataset.reject;
  if (!email) return;
  const application = await getApplication(email);
  if (!application) return;
  if (approve) {
    const { status, createdAt, ...member } = application;
    await saveMember({ ...member, role: 'member', status: 'approved', approvedAt: new Date().toISOString() });
    await audit('Aprovou associado',email);
    await deleteApplication(email);
  } else { await saveApplication({ ...application, status: 'rejected' }); await audit('Recusou cadastro',email); }
  await renderApplications();
  if (approve) await renderMembers();
  toast(approve ? 'Cadastro aprovado.' : 'Solicitação recusada.');
});

$('#profileToggle')?.addEventListener('click', () => {
  const profile = $('#memberProfile');
  const open = profile.hidden;
  profile.hidden = !open;
  $('#profileToggle').textContent = open ? 'Fechar alteração de cadastro' : 'Alterar meu cadastro';
  if (open) profile.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#logoutButton')?.addEventListener('click', logout);
$('#docSearch')?.addEventListener('input', renderDocuments);
$('#categoryFilter')?.addEventListener('change', renderDocuments);
$('#uploadTrigger')?.addEventListener('click', () => $('#uploadDialog').showModal());
$('#uploadClose')?.addEventListener('click', () => $('#uploadDialog').close());
$('#fileInput')?.addEventListener('change', (event) => {
  $('#fileLabel').textContent = event.target.files[0]?.name || 'Escolha um arquivo';
});

$('#uploadForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (currentUser?.role !== 'secretary') { releaseSubmit(form); return; }
  const file = $('#fileInput').files[0];
  const extension = file?.name.split('.').pop().toLowerCase();
  if (!file || !allowedExtensions.has(extension)) {
    $('#uploadError').textContent = 'Escolha um PDF, DOC, DOCX, XLS, XLSX, PPT ou PPTX.';
    releaseSubmit(form);
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    $('#uploadError').textContent = 'O arquivo excede o limite de 20 MB.';
    releaseSubmit(form);
    return;
  }
  try {
    await saveDocument({ id: crypto.randomUUID(), title: $('#titleInput').value.trim(), category: $('#categoryInput').value, fileName: file.name, size: file.size, createdAt: new Date().toISOString(), expiresAt: $('#expiryInput').value || '', blob: file });
    await audit('Publicou documento',$('#titleInput').value.trim());
    form.reset();
    $('#fileLabel').textContent = 'Escolha um arquivo';
    $('#uploadDialog').close();
    await renderDocuments();
    releaseSubmit(form);
    toast('Documento publicado com sucesso.');
  } catch (error) {
    console.error(error);
    $('#uploadError').textContent = 'Não foi possível salvar neste navegador.';
    releaseSubmit(event.currentTarget);
  }
});

$('#documentList')?.addEventListener('click', async (event) => {
  const download = event.target.closest('[data-download]');
  const remove = event.target.closest('[data-delete]');
  if (download && currentUser?.role === 'member') {
    const doc = (await getDocuments()).find((item) => item.id === download.dataset.download);
    if (!doc) return;
    const url = URL.createObjectURL(doc.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = doc.fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (remove && currentUser?.role === 'secretary') {
    const removed=(await getDocuments()).find(x=>x.id===remove.dataset.delete);
    await deleteDocument(remove.dataset.delete);
    await audit('Removeu documento',removed?.title||'');
    await renderDocuments();
    toast('Documento removido.');
  }
});

function setupPhotoInputs() {
  document.querySelectorAll('form').forEach(form => {
    const input = form.elements.photo, preview = form.querySelector('[data-photo-preview]'), remove = form.elements.removePhoto;
    if (!input || !preview) return;
    const show = file => { if (!file) return; const url=URL.createObjectURL(file); preview.innerHTML=`<img src="${url}" alt="Prévia da foto">`; preview.hidden=false; if(remove) remove.closest('label').hidden=false; };
    input.addEventListener('change', () => { if (input.files[0]) { if(remove) remove.checked=false; show(input.files[0]); } });
    remove?.addEventListener('change', () => { if(remove.checked) { preview.innerHTML=''; preview.hidden=true; } });
  });
}
setupPhotoInputs();

const saved = sessionStorage.getItem('aearp-demo-user');
async function restoreSession() {
if (saved && $('#memberLogin')) {
  try {
    const user = JSON.parse(saved);
    const account = demoUsers[user.email] || await getMember(user.email);
    if (account?.role === user.role && (demoUsers[user.email] || account.status === 'approved')) showDocuments({ ...account, email: user.email });
    else logout();
  } catch {
    logout();
  }
}
}
restoreSession();

for (const form of [$('#registerForm'), $('#memberEditForm'), $('#profileChangeForm')].filter(Boolean)) {
  const toggleContacts = () => form.querySelectorAll('.public-contact-field').forEach(field => { field.hidden = form.elements.samePublicContact.checked; });
  form.elements.samePublicContact.addEventListener('change', toggleContacts); toggleContacts();
}
const registerForm = $('#registerForm');
if (registerForm) {
  const publicToggle = registerForm.elements.publicListing;
  const profileFields = [...registerForm.querySelectorAll('.public-profile-field')];
  const togglePublicProfile = () => {
    const enabled = publicToggle.checked;
    profileFields.forEach(field => {
      field.hidden = !enabled;
      field.querySelectorAll('input, select, textarea').forEach(input => {
        if (input.name === 'registration' || input.name === 'publicPhone' || input.name === 'publicEmail' || input.name === 'organization' || input.name === 'services') input.required = false;
        if (input.name === 'profession' || input.name === 'workType') input.required = enabled;
      });
    });
    if (!enabled) {
      registerForm.elements.samePublicContact.checked = true;
      registerForm.querySelectorAll('.public-contact-field').forEach(field => { field.hidden = true; });
    } else {
      registerForm.querySelectorAll('.public-contact-field').forEach(field => { field.hidden = registerForm.elements.samePublicContact.checked; });
    }
  };
  publicToggle.addEventListener('change', togglePublicProfile);
  togglePublicProfile();
}
