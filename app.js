import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const APP_VERSION='0.3.0';
const CONFIG_KEY='biblioclasse_firebase_config';
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAM1E55hoouI3JFfGT9dFMxcvNHFVLtRIY",
  authDomain: "biblioclasse-206e4.firebaseapp.com",
  projectId: "biblioclasse-206e4",
  storageBucket: "biblioclasse-206e4.firebasestorage.app",
  messagingSenderId: "759815939198",
  appId: "1:759815939198:web:be9474de960e6de652642f"
};
const LOCAL_KEY='biblioclasse_local_v03';
const TYPES={A:'Album',R:'Roman',D:'Documentaire',BD:'BD / manga',C:'Conte / légende',P:'Poésie',T:'Théâtre'};
const OWNERS={classe:'Bibliothèque de classe',ecole:'Bibliothèque de l’école',personnel:'Personnel enseignant'};
const DEFAULT_COLLECTIONS={
  'Max et Lili':'ML',
  'La Cabane magique':'CAB',
  'Les Enquêtes d’Anatole Bristol':'ANA',
  'Les Enquêtes d\'Anatole Bristol':'ANA',
  'Je suis en CE2':'JCE'
};

const state={
  mode:'local', firebase:null, auth:null, fs:null, user:null, teacherUnlocked:false,
  books:[], students:[], loans:[], settings:{teacherPin:'1234',collections:{...DEFAULT_COLLECTIONS}},
  screen:'home', teacherTab:'library', scanner:null, scanHandler:null, scanMode:'single', scanBusy:false, lastScan:{code:'',at:0}, unsub:[]
};

const $=s=>document.querySelector(s);
const appEl=$('#app');
const norm=s=>(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=s=>(s??'').toString().replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const slug=s=>norm(s).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const uid=()=>crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const nowIso=()=>new Date().toISOString();

function toast(msg,ms=2200){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),ms)}
function modal(html){const m=$('#modal');m.innerHTML=`<div class="modal-box">${html}</div>`;m.classList.remove('hidden');m.setAttribute('aria-hidden','false')}
function closeModal(){const m=$('#modal');m.classList.add('hidden');m.innerHTML='';m.setAttribute('aria-hidden','true')}
window.closeModal=closeModal;

function localLoad(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY))||null}catch{return null}}
function localSave(){localStorage.setItem(LOCAL_KEY,JSON.stringify({books:state.books,students:state.students,loans:state.loans,settings:state.settings}))}
function loadLocalIntoState(){const d=localLoad();if(d){state.books=d.books||[];state.students=d.students||[];state.loans=d.loans||[];state.settings={teacherPin:'1234',collections:{...DEFAULT_COLLECTIONS},...(d.settings||{}),collections:{...DEFAULT_COLLECTIONS,...(d.settings?.collections||{})}}}}

function readFirebaseConfig(){
  try{
    const saved=localStorage.getItem(CONFIG_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_FIREBASE_CONFIG;
  }catch{
    return DEFAULT_FIREBASE_CONFIG;
  }
}
function storeFirebaseConfig(cfg){localStorage.setItem(CONFIG_KEY,JSON.stringify(cfg))}
function clearFirebaseConfig(){localStorage.removeItem(CONFIG_KEY);location.reload()}

async function initFirebase(cfg){
  try{
    const fbApp=getApps().length?getApps()[0]:initializeApp(cfg);
    state.firebase=fbApp; state.auth=getAuth(fbApp); state.fs=getFirestore(fbApp); state.mode='cloud';
    await setPersistence(state.auth,browserLocalPersistence);
    onAuthStateChanged(state.auth,async user=>{
      state.user=user||null;
      clearSubscriptions();
      if(user){subscribeCloud();} else {state.books=[];state.students=[];state.loans=[];render();}
    });
  }catch(e){console.error(e);toast('Configuration Firebase invalide');state.mode='local';renderSetup(true,e.message)}
}
function clearSubscriptions(){state.unsub.forEach(fn=>{try{fn()}catch{}});state.unsub=[]}
function userCol(name){return collection(state.fs,'users',state.user.uid,name)}
function userDoc(colName,id){return doc(state.fs,'users',state.user.uid,colName,id)}
function subscribeCloud(){
  const make=(name,key,order='title')=>{
    let ref=userCol(name); try{ref=query(ref,orderBy(order))}catch{}
    const unsub=onSnapshot(ref,snap=>{state[key]=snap.docs.map(d=>({id:d.id,...d.data()}));render()},e=>console.error(name,e));state.unsub.push(unsub);
  };
  make('books','books','title'); make('students','students','name'); make('loans','loans','borrowedAt');
  const sref=userDoc('meta','settings');
  state.unsub.push(onSnapshot(sref,snap=>{if(snap.exists())state.settings={teacherPin:'1234',collections:{...DEFAULT_COLLECTIONS},...snap.data(),collections:{...DEFAULT_COLLECTIONS,...(snap.data().collections||{})}};else setDoc(sref,state.settings).catch(console.error);render()}));
}

async function persist(kind,obj){
  if(state.mode==='local'){localSave();render();return}
  if(!state.user)throw new Error('Non connecté');
  const clean=JSON.parse(JSON.stringify(obj));
  if(kind==='settings'){await setDoc(userDoc('meta','settings'),clean,{merge:true});return}
  const name={book:'books',student:'students',loan:'loans'}[kind];
  await setDoc(userDoc(name,obj.id),clean,{merge:true});
}
async function remove(kind,id){
  if(state.mode==='local'){
    if(kind==='book')state.books=state.books.filter(x=>x.id!==id);
    if(kind==='student')state.students=state.students.filter(x=>x.id!==id);
    if(kind==='loan')state.loans=state.loans.filter(x=>x.id!==id);
    localSave();render();return;
  }
  const name={book:'books',student:'students',loan:'loans'}[kind];await deleteDoc(userDoc(name,id));
}

function topbar(){
  return `<div class="topbar">
    <div class="brand">
      <div class="logo">📚</div>
      <div>
        <h1>BiblioClasse</h1>
        <p>Chaque élève doit trouver un livre à sa pointure · v${APP_VERSION}</p>
      </div>
    </div>
    <div class="row">
      <span class="pill ${state.mode==='cloud'?'ok':'warn'}">
        ${state.mode==='cloud'?'☁️ Synchronisé':'💻 Local'}
      </span>
      ${state.screen==='teacher' && state.teacherUnlocked
        ? `<button class="btn btn-secondary" id="studentModeBtn">👦 Mode élève</button>
           <button class="btn btn-secondary" id="logoutBtn">Déconnexion</button>`
        : state.user
          ? `<button class="btn btn-secondary" id="teacherModeBtn">👩‍🏫 Mode enseignant</button>`
          : ''
      }
    </div>
  </div>`;
}

function bindTop(){
  const teacherBtn=$('#teacherModeBtn');
  if(teacherBtn){
    teacherBtn.onclick=()=>openTeacher();
  }

  const studentBtn=$('#studentModeBtn');
  if(studentBtn){
    studentBtn.onclick=()=>{
      state.teacherUnlocked=false;
      state.screen='student';
      render();
    };
  }

  const logoutBtn=$('#logoutBtn');
  if(logoutBtn){
    logoutBtn.onclick=async()=>{
      state.teacherUnlocked=false;
      state.screen='student';
      await signOut(state.auth);
    };
  }
}

function render(){
  if(!readFirebaseConfig()) return renderSetup(false);
  if(state.mode==='cloud' && !state.user) return renderLogin();

  if(state.screen==='teacher' && state.teacherUnlocked){
    return renderTeacher();
  }

  state.screen='student';
  state.teacherUnlocked=false;
  renderStudent();
}

function renderSetup(invalid=false,error=''){
  appEl.innerHTML=`<div class="app setup">${topbar()}<div class="card hero"><h2>⚙️ Première configuration</h2><p>Pour que les iPhone/iPad partagent la même bibliothèque, BiblioClasse doit être relié à ton projet Firebase gratuit.</p>${invalid?`<div class="danger-note">Configuration invalide : ${esc(error)}</div>`:''}<div class="field"><label>Configuration Firebase</label><textarea id="firebaseConfig" placeholder='Colle ici l’objet firebaseConfig fourni par Firebase, par exemple : {"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'></textarea></div><div class="row"><button class="btn" id="saveFirebaseBtn">Enregistrer et connecter</button><button class="btn btn-secondary" id="localModeBtn">Tester en mode local</button></div><p class="muted">Le mode local fonctionne sur cet ordinateur uniquement. Pour la classe et plusieurs appareils, choisis Firebase.</p></div></div>`;
  bindTop();
  $('#saveFirebaseBtn').onclick=()=>{try{let raw=$('#firebaseConfig').value.trim();const start=raw.indexOf('{'),end=raw.lastIndexOf('}');if(start>=0&&end>start)raw=raw.slice(start,end+1);let cfg;try{cfg=JSON.parse(raw)}catch{const normalized=raw.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g,'$1"$2":').replace(/'/g,'"');cfg=JSON.parse(normalized)}if(!cfg.apiKey||!cfg.projectId)throw new Error('apiKey/projectId manquants');storeFirebaseConfig(cfg);location.reload()}catch(e){alert('Impossible de lire la configuration Firebase.\n\n'+e.message)}};
  $('#localModeBtn').onclick=()=>{localStorage.setItem(CONFIG_KEY,JSON.stringify({localOnly:true}));location.reload()};
}

function renderLogin(){
  appEl.innerHTML=`<div class="app setup">${topbar()}<div class="card hero"><h2>🔐 Connexion de la classe</h2><p>Utilise le même compte enseignant sur chaque appareil. Les élèves n’auront pas à saisir ce mot de passe : l’appareil restera connecté.</p><div class="field"><label>Adresse e-mail</label><input id="authEmail" type="email" autocomplete="username"></div><div class="field"><label>Mot de passe</label><input id="authPassword" type="password" autocomplete="current-password"></div><div class="row"><button class="btn" id="loginBtn">Se connecter</button><button class="btn btn-secondary" id="signupBtn">Créer le compte enseignant</button></div><p class="muted">À faire une seule fois : créer le compte sur le premier appareil, puis se connecter avec le même compte sur les iPad.</p><button class="btn btn-ghost" id="resetConfigBtn">Changer la configuration Firebase</button></div></div>`;
  bindTop();
  const creds=()=>[$('#authEmail').value.trim(),$('#authPassword').value];
  $('#loginBtn').onclick=async()=>{try{const [e,p]=creds();await signInWithEmailAndPassword(state.auth,e,p)}catch(err){alert('Connexion impossible : '+friendlyAuthError(err))}};
  $('#signupBtn').onclick=async()=>{try{const [e,p]=creds();if(p.length<6)throw new Error('Le mot de passe doit contenir au moins 6 caractères.');await createUserWithEmailAndPassword(state.auth,e,p);toast('Compte créé')}catch(err){alert('Création impossible : '+friendlyAuthError(err))}};
  $('#resetConfigBtn').onclick=()=>{if(confirm('Reconfigurer Firebase ?'))clearFirebaseConfig()};
}
function friendlyAuthError(err){const c=err?.code||'';if(c.includes('invalid-credential'))return 'e-mail ou mot de passe incorrect.';if(c.includes('email-already-in-use'))return 'ce compte existe déjà.';if(c.includes('operation-not-allowed'))return 'active « E-mail/Mot de passe » dans Firebase Authentication.';return err.message||String(err)}

function renderHome(){
  appEl.innerHTML=`<div class="app">${topbar()}<div class="card hero"><div class="grid"><div class="tile" id="teacherTile"><strong>👨‍🏫 Mode enseignant</strong><span>Catalogue, scan rapide, élèves, cotation, sélections</span></div><div class="tile" id="studentTile"><strong>👦 Mode élève</strong><span>Emprunter, rendre, rechercher un livre actif</span></div></div></div><div class="grid"><div class="card"><div class="stat">${state.books.length}</div><div class="muted">livres/titres</div></div><div class="card"><div class="stat">${state.students.filter(s=>s.active!==false).length}</div><div class="muted">élèves actifs</div></div><div class="card"><div class="stat">${state.loans.filter(l=>!l.returnedAt).length}</div><div class="muted">prêts en cours</div></div></div></div>`;
  bindTop();$('#teacherTile').onclick=()=>openTeacher();$('#studentTile').onclick=()=>{state.screen='student';render()};
}
function openTeacher(){if(state.teacherUnlocked){state.screen='teacher';render();return}modal(`<div class="teacher-lock"><h2>👨‍🏫 Accès enseignant</h2><p>Saisis le code PIN enseignant.</p><div class="field"><input id="pinInput" inputmode="numeric" type="password" maxlength="8" autofocus></div><div class="row"><button class="btn" id="pinOk">Entrer</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div><p class="muted">Code initial : 1234. Tu pourras le changer dans Réglages.</p></div>`);$('#pinOk').onclick=()=>{if($('#pinInput').value===String(state.settings.teacherPin||'1234')){state.teacherUnlocked=true;state.screen='teacher';closeModal();render()}else alert('Code incorrect')}}

function teacherTabs(){
  const tabs=[
    ['library','📚 Bibliothèque'],
    ['search','🔎 Recherche rapide'],
    ['add','➕ Ajouter'],
    ['students','🧒 Élèves'],
    ['periods','🗓️ Sélections'],
    ['codes','🏷️ Cotation'],
    ['settings','⚙️ Réglages']
  ];

  return `<div class="tabs">
    ${tabs.map(([k,l])=>
      `<button class="btn ${state.teacherTab===k?'active':'btn-ghost'}" data-tab="${k}">${l}</button>`
    ).join('')}
  </div>`;
}
function renderTeacher(){
  appEl.innerHTML=`<div class="app">${topbar()}${teacherTabs()}<div id="teacherContent"></div></div>`;

  bindTop();

  document.querySelectorAll('[data-tab]').forEach(b=>{
    b.onclick=()=>{
      state.teacherTab=b.dataset.tab;
      renderTeacher();
    };
  });

  ({
    library:renderLibrary,
    search:renderQuickSearch,
    add:renderAdd,
    students:renderStudents,
    periods:renderPeriods,
    codes:renderCodes,
    settings:renderSettings
  }[state.teacherTab] || renderLibrary)();
}

function availability(book){const out=state.loans.filter(l=>l.bookId===book.id&&!l.returnedAt).length;const copies=Number(book.copies||1);return {out,copies,free:Math.max(0,copies-out)}}
function bookCard(b){const av=availability(b);return `<div class="book" data-book="${b.id}"><span class="badge">${esc(b.code||'à coter')}</span><div class="cover">${b.cover?`<img src="${esc(b.cover)}" alt="">`:'📕'}</div><h3>${esc(b.title||'Sans titre')}</h3><p>${esc(b.authors||'')}</p><div>${b.collection?`<span class="pill">${esc(b.collection)}</span>`:''}<span class="pill ${av.free?'ok':'warn'}">${av.free}/${av.copies} dispo</span>${b.status==='active'?'<span class="pill ok">En classe</span>':'<span class="pill gray">Réserve</span>'}</div></div>`}
function bindBookCards(){document.querySelectorAll('[data-book]').forEach(el=>el.onclick=()=>openBook(el.dataset.book))}
function renderLibrary(){
  const c=$('#teacherContent');c.innerHTML=`<div class="card"><div class="row between"><div><h2>📚 Bibliothèque</h2><p class="muted">Vue visuelle de tous les livres.</p></div><div class="row"><select id="libOwner"><option value="">Tous les propriétaires</option>${Object.entries(OWNERS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><select id="libStatus"><option value="">Tous les statuts</option><option value="active">En classe</option><option value="reserve">En réserve</option></select></div></div><div id="libraryBooks" class="books"></div></div>`;
  const refresh=()=>{const o=$('#libOwner').value,s=$('#libStatus').value;const books=state.books.filter(b=>(!o||b.owner===o)&&(!s||b.status===s));$('#libraryBooks').innerHTML=books.length?books.map(bookCard).join(''):'<p>Aucun livre.</p>';bindBookCards()};$('#libOwner').onchange=refresh;$('#libStatus').onchange=refresh;refresh();
}
function renderQuickSearch(){
  const c=$('#teacherContent');c.innerHTML=`<div class="card"><h2>🔎 Recherche rapide</h2><div class="searchbar"><input id="quickQ" placeholder="Titre, auteur, collection, thème, mot-clé, cote…" autofocus><select id="quickScope"><option value="all">Toute la bibliothèque</option><option value="active">Livres en classe</option><option value="reserve">Livres en réserve</option></select></div><div id="quickCount" class="muted"></div><div id="quickBooks" class="books"></div></div>`;
  const run=()=>{const q=norm($('#quickQ').value),scope=$('#quickScope').value;let books=state.books.filter(b=>scope==='all'||b.status===scope);if(q)books=books.filter(b=>norm([b.title,b.authors,b.collection,b.summary,(b.keywords||[]).join(' '),b.code,TYPES[b.type],OWNERS[b.owner]].join(' ')).includes(q));$('#quickCount').textContent=`${books.length} résultat(s)`;$('#quickBooks').innerHTML=books.map(bookCard).join('');bindBookCards()};$('#quickQ').oninput=run;$('#quickScope').onchange=run;run();
}

function renderAdd(){
  const c=$('#teacherContent');c.innerHTML=`<div class="card"><h2>➕ Ajouter des livres</h2><div class="grid"><div class="tile" id="scanOne"><strong>📕 Ajout détaillé</strong><span>Scanner un code-barres, vérifier la fiche, puis enregistrer.</span></div><div class="tile" id="scanMany"><strong>⚡ Inventaire rapide</strong><span>Scanner les codes-barres à la chaîne sans validation entre chaque livre.</span></div><div class="tile" id="manualAdd"><strong>✍️ Ajout manuel</strong><span>Pour un livre sans ISBN ou non trouvé.</span></div></div><div class="danger-note" style="margin-top:14px"><strong>Cotation :</strong> les nouveaux livres restent « à coter ». On attribue les cotes seulement après l’inventaire, pour bien regrouper les collections.</div></div>`;
  $('#scanOne').onclick=()=>startSingleAdd();$('#scanMany').onclick=()=>startMultiAdd();$('#manualAdd').onclick=()=>editBook({id:uid(),isbn:'',title:'',authors:'',publisher:'',collection:'',type:'',summary:'',cover:'',keywords:[],owner:'classe',status:'reserve',copies:1,code:''},true);
}

async function fetchBookByISBN(raw){
  const isbn=(raw||'').replace(/[^0-9Xx]/g,'');
  if(!isbn) throw new Error('ISBN vide');

  let data={
    isbn,
    title:'',
    authors:'',
    publisher:'',
    collection:'',
    type:'',
    summary:'',
    cover:'',
    keywords:[],
    subjects:[],
    owner:'classe',
    status:'reserve',
    copies:1,
    code:'',
    createdAt:nowIso()
  };

// 0) BnF - Catalogue général
try{
  const url =
    `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve` +
    `&query=bib.isbn%20all%20%22${isbn}%22` +
    `&recordSchema=dublincore&maximumRecords=1`;

  const r=await fetch(url);

  if(r.ok){
    const xmlText=await r.text();
    const xml=new DOMParser().parseFromString(xmlText,'application/xml');

    const getValues=(name)=>{
      return [...xml.getElementsByTagNameNS('*',name)]
        .map(el=>el.textContent?.trim())
        .filter(Boolean);
    };

    const titles=getValues('title');
    const creators=getValues('creator');
    const publishers=getValues('publisher');
    const subjects=getValues('subject');
    const descriptions=getValues('description');

    // TITRE : retirer "/ Auteur" ajouté par la BnF
    if(titles.length){
      let title=titles[0];

      if(title.includes(' / ')){
        title=title.split(' / ')[0];
      }

      data.title=data.title||title.trim();
    }

    // AUTEUR : transformer
    // "Baussier, Sylvie (1964-....). Auteur du texte"
    // en "Sylvie Baussier"
    if(creators.length){
      let author=creators[0];

      author=author
        .replace(/\([^)]*\)/g,'')
        .replace(/\.\s*Auteur du texte.*$/i,'')
        .replace(/\s+/g,' ')
        .trim();

      if(author.includes(',')){
        const parts=author.split(',').map(x=>x.trim());
        if(parts.length>=2){
          author=`${parts[1]} ${parts[0]}`;
        }
      }

      data.authors=data.authors||author;
    }

    // ÉDITEUR
    if(publishers.length){
      data.publisher=data.publisher||publishers[0];
    }

    // SUJETS BnF
    if(subjects.length){
      data.subjects.push(...subjects);
    }

    // RÉSUMÉ :
    // ignorer les informations techniques du type EAN / code-barres
    const usefulDescriptions=descriptions.filter(d=>{
      const t=d.toLowerCase();

      return !t.includes('code à barres') &&
             !t.includes('ean') &&
             !t.includes('isbn') &&
             d.length>80;
    });

    if(usefulDescriptions.length){
      data.summary=data.summary||usefulDescriptions[0];
    }
  }
}catch(e){
  console.warn('BnF:',e);
}
 // 0b) Sudoc - catalogue universitaire français
try{
  const url =
    `https://www.sudoc.abes.fr/cbs/sru/?operation=searchRetrieve` +
    `&version=1.1` +
    `&recordSchema=unimarc` +
    `&maximumRecords=1` +
    `&query=isb%3D${encodeURIComponent(isbn)}`;

  const r=await fetch(url);

  if(r.ok){
    const xmlText=await r.text();
    const xml=new DOMParser().parseFromString(xmlText,'application/xml');

    // Récupère les sous-zones UNIMARC
    const subfields=[...xml.getElementsByTagNameNS('*','subfield')];

    const values=(code)=>{
      return subfields
        .filter(el=>el.getAttribute('code')===code)
        .map(el=>el.textContent?.trim())
        .filter(Boolean);
    };

    // Sujets / matières :
    // on les conserve pour la future génération des mots-clés
    const allText=subfields
      .map(el=>el.textContent?.trim())
      .filter(Boolean);

    const interesting=allText.filter(t=>{
      const n=norm(t);

      return (
        n.includes('mytholog') ||
        n.includes('grec') ||
        n.includes('cyclop') ||
        n.includes('ulysse') ||
        n.includes('jeunesse') ||
        n.includes('roman') ||
        n.includes('conte')
      );
    });

    if(interesting.length){
      data.subjects.push(...interesting);
    }
  }
}catch(e){
  console.warn('Sudoc:',e);
}
  // 1) Google Books
  try{
    const r=await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    if(r.ok){
      const j=await r.json();
      const v=j.items?.[0]?.volumeInfo;

      if(v){
        data.title=v.title||data.title;
        data.authors=(v.authors||[]).join(', ')||data.authors;
        data.publisher=v.publisher||data.publisher;
        data.summary=v.description||data.summary;
        data.cover=
          v.imageLinks?.thumbnail ||
          v.imageLinks?.smallThumbnail ||
          data.cover;

        if(Array.isArray(v.categories)){
          data.subjects.push(...v.categories);
        }
      }
    }
  }catch(e){
    console.warn('Google Books:',e);
  }

  // 2) Open Library
  try{
    const r=await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    if(r.ok){
      const j=await r.json();

      data.title=data.title||j.title||'';
      data.publisher=data.publisher||(j.publishers?.[0]||'');

      if(!data.summary){
        if(typeof j.description==='string'){
          data.summary=j.description;
        }else if(j.description?.value){
          data.summary=j.description.value;
        }
      }

      if(!data.cover && j.covers?.[0]){
        data.cover=`https://covers.openlibrary.org/b/id/${j.covers[0]}-L.jpg`;
      }

      if(Array.isArray(j.subjects)){
        data.subjects.push(...j.subjects);
      }
    }
  }catch(e){
    console.warn('Open Library:',e);
  }

  // Nettoyage des sujets
  data.subjects=[
    ...new Set(
      data.subjects
        .filter(Boolean)
        .map(s=>String(s).trim())
        .filter(Boolean)
    )
  ];

  // Détection automatique
  data.collection=data.collection||detectCollection(data.title);
  data.type=data.type||guessType(data.subjects,data.title);

  // Mots-clés automatiques
  data.keywords=suggestKeywords({
    ...data,
    subjects:data.subjects
  });

  return data;
}
function detectCollection(s){const t=norm(s);if(t.includes('max et lili'))return 'Max et Lili';if(t.includes('cabane magique'))return 'La Cabane magique';if(t.includes('anatole bristol'))return 'Les Enquêtes d’Anatole Bristol';if(t.includes('je suis en ce2'))return 'Je suis en CE2';return ''}
function guessType(categories,title){const t=norm((categories||[]).join(' ')+' '+title);if(t.includes('comic')||t.includes('bande dessinee')||t.includes('manga'))return 'BD';if(t.includes('document')||t.includes('science')||t.includes('nature')||t.includes('history')||t.includes('histoire vraie'))return 'D';if(t.includes('poes'))return 'P';if(t.includes('theatre'))return 'T';if(t.includes('conte')||t.includes('legende'))return 'C';if(t.includes('roman')||t.includes('fiction'))return 'R';return ''}
const THEME_WORDS={
  amitié:['amitie','ami','copain','copine','ensemble'], école:['ecole','classe','maitre','maitresse','rentree'], émotions:['emotion','peur','joie','colere','tristesse','jalousie'],
  nature:['nature','foret','arbre','jardin','plante'], animaux:['animal','loup','renard','ours','chat','chien','cheval','oiseau','insecte'], sport:['sport','football','rugby','natation','course','basket','tennis'],
  mythologie:['mythologie','meduse','zeus','ulysse','persee','dieu grec','grece antique'], aventure:['aventure','explore','voyage','mystere','enquete'],
  harcèlement:['harcelement','moquerie','intimidation'], écologie:['ecologie','planete','environnement','biodiversite','recyclage'], noël:['noel','pere noel','sapin','lutin'], halloween:['halloween','sorciere','fantome','monstre'], hiver:['hiver','neige','froid']
};
function suggestKeywords(b){const text=norm([b.title,b.summary,b.collection].join(' '));const out=[];for(const [theme,words] of Object.entries(THEME_WORDS))if(words.some(w=>text.includes(norm(w))))out.push(theme);return [...new Set(out)].slice(0,20)}

async function startSingleAdd(){
  openScanner('Scanner le code-barres','Ajout détaillé',async code=>{await stopScanner();try{toast('Recherche du livre…');const found=await fetchBookByISBN(code);const existing=state.books.find(b=>b.isbn===found.isbn);if(existing){modal(`<h2>Exemplaire déjà catalogué</h2><p><strong>${esc(existing.title)}</strong></p><p>Il y a actuellement ${existing.copies||1} exemplaire(s).</p><div class="row"><button class="btn" id="addCopyBtn">Ajouter un exemplaire</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`);$('#addCopyBtn').onclick=async()=>{existing.copies=Number(existing.copies||1)+1;await persist('book',existing);closeModal();toast('Exemplaire ajouté')};return}editBook({...found,id:uid()},true)}catch(e){alert('Livre non trouvé automatiquement. Tu peux le saisir manuellement.');editBook({id:uid(),isbn:code,title:'',authors:'',publisher:'',collection:'',type:'',summary:'',cover:'',keywords:[],owner:'classe',status:'reserve',copies:1,code:''},true)}})
}
async function startMultiAdd(){
  const logs=[];openScanner('Inventaire rapide','Enchaîne les codes-barres. Aucun bouton à valider entre deux livres.',async code=>{
    const now=Date.now();if(state.scanBusy)return;if(state.lastScan.code===code&&now-state.lastScan.at<1800)return;state.lastScan={code,at:now};state.scanBusy=true;
    try{
      const existing=state.books.find(b=>b.isbn===code);
      if(existing){existing.copies=Number(existing.copies||1)+1;await persist('book',existing);logs.unshift({kind:'ok',text:`${code} — ${existing.title} — exemplaire n°${existing.copies}`});beep(true)}
      else{const found=await fetchBookByISBN(code);if(!found.title){logs.unshift({kind:'bad',text:`${code} — non trouvé, à compléter`});const b={...found,id:uid(),needsReview:true};state.books.push(b);await persist('book',b);beep(false)}else{const b={...found,id:uid(),needsReview:false};state.books.push(b);await persist('book',b);logs.unshift({kind:'ok',text:`${code} — ${found.title}`});beep(true)}}
    }catch(e){logs.unshift({kind:'bad',text:`${code} — erreur : ${e.message}`});beep(false)}finally{state.scanBusy=false;renderScanLog(logs)}
  },true);renderScanLog(logs);
}
function beep(ok=true){try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=ok?880:220;g.gain.value=.04;o.start();setTimeout(()=>{o.stop();ctx.close()},100)}catch{}}

async function openScanner(title,subtitle,handler,multi=false){
  state.scanHandler=handler;state.scanMode=multi?'multi':'single';$('#scannerTitle').textContent=title;$('#scannerSubtitle').textContent=subtitle||'';$('#scannerOverlay').classList.remove('hidden');$('#scannerOverlay').setAttribute('aria-hidden','false');$('#scanLog').innerHTML='';
  $('#closeScannerBtn').onclick=()=>stopScanner();$('#manualScanBtn').onclick=()=>{const v=$('#manualScanInput').value.trim();if(v){$('#manualScanInput').value='';handler(v)}};$('#manualScanInput').onkeydown=e=>{if(e.key==='Enter')$('#manualScanBtn').click()};
  try{
    state.scanner=new Html5Qrcode('reader');
    const cameras=await Html5Qrcode.getCameras();
    const preferred=cameras.find(c=>/back|rear|environment|arrière/i.test(c.label))?.id||cameras[cameras.length-1]?.id;
    await state.scanner.start(preferred||{facingMode:'environment'},{fps:10,qrbox:{width:Math.min(320,window.innerWidth-60),height:130},formatsToSupport:[Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8]},decoded=>handler(decoded),()=>{});
  }catch(e){console.error(e);$('#reader').innerHTML=`<div class="danger-note">Caméra indisponible. Vérifie l’autorisation de la caméra ou utilise la saisie manuelle.<br><span class="small">${esc(e.message||e)}</span></div>`}
}
function renderScanLog(logs){const el=$('#scanLog');if(!el)return;el.innerHTML=logs.slice(0,30).map(x=>`<div class="scan-item ${x.kind}">${esc(x.text)}</div>`).join('')}
async function stopScanner(){try{if(state.scanner){await state.scanner.stop().catch(()=>{});await state.scanner.clear().catch(()=>{})}}catch{}state.scanner=null;$('#scannerOverlay').classList.add('hidden');$('#scannerOverlay').setAttribute('aria-hidden','true');$('#reader').innerHTML=''}

function editBook(book,isNew=false){
  modal(`<h2>${isNew?'Ajouter':'Modifier'} un livre</h2><div class="grid"><div><div class="field"><label>ISBN</label><input id="b_isbn" value="${esc(book.isbn||'')}"></div><div class="field"><label>Titre</label><input id="b_title" value="${esc(book.title||'')}"></div><div class="field"><label>Auteur</label><input id="b_authors" value="${esc(book.authors||'')}"></div><div class="field"><label>Collection</label><input id="b_collection" value="${esc(book.collection||'')}"></div><div class="field"><label>Type</label><select id="b_type"><option value="">À définir</option>${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${book.type===k?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Propriétaire</label><select id="b_owner">${Object.entries(OWNERS).map(([k,v])=>`<option value="${k}" ${book.owner===k?'selected':''}>${v}</option>`).join('')}</select></div></div><div><div class="field"><label>URL couverture</label><input id="b_cover" value="${esc(book.cover||'')}"></div><div class="field"><label>Résumé</label><textarea id="b_summary">${esc(book.summary||'')}</textarea></div><div class="field"><label>Mots-clés (séparés par des virgules)</label><input id="b_keywords" value="${esc((book.keywords||[]).join(', '))}"></div><div class="field"><label>Nombre d’exemplaires</label><input id="b_copies" type="number" min="1" value="${Number(book.copies||1)}"></div><div class="field"><label>Emplacement physique</label><input id="b_location" value="${esc(book.location||'')}" placeholder="Placard A, étagère 2…"></div></div></div><div class="row"><button class="btn" id="saveBookBtn">Enregistrer</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button>${!isNew?'<button class="btn btn-bad" id="deleteBookBtn">Supprimer</button>':''}</div>`);
  $('#saveBookBtn').onclick=async()=>{const obj={...book,isbn:$('#b_isbn').value.trim(),title:$('#b_title').value.trim(),authors:$('#b_authors').value.trim(),collection:$('#b_collection').value.trim(),type:$('#b_type').value,owner:$('#b_owner').value,cover:$('#b_cover').value.trim(),summary:$('#b_summary').value.trim(),keywords:$('#b_keywords').value.split(',').map(x=>x.trim()).filter(Boolean),copies:Math.max(1,Number($('#b_copies').value||1)),location:$('#b_location').value.trim(),status:book.status||'reserve',code:book.code||'',updatedAt:nowIso()};if(!obj.title&&!obj.isbn){alert('Ajoute au moins un titre ou un ISBN.');return}if(isNew){state.books.push(obj)}else Object.assign(book,obj);await persist('book',obj);closeModal();toast('Livre enregistré')};
  if(!isNew)$('#deleteBookBtn').onclick=async()=>{if(confirm('Supprimer ce livre du catalogue ?')){await remove('book',book.id);closeModal()}};
}
function openBook(id){const b=state.books.find(x=>x.id===id);if(!b)return;const av=availability(b);modal(`<div class="grid"><div class="cover" style="max-width:260px;margin:auto">${b.cover?`<img src="${esc(b.cover)}">`:'📕'}</div><div><h2>${esc(b.title)}</h2><p><strong>${esc(b.authors||'')}</strong></p><p>${b.code?`<span class="pill">${esc(b.code)}</span>`:'<span class="pill warn">À coter</span>'}${b.collection?`<span class="pill">${esc(b.collection)}</span>`:''}<span class="pill ${av.free?'ok':'warn'}">${av.free}/${av.copies} disponible(s)</span></p><p>${esc(b.summary||'')}</p><p>${(b.keywords||[]).map(k=>`<span class="pill">${esc(k)}</span>`).join('')}</p><p class="muted">${esc(OWNERS[b.owner]||'')} ${b.location?'· '+esc(b.location):''}</p><div class="row"><button class="btn" id="editBookBtn">Modifier</button><button class="btn btn-secondary" id="toggleStatusBtn">${b.status==='active'?'Mettre en réserve':'Mettre en classe'}</button><button class="btn btn-secondary" onclick="closeModal()">Fermer</button></div></div></div>`);$('#editBookBtn').onclick=()=>{closeModal();editBook(b,false)};$('#toggleStatusBtn').onclick=async()=>{b.status=b.status==='active'?'reserve':'active';await persist('book',b);closeModal();toast(b.status==='active'?'Livre mis en classe':'Livre mis en réserve')};}

function renderStudents(){
  const c=$('#teacherContent');
  const active=state.students.filter(s=>s.active!==false);
  const archived=state.students.filter(s=>s.active===false);

  c.innerHTML=`<div class="card">
    <div class="row between">
      <div>
        <h2>👦 Élèves</h2>
        <p class="muted">La liste peut être renouvelée chaque année sans supprimer l’historique.</p>
      </div>
      <div class="row">
        <label class="btn btn-secondary">
          📥 Importer une classe
          <input id="classImportInput" class="hidden" type="file" accept=".csv,text/csv">
        </label>
        <button class="btn" id="addStudentBtn">Ajouter un élève</button>
      </div>
    </div>

    <p class="muted">Import CSV depuis Excel : colonnes Prénom, Nom et Date de naissance. Le nom et la date restent côté enseignant.</p>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Élève</th><th>Prêts en cours</th><th>Historique</th><th></th></tr>
        </thead>
        <tbody>${active.map(s=>studentRow(s)).join('')}</tbody>
      </table>
    </div>

    ${archived.length?`<h3>Archivés</h3><div class="muted">${archived.map(s=>esc(s.name)).join(', ')}</div>`:''}
  </div>`;

  $('#addStudentBtn').onclick=()=>editStudent({id:uid(),name:'',active:true,interests:[],appetite:''},true);

  $('#classImportInput').onchange=async e=>{
    const f=e.target.files?.[0];
    if(!f)return;
    try{
      await importStudentsCsv(f);
    }catch(err){
      alert('Import impossible : '+err.message);
    }finally{
      e.target.value='';
    }
  };

  document.querySelectorAll('[data-student-edit]').forEach(
    b=>b.onclick=()=>editStudent(state.students.find(s=>s.id===b.dataset.studentEdit),false)
  );
}

function parseCsvLine(line,separator){
  const out=[];
  let value='',quoted=false;

  for(let i=0;i<line.length;i++){
    const ch=line[i];

    if(ch==='"'){
      if(quoted && line[i+1]==='"'){
        value+='"';
        i++;
      }else{
        quoted=!quoted;
      }
    }else if(ch===separator && !quoted){
      out.push(value.trim());
      value='';
    }else{
      value+=ch;
    }
  }

  out.push(value.trim());
  return out;
}

async function importStudentsCsv(file){
  const text=(await file.text()).replace(/^\uFEFF/,'');
  const lines=text.split(/\r?\n/).filter(x=>x.trim());

  if(lines.length<2)throw new Error('Le fichier ne contient pas de liste d’élèves.');

  const first=lines[0];
  const separators=[';',',','\t'];
  const separator=separators
    .map(s=>[s,(first.split(s).length-1)])
    .sort((a,b)=>b[1]-a[1])[0][0];

  const headers=parseCsvLine(first,separator).map(h=>slug(h));

  let firstNameIndex=headers.findIndex(h=>['prenom','firstname','first_name'].includes(h));
  const lastNameIndex=headers.findIndex(h=>['nom','lastname','last_name','nom_de_famille'].includes(h));
  const birthIndex=headers.findIndex(h=>['date_de_naissance','datenaissance','naissance','birthdate','date_of_birth'].includes(h));

  if(firstNameIndex<0)firstNameIndex=0;

  const imported=[];
  let skipped=0;

  for(const line of lines.slice(1)){
    const cols=parseCsvLine(line,separator);
    const firstName=(cols[firstNameIndex]||'').trim();
    if(!firstName)continue;

    const lastName=lastNameIndex>=0?(cols[lastNameIndex]||'').trim():'';
    const birthDate=birthIndex>=0?(cols[birthIndex]||'').trim():'';

    const duplicate=state.students.some(s=>
      norm(s.firstName||s.name)===norm(firstName) &&
      norm(s.lastName||'')===norm(lastName) &&
      String(s.birthDate||'')===birthDate
    );

    if(duplicate){
      skipped++;
      continue;
    }

    imported.push({
      id:uid(),
      name:firstName,
      firstName,
      lastName,
      birthDate,
      active:true,
      interests:[],
      appetite:'',
      updatedAt:nowIso()
    });
  }

  if(!imported.length){
    alert(skipped
      ? 'Tous les élèves du fichier sont déjà présents.'
      : 'Aucun élève valide trouvé dans le fichier.');
    return;
  }

  if(!confirm(`Importer ${imported.length} élève(s) ?${skipped?`\n${skipped} doublon(s) ignoré(s).`:''}`))return;

  state.students.push(...imported);

  if(state.mode==='local'){
    localSave();
    renderStudents();
  }else{
    const batch=writeBatch(state.fs);
    imported.forEach(s=>batch.set(userDoc('students',s.id),s));
    await batch.commit();
  }

  toast(`${imported.length} élève(s) importé(s)`);
}

function studentRow(s){
  const cur=state.loans.filter(l=>l.studentId===s.id&&!l.returnedAt).length;
  const hist=state.loans.filter(l=>l.studentId===s.id).length;
  const displayName=[s.firstName||s.name,s.lastName||''].filter(Boolean).join(' ');

  return `<tr>
    <td><strong>${esc(displayName)}</strong>${s.birthDate?`<div class="small muted">${esc(s.birthDate)}</div>`:''}</td>
    <td>${cur}</td>
    <td>${hist}</td>
    <td><button class="btn btn-secondary" data-student-edit="${s.id}">Modifier</button></td>
  </tr>`;
}
function editStudent(s,isNew=false){modal(`<h2>${isNew?'Ajouter':'Modifier'} un élève</h2><div class="field"><label>Prénom</label><input id="s_name" value="${esc(s.name||'')}"></div><div class="field"><label>Centres d’intérêt (optionnel, séparés par des virgules)</label><input id="s_interests" value="${esc((s.interests||[]).join(', '))}" placeholder="animaux, sport, mystère…"></div><div class="field"><label>Appétit de lecture</label><select id="s_appetite"><option value="">Non renseigné</option><option ${s.appetite==='grignote'?'selected':''} value="grignote">🐭 Je grignote</option><option ${s.appetite==='regulier'?'selected':''} value="regulier">🐰 J’aime bien lire</option><option ${s.appetite==='faim'?'selected':''} value="faim">🐺 J’ai faim de livres</option><option ${s.appetite==='ogre'?'selected':''} value="ogre">🦖 Ogre de lecture</option></select></div>${!isNew?`<div class="field"><label>Statut</label><select id="s_active"><option value="true" ${s.active!==false?'selected':''}>Élève actuel</option><option value="false" ${s.active===false?'selected':''}>Archivé</option></select></div>`:''}<div class="row"><button class="btn" id="saveStudentBtn">Enregistrer</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`);$('#saveStudentBtn').onclick=async()=>{const obj={...s,name:$('#s_name').value.trim(),interests:$('#s_interests').value.split(',').map(x=>x.trim()).filter(Boolean),appetite:$('#s_appetite').value,active:isNew?true:$('#s_active').value==='true',updatedAt:nowIso()};if(!obj.name)return alert('Prénom obligatoire');if(isNew)state.students.push(obj);else Object.assign(s,obj);await persist('student',obj);closeModal();toast('Élève enregistré')};}

function renderPeriods(){
  const c=$('#teacherContent');c.innerHTML=`<div class="card"><h2>📅 Sélections / périodes</h2><p>Crée une sélection temporaire à partir de thèmes. Les livres choisis passent « en classe » ; les autres restent en réserve.</p><div class="grid"><div><div class="field"><label>Nom de la sélection</label><input id="periodName" placeholder="Période 2 - Halloween / Noël"></div><div class="field"><label>Thèmes recherchés</label><input id="periodKeywords" placeholder="halloween, sorcière, noël, neige"></div><button class="btn" id="previewPeriodBtn">Proposer des livres</button></div><div><h3>État actuel</h3><p><span class="pill ok">${state.books.filter(b=>b.status==='active').length} en classe</span><span class="pill gray">${state.books.filter(b=>b.status!=='active').length} en réserve</span></p><button class="btn btn-secondary" id="allReserveBtn">Tout remettre en réserve</button></div></div><div id="periodPreview"></div></div>`;
  $('#previewPeriodBtn').onclick=()=>{const kws=$('#periodKeywords').value.split(',').map(norm).filter(Boolean);const books=state.books.filter(b=>kws.some(k=>norm([b.title,b.summary,b.collection,(b.keywords||[]).join(' ')].join(' ')).includes(k)));$('#periodPreview').innerHTML=`<h3>${books.length} livre(s) proposé(s)</h3><div class="books">${books.map(bookCard).join('')}</div><button class="btn" id="activateSelectionBtn">Activer ces ${books.length} livres</button>`;bindBookCards();$('#activateSelectionBtn').onclick=async()=>{if(!confirm(`Mettre ${books.length} livres en classe et les autres en réserve ?`))return;await bulkSetStatus(new Set(books.map(b=>b.id)));toast('Sélection activée')}};
  $('#allReserveBtn').onclick=async()=>{if(confirm('Mettre tous les livres en réserve ?')){await bulkSetStatus(new Set());toast('Tous les livres sont en réserve')}};
}
async function bulkSetStatus(activeIds){
  state.books.forEach(b=>b.status=activeIds.has(b.id)?'active':'reserve');
  if(state.mode==='local'){localSave();render();return}
  const batch=writeBatch(state.fs);state.books.forEach(b=>batch.set(userDoc('books',b.id),{status:b.status},{merge:true}));await batch.commit();
}

function renderCodes(){
  const c=$('#teacherContent');const groups={};state.books.forEach(b=>{const key=b.collection||`__TYPE__${b.type||'X'}`;(groups[key]=groups[key]||[]).push(b)});const uncoded=state.books.filter(b=>!b.code).length;
  c.innerHTML=`<div class="card"><h2>🏷️ Cotation</h2><p><strong>${uncoded}</strong> livre(s) restent à coter. Règle : collection → initiales de collection ; livre isolé → catégorie. Exemples : <strong>ML-001</strong>, <strong>CAB-001</strong>, <strong>D-001</strong>.</p><div class="danger-note">La cotation est volontairement faite après l’inventaire. Vérifie d’abord les collections détectées.</div><h3>Préfixes proposés</h3><div class="table-wrap"><table class="table"><thead><tr><th>Groupe</th><th>Livres</th><th>Préfixe</th></tr></thead><tbody>${Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([g,arr])=>{const isType=g.startsWith('__TYPE__');const label=isType?(TYPES[g.replace('__TYPE__','')]||'À classer'):g;const pref=isType?g.replace('__TYPE__',''):(state.settings.collections[g]||suggestCollectionCode(g));return `<tr><td>${esc(label)}</td><td>${arr.length}</td><td><input style="max-width:110px" data-prefix-group="${esc(g)}" value="${esc(pref)}"></td></tr>`}).join('')}</tbody></table></div><div class="row"><button class="btn" id="savePrefixesBtn">Enregistrer les préfixes</button><button class="btn btn-ok" id="assignCodesBtn">Attribuer les cotes manquantes</button></div></div>`;
  $('#savePrefixesBtn').onclick=async()=>{document.querySelectorAll('[data-prefix-group]').forEach(i=>{const g=i.dataset.prefixGroup;if(!g.startsWith('__TYPE__'))state.settings.collections[g]=i.value.trim().toUpperCase()});await persist('settings',state.settings);toast('Préfixes enregistrés')};
  $('#assignCodesBtn').onclick=async()=>{if(state.books.some(b=>!b.type&&!b.collection)&&!confirm('Certains livres n’ont ni type ni collection. Ils recevront une cote X-xxx. Continuer ?'))return;document.querySelectorAll('[data-prefix-group]').forEach(i=>{const g=i.dataset.prefixGroup;if(!g.startsWith('__TYPE__'))state.settings.collections[g]=i.value.trim().toUpperCase()});await persist('settings',state.settings);const counters={};state.books.filter(b=>b.code).forEach(b=>{const m=(b.code||'').match(/^(.+)-(\d+)$/);if(m)counters[m[1]]=Math.max(counters[m[1]]||0,Number(m[2]))});const updates=[];state.books.filter(b=>!b.code).sort((a,b)=>`${a.collection||a.type||'X'} ${a.title}`.localeCompare(`${b.collection||b.type||'X'} ${b.title}`,'fr')).forEach(b=>{const prefix=b.collection?(state.settings.collections[b.collection]||suggestCollectionCode(b.collection)):(b.type||'X');counters[prefix]=(counters[prefix]||0)+1;b.code=`${prefix}-${String(counters[prefix]).padStart(3,'0')}`;updates.push(b)});if(state.mode==='local'){localSave();render();toast(`${updates.length} cote(s) attribuée(s)`)}else{const batch=writeBatch(state.fs);updates.forEach(b=>batch.set(userDoc('books',b.id),{code:b.code},{merge:true}));await batch.commit();toast(`${updates.length} cote(s) attribuée(s)`)}};
}
function suggestCollectionCode(c){return norm(c).split(/\s+/).filter(w=>!['la','le','les','de','des','du','et','en','d'].includes(w)).map(w=>w[0]).join('').slice(0,3).toUpperCase()||'COL'}

function renderSettings(){
  const c=$('#teacherContent');c.innerHTML=`<div class="card"><h2>⚙️ Réglages</h2><div class="grid"><div><h3>Code enseignant</h3><div class="field"><label>Nouveau PIN</label><input id="teacherPin" inputmode="numeric" value="${esc(state.settings.teacherPin||'1234')}"></div><button class="btn" id="savePinBtn">Enregistrer</button></div><div><h3>Sauvegarde</h3><p class="muted">L’export JSON reste utile même avec Firebase : tu gardes une copie indépendante.</p><div class="row"><button class="btn btn-secondary" id="exportBtn">Exporter</button><label class="btn btn-secondary">Importer<input id="importInput" class="hidden" type="file" accept="application/json"></label></div></div><div><h3>Connexion</h3><p class="muted">${state.mode==='cloud'?'Données synchronisées avec Firebase.':'Mode local uniquement.'}</p>${state.mode==='cloud'?'<button class="btn btn-ghost" id="firebaseResetBtn">Changer de projet Firebase</button>':''}</div></div></div>`;
  $('#savePinBtn').onclick=async()=>{state.settings.teacherPin=$('#teacherPin').value.trim()||'1234';await persist('settings',state.settings);toast('PIN enregistré')};$('#exportBtn').onclick=exportData;$('#importInput').onchange=importData;const r=$('#firebaseResetBtn');if(r)r.onclick=()=>{if(confirm('Changer la configuration Firebase ?'))clearFirebaseConfig()};
}
function exportData(){const d={version:APP_VERSION,exportedAt:nowIso(),books:state.books,students:state.students,loans:state.loans,settings:state.settings};const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`biblioclasse-sauvegarde-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
async function importData(e){const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!confirm(`Importer ${d.books?.length||0} livres et ${d.students?.length||0} élèves ?`))return;if(state.mode==='local'){state.books=d.books||[];state.students=d.students||[];state.loans=d.loans||[];state.settings=d.settings||state.settings;localSave();render();return}const batch=writeBatch(state.fs);(d.books||[]).forEach(x=>batch.set(userDoc('books',x.id||uid()),x));(d.students||[]).forEach(x=>batch.set(userDoc('students',x.id||uid()),x));(d.loans||[]).forEach(x=>batch.set(userDoc('loans',x.id||uid()),x));batch.set(userDoc('meta','settings'),d.settings||state.settings,{merge:true});await batch.commit();toast('Import terminé')}catch(err){alert('Import impossible : '+err.message)}}

function renderStudent(){
  appEl.innerHTML=`<div class="app">${topbar()}<div class="card hero"><div class="row between"><div><h2>👦 Espace élèves</h2><p class="muted">Simple et rapide : prénom → scan → terminé.</p></div></div><div class="grid"><div class="tile" id="borrowTile"><strong>📚 J’emprunte</strong><span>Choisir mon prénom puis scanner le code-barres.</span></div><div class="tile" id="returnTile"><strong>📖 Je rends</strong><span>Choisir mon prénom puis scanner le code-barres.</span></div><div class="tile" id="studentSearchTile"><strong>🔍 Je cherche un livre</strong><span>Voir seulement les livres actuellement mis en classe.</span></div><div class="tile" id="profileTile"><strong>✨ Mon profil lecteur</strong><span>Mes goûts et mon appétit de lecture.</span></div></div></div></div>`;bindTop();$('#borrowTile').onclick=()=>chooseStudentFor('borrow');$('#returnTile').onclick=()=>chooseStudentFor('return');$('#studentSearchTile').onclick=studentSearch;$('#profileTile').onclick=()=>chooseStudentFor('profile');
}
function chooseStudentFor(action){const students=state.students.filter(s=>s.active!==false);if(!students.length)return alert('Aucun élève actif.');modal(`<h2>${action==='borrow'?'J’emprunte':action==='return'?'Je rends':'Mon profil lecteur'}</h2><p>Choisis ton prénom.</p><div class="student-list">${students.map(s=>`<button class="student-btn" data-pick-student="${s.id}">${esc(s.name)}</button>`).join('')}</div><div style="margin-top:12px"><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`);document.querySelectorAll('[data-pick-student]').forEach(b=>b.onclick=()=>{const id=b.dataset.pickStudent;closeModal();if(action==='profile')return editStudentProfile(id);startLoanScan(action,id)})}
async function startLoanScan(action,studentId){openScanner(action==='borrow'?'📚 Scanner le livre à emprunter':'📖 Scanner le livre rendu','Le code-barres ISBN au dos du livre.',async code=>{if(state.scanBusy)return;state.scanBusy=true;try{const b=state.books.find(x=>x.isbn===code||x.code===code);if(!b){beep(false);return alert('Ce livre n’est pas encore dans BiblioClasse.')}if(action==='borrow'){const av=availability(b);if(av.free<1){beep(false);return alert('Aucun exemplaire disponible.')}const loan={id:uid(),bookId:b.id,studentId,borrowedAt:nowIso(),returnedAt:null};state.loans.push(loan);await persist('loan',loan);beep(true);await stopScanner();successAndReturn('Bonne lecture !')}else{const loan=state.loans.find(l=>l.studentId===studentId&&l.bookId===b.id&&!l.returnedAt);if(!loan){beep(false);return alert('Ce livre n’est pas emprunté par cet élève.')}loan.returnedAt=nowIso();await persist('loan',loan);beep(true);await stopScanner();successAndReturn('Merci, livre rendu !')}}finally{state.scanBusy=false}})}
function successAndReturn(msg){modal(`<div class="success-screen">✅<br>${esc(msg)}</div>`);setTimeout(()=>{closeModal();renderStudent()},1500)}
function studentSearch(){const books=state.books.filter(b=>b.status==='active'&&availability(b).free>0);modal(`<h2>🔍 Livres disponibles en classe</h2><div class="field"><input id="studentSearchQ" placeholder="animaux, aventure, Max et Lili…"></div><div id="studentSearchBooks" class="books"></div><button class="btn btn-secondary" onclick="closeModal()">Fermer</button>`);const run=()=>{const q=norm($('#studentSearchQ').value);const r=books.filter(b=>!q||norm([b.title,b.authors,b.collection,b.summary,(b.keywords||[]).join(' ')].join(' ')).includes(q));$('#studentSearchBooks').innerHTML=r.map(bookCard).join('')};$('#studentSearchQ').oninput=run;run()}
function editStudentProfile(studentId){const s=state.students.find(x=>x.id===studentId);if(!s)return;modal(`<h2>✨ Mon profil lecteur — ${esc(s.name)}</h2><p>Mes centres d’intérêt peuvent changer pendant l’année.</p><div class="field"><label>Ce que j’aime</label><input id="profileInterests" value="${esc((s.interests||[]).join(', '))}" placeholder="animaux, sport, humour, enquêtes…"></div><div class="field"><label>Mon appétit de lecture</label><select id="profileAppetite"><option value="">Je ne sais pas encore</option><option value="grignote" ${s.appetite==='grignote'?'selected':''}>🐭 Je grignote de temps en temps</option><option value="regulier" ${s.appetite==='regulier'?'selected':''}>🐰 J’aime bien lire</option><option value="faim" ${s.appetite==='faim'?'selected':''}>🐺 J’ai souvent faim de livres</option><option value="ogre" ${s.appetite==='ogre'?'selected':''}>🦖 Je suis un ogre de lecture</option></select></div><div class="row"><button class="btn" id="saveProfileBtn">Enregistrer</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`);$('#saveProfileBtn').onclick=async()=>{s.interests=$('#profileInterests').value.split(',').map(x=>x.trim()).filter(Boolean);s.appetite=$('#profileAppetite').value;await persist('student',s);closeModal();toast('Profil enregistré')}}

async function boot(){
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
  const cfg=readFirebaseConfig();
  if(cfg?.localOnly){state.mode='local';loadLocalIntoState();render();return}
  if(cfg){await initFirebase(cfg);render();return}
  renderSetup(false);
}
boot();
