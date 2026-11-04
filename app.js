const CONFIG=window.ROLEPLAY_MUSIC_CONFIG||{},sb=window.supabase,$=id=>document.getElementById(id),audio=$('audio-player');
let db=null,session=null,profile=null,songs=[],campaigns=[],currentIndex=-1,currentCampaignFilter=null,lyricLines=[],timedLyrics=[];
const localVolume=Number(localStorage.getItem('roleplay_music_volume')??'0.8');
function toast(m,e=false){const x=$('toast');x.textContent=m;x.classList.remove('hidden','error');if(e)x.classList.add('error');clearTimeout(toast.t);toast.t=setTimeout(()=>x.classList.add('hidden'),4500);}
function stopLyricPreview(){const preview=$('lyric-preview');if(!preview)return;preview.pause();try{preview.currentTime=0;}catch(_){}preview.removeAttribute('src');preview.load();if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null;}}
function showView(v){if(v!=='upload')stopLyricPreview();['library','campaigns','rooms','upload','profile','admin'].forEach(x=>$(x+'-view').classList.toggle('hidden',x!==v));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('page-title').textContent=({library:'Biblioteca musical',campaigns:'Campañas',rooms:'Salas de escucha',upload:'Añadir canción',profile:'Mi perfil',admin:'Administración'})[v];}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{currentCampaignFilter=null;showView(b.dataset.view);if(b.dataset.view==='library')renderSongs();});
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));
function setConnection(ok,label){$('connection-dot').classList.toggle('offline',!ok);$('connection-label').textContent=label;}
function updateIdentity(){const yes=!!session;$('identity-panel').classList.toggle('hidden',yes);$('app-content').classList.toggle('hidden',!yes);$('user-chip').textContent=yes?(profile?.username||'Aventurero')+(profile?.role==='admin'?' · Admin':''):'Invitado';$('profile-name').value=profile?.username||'';$('profile-role').textContent=profile?.role==='admin'?'Administrador':'Miembro';}
async function ensureIdentity(){const {data:{session:s},error}=await db.auth.getSession();if(error)throw error;if(s){session=s;return;}const {data,error:e}=await db.auth.signInAnonymously();if(e)throw e;session=data.session;}
async function loadProfile(){const {data,error}=await db.from('profiles').select('id,username,role').eq('id',session.user.id).maybeSingle();if(error)throw error;if(!data){const {data:d,error:e}=await db.from('profiles').insert({id:session.user.id,username:localStorage.getItem('roleplay_music_username')||'Aventurero'}).select().single();if(e)throw e;profile=d;}else profile=data;localStorage.setItem('roleplay_music_username',profile.username);}
$('identity-form').onsubmit=async e=>{e.preventDefault();const name=$('first-name').value.trim();if(name.length<2||name.length>30)return toast('El nombre debe tener entre 2 y 30 caracteres.',true);$('enter-button').disabled=true;try{localStorage.setItem('roleplay_music_username',name);await ensureIdentity();await loadProfile();if(profile.username==='Aventurero'){const {data,error}=await db.from('profiles').update({username:name}).eq('id',session.user.id).select().single();if(!error)profile=data;}updateIdentity();await loadAll();toast(`¡Bienvenido, ${profile.username}!`);}catch(err){toast(err.message,true);}finally{$('enter-button').disabled=false;}};
$('profile-form').onsubmit=async e=>{e.preventDefault();const username=$('profile-name').value.trim();if(username.length<2||username.length>30)return toast('El nombre debe tener entre 2 y 30 caracteres.',true);$('save-profile').disabled=true;try{const {data,error}=await db.from('profiles').update({username}).eq('id',session.user.id).select().single();if(error)throw error;profile=data;localStorage.setItem('roleplay_music_username',username);updateIdentity();toast('Nombre actualizado.');}catch(err){toast(err.message,true);}finally{$('save-profile').disabled=false;}};
async function signedUrl(bucket,path){if(!path)return'';const {data,error}=await db.storage.from(bucket).createSignedUrl(path,3600);if(error)throw error;return data.signedUrl;}
async function loadAll(){await Promise.all([refreshCampaigns(),refreshSongs()]);}
async function refreshCampaigns(){const {data,error}=await db.from('campaigns').select('id,name,description,cover_path,created_by,created_at').order('name');if(error)throw error;campaigns=await Promise.all((data||[]).map(async c=>({...c,coverUrl:await signedUrl('roleplay-covers',c.cover_path)})));renderCampaigns();populateCampaignSelect();}
async function refreshSongs(){const {data,error}=await db.from('songs').select('id,title,artist,campaign,campaign_id,description,lyrics,lyrics_timed,audio_path,cover_path,created_by,created_at').order('created_at',{ascending:false});if(error)throw error;songs=await Promise.all((data||[]).map(async s=>({...s,audioUrl:await signedUrl('roleplay-audio',s.audio_path),coverUrl:await signedUrl('roleplay-covers',s.cover_path)})));renderSongs();}
function renderSongs(){const list=currentCampaignFilter?songs.filter(s=>s.campaign_id===currentCampaignFilter):songs.filter(s=>!s.campaign_id);$('library-heading').textContent=currentCampaignFilter?(campaigns.find(c=>c.id===currentCampaignFilter)?.name||'Campaña'):'Música sin campaña';$('song-count').textContent=`${list.length} ${list.length===1?'canción':'canciones'}`;const grid=$('song-grid');grid.innerHTML='';if(!list.length){grid.innerHTML=`<div class="empty-state"><div class="empty-icon">♫</div><h3>${currentCampaignFilter?'Esta campaña aún no tiene música':'Tu biblioteca está despejada'}</h3><p>${currentCampaignFilter?'Añadid canciones a esta campaña desde el formulario de subida.':'Las canciones sin campaña aparecerán aquí. Crea campañas para mantenerlas organizadas.'}</p><button class="secondary-button" id="empty-add">＋ Añadir canción</button></div>`;$('empty-add').onclick=()=>showView('upload');return;}list.forEach(song=>{const i=songs.findIndex(s=>s.id===song.id),card=document.createElement('article');card.className='song-card';const cover=document.createElement('div');cover.className='song-cover';if(song.coverUrl){cover.style.backgroundImage=`url("${song.coverUrl}")`;cover.style.backgroundSize='cover';cover.textContent='';}else cover.textContent='♫';const h=document.createElement('h3');h.textContent=song.title;const p=document.createElement('p');p.textContent=[song.artist,song.campaign||campaigns.find(c=>c.id===song.campaign_id)?.name].filter(Boolean).join(' · ')||song.description||'Canción de rol';card.append(cover,h,p);card.onclick=()=>playSong(i);if(profile?.role==='admin'){const del=document.createElement('button');del.className='card-delete';del.textContent='Eliminar';del.onclick=async ev=>{ev.stopPropagation();await deleteSong(song);};card.append(del);}grid.append(card);});}
function renderCampaigns(){const grid=$('campaign-grid');grid.innerHTML='';campaigns.forEach(c=>{const card=document.createElement('article');card.className='campaign-card';const art=document.createElement('div');art.className='campaign-cover';if(c.coverUrl){art.style.backgroundImage=`url("${c.coverUrl}")`;art.style.backgroundSize='cover';}else art.textContent='▣';const h=document.createElement('h3');h.textContent=c.name;const p=document.createElement('p');p.textContent=c.description||`${songs.filter(s=>s.campaign_id===c.id).length} canciones`;const b=document.createElement('button');b.className='secondary-button';b.textContent='Abrir campaña';b.onclick=()=>{currentCampaignFilter=c.id;showView('library');renderSongs();};card.append(art,h,p,b);grid.append(card);});if(!campaigns.length)grid.innerHTML='<div class="empty-state"><div class="empty-icon">▣</div><h3>Todavía no hay campañas</h3><p>Cread una carpeta para reunir la música de cada aventura.</p></div>';}
function populateCampaignSelect(){const select=$('song-campaign-id');const selected=select.value;select.innerHTML='<option value="">Sin campaña</option>'+campaigns.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');if(campaigns.some(c=>c.id===selected))select.value=selected;}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$('show-campaign-form').onclick=()=>$('campaign-form').classList.toggle('hidden');
$('campaign-form').onsubmit=async e=>{e.preventDefault();const name=$('campaign-name').value.trim(),file=$('campaign-cover').files[0];if(!name)return;let coverPath=null;const id=crypto.randomUUID();try{if(file){if(file.size>5*1024*1024)throw Error('La portada no puede superar 5 MB.');coverPath=`${session.user.id}/campaign-${id}.${file.name.split('.').pop().toLowerCase()}`;const {error}=await db.storage.from('roleplay-covers').upload(coverPath,file,{contentType:file.type});if(error)throw error;}const {error}=await db.from('campaigns').insert({name,description:$('campaign-description').value.trim()||null,cover_path:coverPath,created_by:session.user.id});if(error)throw error;e.target.reset();e.target.classList.add('hidden');await refreshCampaigns();toast('Campaña creada.');}catch(err){if(coverPath)await db.storage.from('roleplay-covers').remove([coverPath]);toast(err.message,true);}};
let previewObjectUrl=null;
$('convert-lyrics').onclick=()=>{const raw=$('lyrics-raw').value.trim();if(!raw)return toast('Pega primero la letra que quieres transformar.',true);const prepared=raw.replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/([.!?…])\s+/g,'$1\n').split('\n').map(line=>line.trim()).filter(Boolean).join('\n');$('song-lyrics').value=prepared;$('song-lyrics').dispatchEvent(new Event('input',{bubbles:true}));toast(`Letra preparada: ${prepared.split('\n').length} frases.`);};
$('song-audio').onchange=()=>{const f=$('song-audio').files[0];stopLyricPreview();if(!f)return;previewObjectUrl=URL.createObjectURL(f);$('lyric-preview').src=previewObjectUrl;lyricLines=$('song-lyrics').value.split('\n').map(x=>x.trim()).filter(Boolean);timedLyrics=[];renderTimingList();};
$('song-lyrics').oninput=()=>{lyricLines=$('song-lyrics').value.split('\n').map(x=>x.trim()).filter(Boolean);timedLyrics=timedLyrics.filter(x=>lyricLines.includes(x.text));renderTimingList();};
$('mark-lyric').onclick=()=>{lyricLines=$('song-lyrics').value.split('\n').map(x=>x.trim()).filter(Boolean);const next=lyricLines[timedLyrics.length];if(!next)return toast('No quedan líneas por marcar.');const t=$('lyric-preview').currentTime;if(timedLyrics.length&&t<=timedLyrics[timedLyrics.length-1].time)return toast('Avanza un poco la canción antes de marcar la siguiente línea.',true);timedLyrics.push({time:Number(t.toFixed(2)),text:next});renderTimingList();};
$('reset-lyric-times').onclick=()=>{timedLyrics=[];renderTimingList();};
function renderTimingList(){$('lyric-timing-list').innerHTML=timedLyrics.length?timedLyrics.map((l,i)=>`<div><span>${fmt(l.time)}</span><span>${escapeHtml(l.text)}</span><button type="button" data-remove-line="${i}">×</button></div>`).join(''):'Aún no hay líneas marcadas.';document.querySelectorAll('[data-remove-line]').forEach(b=>b.onclick=()=>{timedLyrics.splice(Number(b.dataset.removeLine),1);renderTimingList();});}
$('song-form').onsubmit=async e=>{e.preventDefault();stopLyricPreview();const af=$('song-audio').files[0],cf=$('song-cover').files[0];if(!af)return toast('Selecciona un audio.',true);if(af.size>50*1024*1024||cf&&cf.size>5*1024*1024)return toast('Audio máximo 50 MB y portada máximo 5 MB.',true);const btn=e.submitter;btn.disabled=true;const id=crypto.randomUUID(),ext=f=>(f.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'')||'bin',ap=`${session.user.id}/${id}.${ext(af)}`;let cp=null;try{let r=await db.storage.from('roleplay-audio').upload(ap,af,{contentType:af.type||'audio/mpeg'});if(r.error)throw r.error;if(cf){cp=`${session.user.id}/${id}.${ext(cf)}`;r=await db.storage.from('roleplay-covers').upload(cp,cf,{contentType:cf.type});if(r.error)throw r.error;}const campaignId=$('song-campaign-id').value||null;const {error}=await db.from('songs').insert({title:$('song-title').value.trim(),artist:$('song-artist').value.trim()||null,campaign:campaigns.find(c=>c.id===campaignId)?.name||null,campaign_id:campaignId,description:$('song-description').value.trim()||null,lyrics:$('song-lyrics').value||null,lyrics_timed:timedLyrics,audio_path:ap,cover_path:cp,created_by:session.user.id});if(error)throw error;e.target.reset();timedLyrics=[];lyricLines=[];$('lyrics-raw').value='';stopLyricPreview();renderTimingList();await loadAll();showView('library');currentCampaignFilter=campaignId;renderSongs();toast('¡Canción subida a la biblioteca!');}catch(err){await db.storage.from('roleplay-audio').remove([ap]);if(cp)await db.storage.from('roleplay-covers').remove([cp]);toast(err.message,true);}finally{btn.disabled=false;}};
async function deleteSong(s){if(profile?.role!=='admin')return toast('Solo los administradores pueden eliminar canciones.',true);if(!confirm(`¿Eliminar "${s.title}"?`))return;try{const {error}=await db.from('songs').delete().eq('id',s.id);if(error)throw error;await db.storage.from('roleplay-audio').remove([s.audio_path]);if(s.cover_path)await db.storage.from('roleplay-covers').remove([s.cover_path]);await refreshSongs();toast('Canción eliminada.');}catch(err){toast(err.message,true);}}
function playSong(i){if(i<0||i>=songs.length)return;currentIndex=i;const s=songs[i];audio.src=s.audioUrl;audio.volume=Number($('volume').value);audio.play().catch(()=>toast('Pulsa reproducir para iniciar.'));$('player-title').textContent=s.title;$('player-artist').textContent=[s.artist,campaigns.find(c=>c.id===s.campaign_id)?.name].filter(Boolean).join(' · ')||'Canción de rol';$('player-cover').style.backgroundImage=s.coverUrl?`url("${s.coverUrl}")`:'';$('player-cover').textContent=s.coverUrl?'':'♫';$('full-title').textContent=s.title;$('full-artist').textContent=[s.artist,campaigns.find(c=>c.id===s.campaign_id)?.name].filter(Boolean).join(' · ')||'Canción de rol';$('full-cover').style.backgroundImage=s.coverUrl?`url("${s.coverUrl}")`:'';$('full-cover').textContent=s.coverUrl?'':'♫';renderKaraoke();}
function fmt(n){if(!Number.isFinite(n))return'0:00';return`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;}
function setVolume(v){const n=Math.max(0,Math.min(1,Number(v)));audio.volume=n;$('volume').value=n;$('full-volume').value=n;localStorage.setItem('roleplay_music_volume',String(n));}
$('volume').value=localVolume;$('full-volume').value=localVolume;audio.volume=localVolume;$('volume').oninput=e=>setVolume(e.target.value);$('full-volume').oninput=e=>setVolume(e.target.value);
$('play-button').onclick=$('full-play').onclick=()=>{if(currentIndex<0){if(songs.length)playSong(0);return;}if(audio.paused)audio.play();else audio.pause();};
$('prev-button').onclick=$('full-prev').onclick=()=>{if(songs.length)playSong(currentIndex<=0?songs.length-1:currentIndex-1);};
$('next-button').onclick=$('full-next').onclick=()=>{if(songs.length)playSong(currentIndex>=songs.length-1?0:currentIndex+1);};
function updateProgress(){const dur=audio.duration||0,cur=audio.currentTime||0;for(const [p,c,d] of [['progress','current-time','duration'],['full-progress','full-current','full-duration']]){$(p).value=dur?cur/dur*100:0;$(c).textContent=fmt(cur);$(d).textContent=fmt(dur);}updateKaraoke();}
audio.ontimeupdate=updateProgress;audio.onpause=()=>{$('play-button').textContent=$('full-play').textContent='▶';};audio.onplay=()=>{$('play-button').textContent=$('full-play').textContent='Ⅱ';};audio.onended=()=>{if(songs.length)playSong((currentIndex+1)%songs.length);};
$('progress').oninput=$('full-progress').oninput=e=>{if(audio.duration)audio.currentTime=Number(e.target.value)/100*audio.duration;};
$('expand-player').onclick=()=>$('full-player').classList.remove('hidden');$('close-full-player').onclick=()=>$('full-player').classList.add('hidden');
function renderKaraoke(){const s=songs[currentIndex],box=$('karaoke-lines');if(!s){box.innerHTML='<p class="karaoke-placeholder">Selecciona una canción para ver su letra.</p>';return;}const timed=Array.isArray(s.lyrics_timed)?s.lyrics_timed:[];if(!timed.length){box.innerHTML=(s.lyrics||'').trim()?`<p class="karaoke-placeholder">Esta canción todavía no tiene tiempos marcados. Su letra está guardada, pero necesita sincronización.</p><div class="plain-lyrics">${escapeHtml(s.lyrics||'').replace(/\n/g,'<br>')}</div>`:'<p class="karaoke-placeholder">Esta canción todavía no tiene letra.</p>';return;}box.innerHTML=timed.map((l,i)=>`<p class="karaoke-line" data-kline="${i}">${escapeHtml(l.text)}</p>`).join('');updateKaraoke();}
function updateKaraoke(){const s=songs[currentIndex];if(!s||!Array.isArray(s.lyrics_timed)||!s.lyrics_timed.length)return;const timed=s.lyrics_timed;let active=-1;for(let i=0;i<timed.length;i++){if(audio.currentTime>=Number(timed[i].time))active=i;else break;}document.querySelectorAll('.karaoke-line').forEach((el,i)=>{el.classList.toggle('current',i===active);el.classList.toggle('past',i<active);el.classList.toggle('upcoming',i>active);if(i===active)el.scrollIntoView({behavior:'smooth',block:'center'});});}
function init(){if(!sb||!CONFIG.supabaseUrl||!CONFIG.supabaseAnonKey){setConnection(false,'Configura Supabase');return;}db=sb.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey);db.auth.getSession().then(async({data,error})=>{if(error)throw error;session=data.session;if(session){await loadProfile();updateIdentity();await loadAll();}else{$('identity-panel').classList.remove('hidden');$('app-content').classList.add('hidden');}setConnection(true,'Conectado a Supabase');}).catch(e=>{setConnection(false,'Error de conexión');toast(e.message,true);});db.auth.onAuthStateChange(async(_event,s)=>{session=s;if(session){try{await loadProfile();updateIdentity();await loadAll();}catch(e){toast(e.message,true);}}});}
renderTimingList();init();


// ===== ROLEPLAY MUSIC 3.0: SALAS SINCRONIZADAS =====
let activeRoom=null, roomChannel=null, roomApplyingRemote=false, roomHeartbeat=null;
function roomPlaylist(){
 if(!activeRoom)return [];
 return activeRoom.campaign_id ? songs.filter(s=>s.campaign_id===activeRoom.campaign_id) : songs;
}
function updateRoomCampaignOptions(){
 const sel=$('new-room-campaign');if(!sel)return;
 const keep=sel.value;
 sel.innerHTML='<option value="">Sala general · Todas las canciones</option>'+campaigns.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
 if([...sel.options].some(o=>o.value===keep))sel.value=keep;
}
const oldLoadAll=loadAll;
loadAll=async function(){await oldLoadAll();updateRoomCampaignOptions();if(activeRoom)renderRoomPlaylist();};
const oldShowView=showView;
showView=function(v){oldShowView(v);if(v==='rooms'){updateRoomCampaignOptions();renderRoomPlaylist();}};
function makeRoomCode(){return Array.from(crypto.getRandomValues(new Uint8Array(4))).map(x=>(x%36).toString(36)).join('').toUpperCase();}
function roomSongById(id){return songs.find(s=>s.id===id)||null;}
function renderRoomPlaylist(){
 const list=roomPlaylist(),box=$('room-playlist');if(!box)return;
 $('room-playlist-count').textContent=`${list.length} ${list.length===1?'canción':'canciones'}`;
 box.innerHTML='';
 if(!activeRoom||!list.length){box.innerHTML='<div class="empty-state"><h3>No hay canciones en esta lista</h3><p>Añade canciones a esta campaña o elige una sala general.</p></div>';return;}
 list.forEach((s,i)=>{
  const row=document.createElement('button');row.type='button';row.className='room-song-row'+(s.id===activeRoom.current_song_id?' selected':'');
  const art=document.createElement('span');art.className='room-song-art';if(s.coverUrl){art.style.backgroundImage=`url("${s.coverUrl}")`;art.textContent='';}else art.textContent='♫';
  const meta=document.createElement('span');meta.className='room-song-meta';const title=document.createElement('strong');title.textContent=s.title;const artist=document.createElement('small');artist.textContent=s.artist||'Canción de rol';meta.append(title,artist);
  const action=document.createElement('span');action.textContent=s.id===activeRoom.current_song_id?'SONANDO':'▶';row.append(art,meta,action);row.onclick=()=>roomSelectSong(s,true);box.append(row);
 });
}
async function createRoom(e){
 e.preventDefault();const name=$('new-room-name').value.trim(),campaignId=$('new-room-campaign').value||null;
 if(!name)return toast('Pon un nombre a la sala.',true);
 const code=makeRoomCode();
 try{
  const {data,error}=await db.rpc('create_room',{p_name:name,p_room_code:code,p_campaign_id:campaignId});
  if(error)throw error;
  const createdRoom=Array.isArray(data)?data[0]:data;
  if(!createdRoom)throw new Error('Supabase no devolvió la sala creada.');
  $('create-room-form').reset();await enterRoom(createdRoom);toast('Sala creada. Comparte el código con tus amigos.');
 }catch(err){toast(err.message||'No se pudo crear la sala.',true);}
}
async function joinRoom(e){
 e.preventDefault();const code=$('join-room-code').value.trim().toUpperCase();
 if(!code)return;
 try{const {data,error}=await db.rpc('join_room_by_code',{p_code:code});if(error)throw error;const room=Array.isArray(data)?data[0]:data;if(!room)throw Error('No encontramos ninguna sala con ese código.');$('join-room-form').reset();await enterRoom(room);}
 catch(err){toast(err.message||'No se pudo entrar en la sala.',true);}
}
async function enterRoom(room){
 if(roomChannel){await db.removeChannel(roomChannel);roomChannel=null;}
 activeRoom=room;
 $('active-room').classList.remove('hidden');$('rooms-empty').classList.add('hidden');
 $('active-room-name').textContent=room.name;
 const campaign=campaigns.find(c=>c.id===room.campaign_id);
 $('active-room-subtitle').textContent=campaign?`Lista exclusiva: ${campaign.name}`:'Sala general · Todas las campañas';
 $('active-room-code').textContent=room.room_code;
 renderRoomPlaylist();
 roomChannel=db.channel('room-'+room.id)
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${room.id}`},payload=>{const next=payload.new;activeRoom=next;applyRemoteRoomState(next);})
  .subscribe(status=>{$('room-sync-status').textContent=status==='SUBSCRIBED'?'● Sincronización en directo':'Conectando…';});
 await applyRemoteRoomState(room);
 if(roomHeartbeat)clearInterval(roomHeartbeat);
 roomHeartbeat=setInterval(()=>{if(activeRoom&&session&&activeRoom.created_by===session.user.id&&!audio.paused&&currentRoomSong()){publishRoomState(true).catch(()=>{});}},12000);
}
function currentRoomSong(){return activeRoom?roomSongById(activeRoom.current_song_id):null;}
async function applyRemoteRoomState(state){
 if(!state)return;activeRoom=state;renderRoomPlaylist();
 const song=roomSongById(state.current_song_id);
 if(!song){if(currentIndex>=0&&activeRoom){audio.pause();}$('room-song-title').textContent='Esperando canción';$('room-song-artist').textContent='Elige una canción de la lista';$('room-cover').style.backgroundImage='';$('room-cover').textContent='♫';return;}
 const needsSource=audio.dataset.roomSongId!==song.id;
 roomApplyingRemote=true;
 if(needsSource){audio.src=song.audioUrl;audio.dataset.roomSongId=song.id;currentIndex=songs.findIndex(s=>s.id===song.id);syncPlayerDisplay(song);}
 const elapsed=state.is_playing?Math.max(0,(Date.now()-new Date(state.updated_at).getTime())/1000):0;
 const target=Math.max(0,Number(state.position_seconds||0)+elapsed);
 if(Number.isFinite(audio.duration)&&Math.abs(audio.currentTime-target)>1.35)audio.currentTime=Math.min(target,audio.duration||target);
 else if(!Number.isFinite(audio.duration))audio.addEventListener('loadedmetadata',()=>{if(Math.abs(audio.currentTime-target)>1.35)audio.currentTime=Math.min(target,audio.duration||target);if(state.is_playing)audio.play().catch(()=>{});else audio.pause();},{once:true});
 if(state.is_playing){try{await audio.play();}catch(e){$('room-sync-status').textContent='Pulsa reproducir para permitir el audio en tu navegador.';}}
 else audio.pause();
 roomApplyingRemote=false;
 $('room-song-title').textContent=song.title;$('room-song-artist').textContent=song.artist||'Canción de rol';
 $('room-cover').style.backgroundImage=song.coverUrl?`url("${song.coverUrl}")`:'';$('room-cover').textContent=song.coverUrl?'':'♫';
 renderRoomKaraoke(song);
}
function syncPlayerDisplay(song){
 $('player-title').textContent=song.title;$('player-artist').textContent=song.artist||'Canción de rol';
 $('player-cover').style.backgroundImage=song.coverUrl?`url("${song.coverUrl}")`:'';$('player-cover').textContent=song.coverUrl?'':'♫';
 $('full-title').textContent=song.title;$('full-artist').textContent=song.artist||'Canción de rol';
 $('full-cover').style.backgroundImage=song.coverUrl?`url("${song.coverUrl}")`:'';$('full-cover').textContent=song.coverUrl?'':'♫';
 renderKaraoke();
}
async function publishRoomState(playing){
 if(!activeRoom||roomApplyingRemote)return;
 const {error}=await db.from('rooms').update({current_song_id:activeRoom.current_song_id,is_playing:playing,position_seconds:Number(audio.currentTime||0),updated_at:new Date().toISOString()}).eq('id',activeRoom.id);
 if(error)throw error;
}
async function roomSelectSong(song,autoplay){
 if(!activeRoom)return;
 const allowed=roomPlaylist().some(s=>s.id===song.id);
 if(!allowed)return toast('Esta canción no pertenece a la lista de reproducción de esta sala.',true);
 activeRoom.current_song_id=song.id;audio.dataset.roomSongId='';
 const {error}=await db.from('rooms').update({current_song_id:song.id,is_playing:!!autoplay,position_seconds:0,updated_at:new Date().toISOString()}).eq('id',activeRoom.id);
 if(error){toast(error.message,true);return;}
 await applyRemoteRoomState({...activeRoom,current_song_id:song.id,is_playing:!!autoplay,position_seconds:0,updated_at:new Date().toISOString()});
}
async function roomToggle(){
 if(!activeRoom)return;
 if(!activeRoom.current_song_id){const list=roomPlaylist();if(!list.length)return toast('No hay canciones disponibles en esta sala.');return roomSelectSong(list[0],true);}
 await publishRoomState(audio.paused);
}
async function roomNext(direction=1){
 if(!activeRoom)return;
 const list=roomPlaylist();if(!list.length)return toast('No hay canciones disponibles en esta sala.');
 let index=list.findIndex(s=>s.id===activeRoom.current_song_id);index=index<0?0:(index+direction+list.length)%list.length;
 await roomSelectSong(list[index],true);
}
$('create-room-form').addEventListener('submit',createRoom);
$('join-room-form').addEventListener('submit',joinRoom);
$('room-play').onclick=roomToggle;
$('room-next').onclick=()=>roomNext(1);
$('room-prev').onclick=()=>roomNext(-1);
$('leave-room').onclick=async()=>{if(roomChannel){await db.removeChannel(roomChannel);roomChannel=null;}if(roomHeartbeat)clearInterval(roomHeartbeat);activeRoom=null;$('active-room').classList.add('hidden');$('rooms-empty').classList.remove('hidden');audio.pause();delete audio.dataset.roomSongId;};
$('copy-room-code').onclick=()=>{if(activeRoom)navigator.clipboard.writeText(activeRoom.room_code).then(()=>toast('Código copiado.')).catch(()=>toast('No se pudo copiar el código.',true));};
function renderRoomKaraoke(song){
 const box=$('karaoke-lines');
 // Los avisos periódicos de sincronización de la sala no deben reconstruir la letra.
 // Solo la dibujamos cuando cambia la canción o aún no se ha creado su contenido.
 if(box.dataset.roomKaraokeSongId===song.id)return;
 const timed=Array.isArray(song.lyrics_timed)?song.lyrics_timed:[];
 if(!timed.length){box.innerHTML=song.lyrics?`<p class="karaoke-placeholder">Esta canción todavía no tiene tiempos marcados.</p><div class="plain-lyrics">${escapeHtml(song.lyrics).replace(/\n/g,'<br>')}</div>`:'<p class="karaoke-placeholder">Esta canción todavía no tiene letra.</p>';box.dataset.roomKaraokeSongId=song.id;return;}
 box.innerHTML=timed.map((l,i)=>`<p class="karaoke-line" data-kline="${i}">${escapeHtml(l.text)}</p>`).join('');
 box.dataset.roomKaraokeSongId=song.id;
}
let lastRoomKaraokeActive=null;
const previousUpdateKaraoke=updateKaraoke;
updateKaraoke=function(){
 if(activeRoom&&currentRoomSong()){
  const timed=Array.isArray(currentRoomSong().lyrics_timed)?currentRoomSong().lyrics_timed:[];
  let active=-1;
  for(let i=0;i<timed.length;i++){if(audio.currentTime>=Number(timed[i].time))active=i;else break;}
  document.querySelectorAll('.karaoke-line').forEach((el,i)=>{
   el.classList.toggle('current',i===active);
   el.classList.toggle('past',i<active);
   el.classList.toggle('upcoming',i>active);
  });
  // Desplazar solo al cambiar de frase, no en cada actualización del reproductor.
  const songId=currentRoomSong().id, marker=`${songId}:${active}`;
  if(active>=0&&marker!==lastRoomKaraokeActive){
   lastRoomKaraokeActive=marker;
   document.querySelector(`.karaoke-line[data-kline="${active}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
  }
 }else{
  lastRoomKaraokeActive=null;
  previousUpdateKaraoke();
 }
};
const previousPlaySong=playSong;
playSong=function(i){if(activeRoom){const s=songs[i];if(s)return roomSelectSong(s,true);return;}previousPlaySong(i);};
const previousNext=audio.onended;
audio.onended=()=>{if(activeRoom){roomNext(1);}else if(songs.length)playSong((currentIndex+1)%songs.length);};
$('play-button').onclick=$('full-play').onclick=async()=>{if(activeRoom){await roomToggle();return;}if(currentIndex<0){if(songs.length)previousPlaySong(0);return;}if(audio.paused)audio.play();else audio.pause();};
$('prev-button').onclick=$('full-prev').onclick=()=>{if(activeRoom){roomNext(-1);return;}if(songs.length)previousPlaySong(currentIndex<=0?songs.length-1:currentIndex-1);};
$('next-button').onclick=$('full-next').onclick=()=>{if(activeRoom){roomNext(1);return;}if(songs.length)previousPlaySong(currentIndex>=songs.length-1?0:currentIndex+1);};
audio.addEventListener('seeked',()=>{if(activeRoom&&!roomApplyingRemote)publishRoomState(!audio.paused).catch(e=>toast(e.message,true));});
audio.addEventListener('play',()=>{if(activeRoom&&!roomApplyingRemote)publishRoomState(true).catch(()=>{});});
audio.addEventListener('pause',()=>{if(activeRoom&&!roomApplyingRemote&&audio.dataset.roomSongId)publishRoomState(false).catch(()=>{});});
audio.addEventListener('timeupdate',()=>{if(activeRoom){$('room-time').textContent=fmt(audio.currentTime);$('room-duration').textContent=fmt(audio.duration);$('room-progress-fill').style.width=(audio.duration?audio.currentTime/audio.duration*100:0)+'%';}});

// En la biblioteca individual, la reproducción también respeta la colección
// de la canción actual: campaña concreta o canciones sin campaña.
function localPlaylist(){
 if(currentIndex<0||!songs[currentIndex])return songs.filter(s=>!s.campaign_id);
 const campaignId=songs[currentIndex].campaign_id;
 return songs.filter(s=>campaignId?s.campaign_id===campaignId:!s.campaign_id);
}
function localNext(direction){
 const list=localPlaylist();if(!list.length)return;
 let i=list.findIndex(s=>s.id===songs[currentIndex]?.id);
 i=i<0?0:(i+direction+list.length)%list.length;
 const nextIndex=songs.findIndex(s=>s.id===list[i].id);
 previousPlaySong(nextIndex);
}
const playSongBeforeCampaignGuard=playSong;
playSong=function(i){
 if(activeRoom){const s=songs[i];if(s)return roomSelectSong(s,true);return;}
 playSongBeforeCampaignGuard(i);
};
$('next-button').onclick=$('full-next').onclick=()=>{if(activeRoom){roomNext(1);return;}localNext(1);};
$('prev-button').onclick=$('full-prev').onclick=()=>{if(activeRoom){roomNext(-1);return;}localNext(-1);};
audio.onended=()=>{if(activeRoom){roomNext(1);}else localNext(1);};


// ===== PANEL DE ADMINISTRACIÓN =====
let adminUsers=[],adminRooms=[];
function isAdmin(){return !!profile&&profile.role==='admin';}
const baseUpdateIdentity=updateIdentity;
updateIdentity=function(){baseUpdateIdentity();document.querySelectorAll('.admin-nav').forEach(x=>x.classList.toggle('hidden',!isAdmin()));if(isAdmin())refreshAdmin().catch(e=>toast('Panel admin: '+e.message,true));};
const baseLoadAll=loadAll;
loadAll=async function(){await baseLoadAll();if(isAdmin())await refreshAdmin();};
const baseShowView=showView;
showView=function(v){if(v==='admin'&&!isAdmin()){toast('No tienes permisos de administrador.',true);return;}baseShowView(v);if(v==='admin')refreshAdmin().catch(e=>toast(e.message,true));};
document.querySelectorAll('[data-admin-tab]').forEach(btn=>btn.addEventListener('click',()=>{
 document.querySelectorAll('[data-admin-tab]').forEach(x=>x.classList.toggle('active',x===btn));
 ['songs','campaigns','users','rooms'].forEach(k=>$('admin-'+k+'-panel').classList.toggle('hidden',k!==btn.dataset.adminTab));
}));
async function refreshAdmin(){
 if(!isAdmin())return;
 const [u,r]=await Promise.all([
  db.from('profiles').select('id,username,role,created_at').order('created_at',{ascending:false}),
  db.from('rooms').select('id,name,room_code,campaign_id,created_by,created_at').order('created_at',{ascending:false})
 ]);
 if(u.error)throw u.error;if(r.error)throw r.error;
 adminUsers=u.data||[];adminRooms=r.data||[];
 $('admin-song-count').textContent=songs.length;$('admin-campaign-count').textContent=campaigns.length;$('admin-user-count').textContent=adminUsers.length;$('admin-room-count').textContent=adminRooms.length;
 renderAdminSongs();renderAdminCampaigns();renderAdminUsers();renderAdminRooms();
}
function adminOpenModal(title,body){
 $('admin-modal-content').innerHTML=`<span class="eyebrow">ADMINISTRACIÓN</span><h2>${escapeHtml(title)}</h2>${body}`;
 $('admin-modal').classList.remove('hidden');
}
function adminCloseModal(){$('admin-modal').classList.add('hidden');$('admin-modal-content').innerHTML='';}
$('admin-modal-close').onclick=adminCloseModal;
$('admin-modal').addEventListener('click',e=>{if(e.target===$('admin-modal'))adminCloseModal();});
function renderAdminSongs(){
 const q=($('admin-song-search')?.value||'').toLowerCase(),box=$('admin-songs-list');if(!box)return;box.innerHTML='';
 const list=songs.filter(s=>[s.title,s.artist,s.description].join(' ').toLowerCase().includes(q));
 if(!list.length){box.innerHTML='<div class="empty-state">No hay canciones que coincidan.</div>';return;}
 list.forEach(s=>{
  const row=document.createElement('div');row.className='admin-row';
  const art=document.createElement('div');art.className='admin-row-cover';if(s.coverUrl)art.style.backgroundImage=`url("${s.coverUrl}")`;else art.textContent='♫';
  const info=document.createElement('div');info.className='admin-row-info';const strong=document.createElement('strong');strong.textContent=s.title;const small=document.createElement('small');small.textContent=[s.artist,campaigns.find(c=>c.id===s.campaign_id)?.name||'Sin campaña'].filter(Boolean).join(' · ');info.append(strong,small);
  const actions=document.createElement('div');actions.className='admin-row-actions';const edit=document.createElement('button');edit.className='secondary-button';edit.textContent='Editar';edit.onclick=()=>editSongAdmin(s);const del=document.createElement('button');del.className='danger-button';del.textContent='Eliminar';del.onclick=()=>deleteSong(s);actions.append(edit,del);row.append(art,info,actions);box.append(row);
 });
}
function editSongAdmin(s){
 const opts='<option value="">Sin campaña</option>'+campaigns.map(c=>`<option value="${c.id}" ${c.id===s.campaign_id?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
 adminOpenModal('Editar canción',`<form id="admin-song-edit" class="admin-edit-form">
  <label>Título<input id="ae-title" maxlength="90" required value="${escapeHtml(s.title)}"></label>
  <label>Artista / personaje<input id="ae-artist" maxlength="90" value="${escapeHtml(s.artist||'')}"></label>
  <label>Campaña<select id="ae-campaign">${opts}</select></label>
  <label>Descripción<textarea id="ae-description" rows="3">${escapeHtml(s.description||'')}</textarea></label>
  <label>Letra<textarea id="ae-lyrics" rows="6">${escapeHtml(s.lyrics||'')}</textarea></label>
  <label>Marcas karaoke (JSON)<textarea id="ae-timed" rows="4">${escapeHtml(JSON.stringify(s.lyrics_timed||[],null,2))}</textarea><small>Formato: [{"time": 1.25, "text": "Verso"}]</small></label>
  <label>Reemplazar portada (opcional)<input id="ae-cover" type="file" accept="image/png,image/jpeg,image/webp"></label>
  <label>Reemplazar audio (opcional)<input id="ae-audio" type="file" accept="audio/*"></label>
  <div class="admin-modal-actions"><button type="button" class="secondary-button" id="ae-cancel">Cancelar</button><button class="primary-button" type="submit">Guardar cambios</button></div>
 </form>`);
 $('ae-cancel').onclick=adminCloseModal;
 $('admin-song-edit').onsubmit=async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;let newCover=null,newAudio=null;
  try{
   let timed=JSON.parse($('ae-timed').value||'[]');if(!Array.isArray(timed))throw Error('Las marcas karaoke deben ser una lista JSON.');
   const cf=$('ae-cover').files[0],af=$('ae-audio').files[0],id=crypto.randomUUID();
   if(cf){if(cf.size>5*1024*1024)throw Error('La portada supera 5 MB.');newCover=`${session.user.id}/admin-cover-${id}.${cf.name.split('.').pop().toLowerCase()}`;let up=await db.storage.from('roleplay-covers').upload(newCover,cf,{contentType:cf.type});if(up.error)throw up.error;}
   if(af){if(af.size>50*1024*1024)throw Error('El audio supera 50 MB.');newAudio=`${session.user.id}/admin-audio-${id}.${af.name.split('.').pop().toLowerCase()}`;let up=await db.storage.from('roleplay-audio').upload(newAudio,af,{contentType:af.type||'audio/mpeg'});if(up.error)throw up.error;}
   const campId=$('ae-campaign').value||null,camp=campaigns.find(c=>c.id===campId);
   const patch={title:$('ae-title').value.trim(),artist:$('ae-artist').value.trim()||null,campaign:camp?.name||null,campaign_id:campId,description:$('ae-description').value.trim()||null,lyrics:$('ae-lyrics').value,lyrics_timed:timed};
   if(newCover)patch.cover_path=newCover;if(newAudio)patch.audio_path=newAudio;
   const {error}=await db.from('songs').update(patch).eq('id',s.id);if(error)throw error;
   if(newCover&&s.cover_path)await db.storage.from('roleplay-covers').remove([s.cover_path]);
   if(newAudio&&s.audio_path)await db.storage.from('roleplay-audio').remove([s.audio_path]);
   adminCloseModal();await loadAll();toast('Canción actualizada.');
  }catch(err){if(newCover)await db.storage.from('roleplay-covers').remove([newCover]);if(newAudio)await db.storage.from('roleplay-audio').remove([newAudio]);toast(err.message||'No se pudo guardar.',true);}
  finally{btn.disabled=false;}
 };
}
function renderAdminCampaigns(){
 const box=$('admin-campaigns-list');if(!box)return;box.innerHTML='';
 campaigns.forEach(c=>{const row=document.createElement('div');row.className='admin-row';const art=document.createElement('div');art.className='admin-row-cover';if(c.coverUrl)art.style.backgroundImage=`url("${c.coverUrl}")`;else art.textContent='▣';const info=document.createElement('div');info.className='admin-row-info';const st=document.createElement('strong');st.textContent=c.name;const sm=document.createElement('small');sm.textContent=`${songs.filter(s=>s.campaign_id===c.id).length} canciones`;info.append(st,sm);const actions=document.createElement('div');actions.className='admin-row-actions';const edit=document.createElement('button');edit.className='secondary-button';edit.textContent='Editar';edit.onclick=()=>editCampaignAdmin(c);const del=document.createElement('button');del.className='danger-button';del.textContent='Eliminar';del.onclick=()=>deleteCampaignAdmin(c);actions.append(edit,del);row.append(art,info,actions);box.append(row);});
 if(!campaigns.length)box.innerHTML='<div class="empty-state">No hay campañas.</div>';
}
function editCampaignAdmin(c){
 adminOpenModal('Editar campaña',`<form id="admin-campaign-edit" class="admin-edit-form"><label>Nombre<input id="ac-name" maxlength="90" required value="${escapeHtml(c.name)}"></label><label>Descripción<textarea id="ac-description" rows="3">${escapeHtml(c.description||'')}</textarea></label><label>Reemplazar portada (opcional)<input id="ac-cover" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="admin-modal-actions"><button type="button" class="secondary-button" id="ac-cancel">Cancelar</button><button class="primary-button" type="submit">Guardar cambios</button></div></form>`);
 $('ac-cancel').onclick=adminCloseModal;$('admin-campaign-edit').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;let path=null;try{const file=$('ac-cover').files[0];if(file){if(file.size>5*1024*1024)throw Error('La portada supera 5 MB.');path=`${session.user.id}/admin-campaign-${crypto.randomUUID()}.${file.name.split('.').pop().toLowerCase()}`;const up=await db.storage.from('roleplay-covers').upload(path,file,{contentType:file.type});if(up.error)throw up.error;}const patch={name:$('ac-name').value.trim(),description:$('ac-description').value.trim()||null};if(path)patch.cover_path=path;const {error}=await db.from('campaigns').update(patch).eq('id',c.id);if(error)throw error;if(path&&c.cover_path)await db.storage.from('roleplay-covers').remove([c.cover_path]);adminCloseModal();await loadAll();toast('Campaña actualizada.');}catch(err){if(path)await db.storage.from('roleplay-covers').remove([path]);toast(err.message,true);}finally{btn.disabled=false;}};
}
async function deleteCampaignAdmin(c){
 if(!confirm(`¿Eliminar la campaña "${c.name}"? Las canciones se conservarán, pero quedarán sin campaña.`))return;
 try{const {error}=await db.from('campaigns').delete().eq('id',c.id);if(error)throw error;if(c.cover_path)await db.storage.from('roleplay-covers').remove([c.cover_path]);await loadAll();toast('Campaña eliminada.');}catch(e){toast(e.message,true);}
}
function renderAdminUsers(){
 const q=($('admin-user-search')?.value||'').toLowerCase(),box=$('admin-users-list');if(!box)return;box.innerHTML='';
 adminUsers.filter(u=>u.username.toLowerCase().includes(q)).forEach(u=>{
  const row=document.createElement('div');row.className='admin-row user-admin-row';const avatar=document.createElement('div');avatar.className='admin-avatar';avatar.textContent=(u.username||'?').slice(0,1).toUpperCase();const info=document.createElement('div');info.className='admin-row-info';const name=document.createElement('strong');name.textContent=u.username;const small=document.createElement('small');small.textContent=u.id===session.user.id?'Tu cuenta · '+u.role:'Miembro · '+u.role;info.append(name,small);const actions=document.createElement('div');actions.className='admin-row-actions';
  if(u.id===session.user.id){const tag=document.createElement('span');tag.className='admin-self-tag';tag.textContent='Tú';actions.append(tag);}else{const edit=document.createElement('button');edit.className='secondary-button';edit.textContent='Gestionar';edit.onclick=()=>editUserAdmin(u);const kick=document.createElement('button');kick.className='danger-button';kick.textContent='Expulsar de salas';kick.onclick=()=>kickUserFromRooms(u);actions.append(edit,kick);}
  row.append(avatar,info,actions);box.append(row);
 });
 if(!box.children.length)box.innerHTML='<div class="empty-state">No hay usuarios que coincidan.</div>';
}
function editUserAdmin(u){
 adminOpenModal('Gestionar usuario',`<form id="admin-user-edit" class="admin-edit-form"><label>Nombre visible<input id="au-name" maxlength="30" minlength="2" required value="${escapeHtml(u.username)}"></label><label>Permisos<select id="au-role"><option value="member" ${u.role==='member'?'selected':''}>Miembro</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option></select></label><p class="helper-text">Los cambios de rol se aplican en la base de datos. No compartas permisos de administrador con personas de confianza dudosa.</p><div class="admin-modal-actions"><button type="button" class="secondary-button" id="au-cancel">Cancelar</button><button class="primary-button" type="submit">Guardar usuario</button></div></form>`);
 $('au-cancel').onclick=adminCloseModal;$('admin-user-edit').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const {error}=await db.rpc('admin_update_profile',{p_user_id:u.id,p_username:$('au-name').value.trim(),p_role:$('au-role').value});if(error)throw error;adminCloseModal();await refreshAdmin();toast('Usuario actualizado.');}catch(err){toast(err.message,true);}finally{btn.disabled=false;}};
}
async function kickUserFromRooms(u){
 if(!confirm(`¿Expulsar a ${u.username} de todas las salas?`))return;
 try{const {error}=await db.from('room_members').delete().eq('user_id',u.id);if(error)throw error;await refreshAdmin();toast('Usuario expulsado de sus salas actuales.');}catch(e){toast(e.message,true);}
}
function renderAdminRooms(){
 const box=$('admin-rooms-list');if(!box)return;box.innerHTML='';
 adminRooms.forEach(r=>{const row=document.createElement('div');row.className='admin-row';const avatar=document.createElement('div');avatar.className='admin-avatar';avatar.textContent='◉';const info=document.createElement('div');info.className='admin-row-info';const name=document.createElement('strong');name.textContent=r.name;const camp=campaigns.find(c=>c.id===r.campaign_id);const small=document.createElement('small');small.textContent=`Código ${r.room_code} · ${camp?camp.name:'Sala general'}`;info.append(name,small);const actions=document.createElement('div');actions.className='admin-row-actions';const del=document.createElement('button');del.className='danger-button';del.textContent='Cerrar sala';del.onclick=async()=>{if(!confirm(`¿Cerrar la sala "${r.name}"?`))return;try{const {error}=await db.from('rooms').delete().eq('id',r.id);if(error)throw error;await refreshAdmin();toast('Sala cerrada.');}catch(e){toast(e.message,true);}};actions.append(del);row.append(avatar,info,actions);box.append(row);});
 if(!adminRooms.length)box.innerHTML='<div class="empty-state">No hay salas creadas.</div>';
}
$('admin-song-search').addEventListener('input',renderAdminSongs);
$('admin-user-search').addEventListener('input',renderAdminUsers);
