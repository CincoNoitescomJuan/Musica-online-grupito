const CONFIG=window.ROLEPLAY_MUSIC_CONFIG||{};
const sb=window.supabase;
const $=id=>document.getElementById(id);
const audio=$('audio-player');
let db=null,session=null,profile=null,songs=[],currentIndex=-1;

function toast(message,error=false){
 const el=$('toast');el.textContent=message;el.classList.remove('hidden','error');if(error)el.classList.add('error');
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),4500);
}
function showView(name){
 ['library','rooms','upload','profile'].forEach(v=>$(v+'-view')?.classList.toggle('hidden',v!==name));
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
 $('page-title').textContent=({library:'Biblioteca musical',rooms:'Salas de escucha',upload:'Añadir canción',profile:'Mi perfil'})[name]||'Roleplay Music';
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));

function setConnection(ok,label){$('connection-dot').classList.toggle('offline',!ok);$('connection-label').textContent=label;}
function updateIdentityUI(){
 const signed=!!session;
 $('identity-panel').classList.toggle('hidden',signed);
 $('app-content').classList.toggle('hidden',!signed);
 $('user-chip').textContent=signed?(profile?.username||'Aventurero')+(profile?.role==='admin'?' · Admin':''):'Invitado';
 $('profile-name').value=profile?.username||'';
 $('profile-role').textContent=profile?.role==='admin'?'Administrador':'Miembro';
}
async function ensureIdentity(){
 const {data:{session:existing},error}=await db.auth.getSession();if(error)throw error;
 if(existing){session=existing;return;}
 const {data,error:authError}=await db.auth.signInAnonymously();if(authError)throw authError;
 session=data.session;
}
async function loadProfile(){
 const {data,error}=await db.from('profiles').select('id,username,role').eq('id',session.user.id).maybeSingle();
 if(error)throw error;
 if(!data){
  const remembered=localStorage.getItem('roleplay_music_username')||'Aventurero';
  const {data:created,error:insertError}=await db.from('profiles').insert({id:session.user.id,username:remembered}).select('id,username,role').single();
  if(insertError)throw insertError;profile=created;
 }else profile=data;
 localStorage.setItem('roleplay_music_username',profile.username);
}
async function saveUsername(e){
 e.preventDefault();const username=$('profile-name').value.trim();
 if(username.length<2||username.length>30){toast('El nombre debe tener entre 2 y 30 caracteres.',true);return;}
 const btn=$('save-profile');btn.disabled=true;
 try{
  const {data,error}=await db.from('profiles').update({username}).eq('id',session.user.id).select('id,username,role').single();
  if(error)throw error;profile=data;localStorage.setItem('roleplay_music_username',username);updateIdentityUI();toast('Nombre actualizado.');
 }catch(err){toast(err.message||'No se pudo cambiar el nombre.',true);}
 finally{btn.disabled=false;}
}
$('profile-form').addEventListener('submit',saveUsername);

async function enterWithName(e){
 e.preventDefault();const username=$('first-name').value.trim();
 if(username.length<2||username.length>30){toast('El nombre debe tener entre 2 y 30 caracteres.',true);return;}
 $('enter-button').disabled=true;
 try{
  // Guardamos la preferencia local antes de crear la identidad anónima.
  localStorage.setItem('roleplay_music_username',username);
  await ensureIdentity();
  await loadProfile();
  // En el primer acceso se crea el perfil con el nombre guardado. Si ya existía,
  // se respeta el nombre de perfil del servidor y se puede cambiar desde "Mi perfil".
  if(profile.username==='Aventurero' && username!=='Aventurero'){
   const {data,error}=await db.from('profiles').update({username}).eq('id',session.user.id).select('id,username,role').single();
   if(!error)profile=data;
  }
  updateIdentityUI();await refreshSongs();toast(`¡Bienvenido, ${profile.username}!`);
 }catch(err){toast(err.message||'No se pudo entrar. Comprueba la configuración de Supabase.',true);}
 finally{$('enter-button').disabled=false;}
}
$('identity-form').addEventListener('submit',enterWithName);

async function refreshSongs(){
 if(!session){songs=[];renderSongs();return;}
 const {data,error}=await db.from('songs').select('id,title,artist,campaign,description,lyrics,audio_path,cover_path,created_by,created_at').order('created_at',{ascending:false});
 if(error)throw error;
 songs=await Promise.all((data||[]).map(async row=>{
  const [a,c]=await Promise.all([
   db.storage.from('roleplay-audio').createSignedUrl(row.audio_path,3600),
   row.cover_path?db.storage.from('roleplay-covers').createSignedUrl(row.cover_path,3600):Promise.resolve({data:null,error:null})
  ]);
  if(a.error)throw a.error;if(c.error)throw c.error;
  return {...row,audioUrl:a.data.signedUrl,coverUrl:c.data?.signedUrl||''};
 }));
 renderSongs();
}
function renderSongs(){
 $('song-count').textContent=`${songs.length} ${songs.length===1?'canción':'canciones'}`;
 const grid=$('song-grid');grid.innerHTML='';
 if(!session){grid.innerHTML='<div class="empty-state"><h3>Entra para ver la biblioteca</h3></div>';return;}
 if(!songs.length){grid.innerHTML='<div class="empty-state"><div class="empty-icon">♫</div><h3>La aventura empieza aquí</h3><p>Aún no hay canciones. ¡Subid la primera!</p><button class="secondary-button" id="empty-upload">Subir canción</button></div>';$('empty-upload').onclick=()=>showView('upload');return;}
 songs.forEach((song,i)=>{
  const card=document.createElement('article');card.className='song-card';
  const cover=document.createElement('div');cover.className='song-cover';
  if(song.coverUrl){cover.style.backgroundImage=`url("${song.coverUrl}")`;cover.style.backgroundSize='cover';cover.textContent='';}else cover.textContent='♫';
  const title=document.createElement('h3');title.textContent=song.title;
  const meta=document.createElement('p');meta.textContent=[song.artist,song.campaign].filter(Boolean).join(' · ')||song.description||'Canción de rol';
  card.append(cover,title,meta);card.onclick=()=>playSong(i);
  if(profile?.role==='admin'){const del=document.createElement('button');del.className='card-delete';del.textContent='Eliminar';del.onclick=async ev=>{ev.stopPropagation();await deleteSong(song);};card.append(del);}
  grid.append(card);
 });
}
async function uploadSong(e){
 e.preventDefault();if(!session){toast('Primero entra en la web.',true);return;}
 const af=$('song-audio').files[0],cf=$('song-cover').files[0];
 if(!af){toast('Selecciona un archivo de audio.',true);return;}
 if(af.size>50*1024*1024||cf&&cf.size>5*1024*1024){toast('Audio máximo 50 MB y portada máximo 5 MB.',true);return;}
 const btn=e.submitter;if(btn)btn.disabled=true;const id=crypto.randomUUID();
 const ext=f=>(f.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'')||'bin';
 const ap=`${session.user.id}/${id}.${ext(af)}`;let cp=null;
 try{
  let r=await db.storage.from('roleplay-audio').upload(ap,af,{contentType:af.type||'audio/mpeg'});if(r.error)throw r.error;
  if(cf){cp=`${session.user.id}/${id}.${ext(cf)}`;r=await db.storage.from('roleplay-covers').upload(cp,cf,{contentType:cf.type||'image/jpeg'});if(r.error)throw r.error;}
  const {error}=await db.from('songs').insert({title:$('song-title').value.trim(),artist:$('song-artist').value.trim()||null,campaign:$('song-campaign').value.trim()||null,description:$('song-description').value.trim()||null,lyrics:$('song-lyrics').value||null,audio_path:ap,cover_path:cp,created_by:session.user.id});
  if(error)throw error;e.target.reset();await refreshSongs();showView('library');toast('¡Canción subida!');
 }catch(err){await db.storage.from('roleplay-audio').remove([ap]);if(cp)await db.storage.from('roleplay-covers').remove([cp]);toast(err.message||'Error al subir la canción.',true);}
 finally{if(btn)btn.disabled=false;}
}
$('song-form').addEventListener('submit',uploadSong);
async function deleteSong(song){
 if(profile?.role!=='admin')return toast('Solo los administradores pueden eliminar canciones.',true);
 if(!confirm(`¿Eliminar "${song.title}"?`))return;
 try{
  const {error}=await db.from('songs').delete().eq('id',song.id);if(error)throw error;
  await db.storage.from('roleplay-audio').remove([song.audio_path]);if(song.cover_path)await db.storage.from('roleplay-covers').remove([song.cover_path]);
  await refreshSongs();toast('Canción eliminada.');
 }catch(err){toast(err.message||'No se pudo eliminar.',true);}
}
function playSong(i){
 if(i<0||i>=songs.length)return;currentIndex=i;const s=songs[i];audio.src=s.audioUrl;audio.play().catch(()=>toast('Pulsa reproducir para iniciar.'));
 $('player-title').textContent=s.title;$('player-artist').textContent=[s.artist,s.campaign].filter(Boolean).join(' · ')||'Canción de rol';
 $('player-cover').style.backgroundImage=s.coverUrl?`url("${s.coverUrl}")`:'';$('player-cover').textContent=s.coverUrl?'':'♫';$('play-button').textContent='Ⅱ';
}
$('play-button').onclick=()=>{if(currentIndex<0){if(songs.length)playSong(0);return;}if(audio.paused)audio.play();else audio.pause();};
$('prev-button').onclick=()=>{if(songs.length)playSong(currentIndex<=0?songs.length-1:currentIndex-1);};
$('next-button').onclick=()=>{if(songs.length)playSong(currentIndex>=songs.length-1?0:currentIndex+1);};
audio.addEventListener('timeupdate',()=>{if(audio.duration){$('progress').value=audio.currentTime/audio.duration*100;$('current-time').textContent=fmt(audio.currentTime);$('duration').textContent=fmt(audio.duration);}});
$('progress').oninput=e=>{if(audio.duration)audio.currentTime=Number(e.target.value)/100*audio.duration;};
audio.onended=()=>{if(songs.length)playSong((currentIndex+1)%songs.length);};
audio.onpause=()=>{$('play-button').textContent='▶';};audio.onplay=()=>{$('play-button').textContent='Ⅱ';};
function fmt(n){if(!Number.isFinite(n))return'0:00';return`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;}

async function init(){
 if(!sb||!CONFIG.supabaseUrl||!CONFIG.supabaseAnonKey){setConnection(false,'Configura Supabase');toast('Falta configurar Supabase.',true);return;}
 db=sb.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey);
 try{
  // Supabase conserva la sesión anónima en el almacenamiento local del navegador.
  const {data:{session:s},error}=await db.auth.getSession();if(error)throw error;session=s;
  if(session){await loadProfile();updateIdentityUI();await refreshSongs();}
  else {$('identity-panel').classList.remove('hidden');$('app-content').classList.add('hidden');}
  setConnection(true,'Conectado a Supabase');
  db.auth.onAuthStateChange(async(_event,newSession)=>{
   session=newSession;
   try{if(session){await loadProfile();updateIdentityUI();await refreshSongs();}else{profile=null;updateIdentityUI();}}
   catch(err){toast(err.message||'Error cargando el perfil.',true);}
  });
 }catch(err){setConnection(false,'Error de conexión');toast(err.message||'No se pudo conectar.',true);}
}
renderSongs();init();
