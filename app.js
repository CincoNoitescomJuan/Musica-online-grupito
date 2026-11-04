
const CONFIG=window.ROLEPLAY_MUSIC_CONFIG||{},sb=window.supabase,$=id=>document.getElementById(id),audio=$('audio-player');
let db=null,session=null,profile=null,songs=[],campaigns=[],currentIndex=-1,currentCampaignFilter=null,lyricLines=[],timedLyrics=[];
const localVolume=Number(localStorage.getItem('roleplay_music_volume')??'0.8');
function toast(m,e=false){const x=$('toast');x.textContent=m;x.classList.remove('hidden','error');if(e)x.classList.add('error');clearTimeout(toast.t);toast.t=setTimeout(()=>x.classList.add('hidden'),4500);}
function showView(v){['library','campaigns','rooms','upload','profile'].forEach(x=>$(x+'-view').classList.toggle('hidden',x!==v));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('page-title').textContent=({library:'Biblioteca musical',campaigns:'Campañas',rooms:'Salas de escucha',upload:'Añadir canción',profile:'Mi perfil'})[v];}
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
$('song-audio').onchange=()=>{const f=$('song-audio').files[0];if(!f)return;if(previewObjectUrl)URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=URL.createObjectURL(f);$('lyric-preview').src=previewObjectUrl;lyricLines=$('song-lyrics').value.split('\n').map(x=>x.trim()).filter(Boolean);timedLyrics=[];renderTimingList();};
$('song-lyrics').oninput=()=>{lyricLines=$('song-lyrics').value.split('\n').map(x=>x.trim()).filter(Boolean);timedLyrics=timedLyrics.filter(x=>lyricLines.includes(x.text));renderTimingList();};
$('mark-lyric').onclick=()=>{lyricLines=$('song-lyrics').value.split('\n').map(x=>x.trim()).filter(Boolean);const next=lyricLines[timedLyrics.length];if(!next)return toast('No quedan líneas por marcar.');const t=$('lyric-preview').currentTime;if(timedLyrics.length&&t<=timedLyrics[timedLyrics.length-1].time)return toast('Avanza un poco la canción antes de marcar la siguiente línea.',true);timedLyrics.push({time:Number(t.toFixed(2)),text:next});renderTimingList();};
$('reset-lyric-times').onclick=()=>{timedLyrics=[];renderTimingList();};
function renderTimingList(){$('lyric-timing-list').innerHTML=timedLyrics.length?timedLyrics.map((l,i)=>`<div><span>${fmt(l.time)}</span><span>${escapeHtml(l.text)}</span><button type="button" data-remove-line="${i}">×</button></div>`).join(''):'Aún no hay líneas marcadas.';document.querySelectorAll('[data-remove-line]').forEach(b=>b.onclick=()=>{timedLyrics.splice(Number(b.dataset.removeLine),1);renderTimingList();});}
$('song-form').onsubmit=async e=>{e.preventDefault();const af=$('song-audio').files[0],cf=$('song-cover').files[0];if(!af)return toast('Selecciona un audio.',true);if(af.size>50*1024*1024||cf&&cf.size>5*1024*1024)return toast('Audio máximo 50 MB y portada máximo 5 MB.',true);const btn=e.submitter;btn.disabled=true;const id=crypto.randomUUID(),ext=f=>(f.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'')||'bin',ap=`${session.user.id}/${id}.${ext(af)}`;let cp=null;try{let r=await db.storage.from('roleplay-audio').upload(ap,af,{contentType:af.type||'audio/mpeg'});if(r.error)throw r.error;if(cf){cp=`${session.user.id}/${id}.${ext(cf)}`;r=await db.storage.from('roleplay-covers').upload(cp,cf,{contentType:cf.type});if(r.error)throw r.error;}const campaignId=$('song-campaign-id').value||null;const {error}=await db.from('songs').insert({title:$('song-title').value.trim(),artist:$('song-artist').value.trim()||null,campaign:campaigns.find(c=>c.id===campaignId)?.name||null,campaign_id:campaignId,description:$('song-description').value.trim()||null,lyrics:$('song-lyrics').value||null,lyrics_timed:timedLyrics,audio_path:ap,cover_path:cp,created_by:session.user.id});if(error)throw error;e.target.reset();timedLyrics=[];lyricLines=[];renderTimingList();$('lyric-preview').removeAttribute('src');await loadAll();showView('library');currentCampaignFilter=campaignId;renderSongs();toast('¡Canción subida a la biblioteca!');}catch(err){await db.storage.from('roleplay-audio').remove([ap]);if(cp)await db.storage.from('roleplay-covers').remove([cp]);toast(err.message,true);}finally{btn.disabled=false;}};
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
  const {data,error}=await db.from('rooms').insert({name,room_code:code,campaign_id:campaignId,created_by:session.user.id,current_song_id:null,is_playing:false,position_seconds:0}).select().single();
  if(error)throw error;
  $('create-room-form').reset();await enterRoom(data);toast('Sala creada. Comparte el código con tus amigos.');
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
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${room.id}`},payload=>{activeRoom=payload.new;applyRemoteRoomState(payload.new);})
  .subscribe(status=>{$('room-sync-status').textContent=status==='SUBSCRIBED'?'● Sincronización en directo':'Conectando…';});
 await applyRemoteRoomState(room);
 if(roomHeartbeat)clearInterval(roomHeartbeat);
 roomHeartbeat=setInterval(()=>{if(activeRoom&&audio&&!audio.paused&&currentRoomSong()){publishRoomState(false).catch(()=>{});}},12000);
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
 const box=$('karaoke-lines'),timed=Array.isArray(song.lyrics_timed)?song.lyrics_timed:[];
 if(!timed.length){box.innerHTML=song.lyrics?`<p class="karaoke-placeholder">Esta canción todavía no tiene tiempos marcados.</p><div class="plain-lyrics">${escapeHtml(song.lyrics).replace(/\n/g,'<br>')}</div>`:'<p class="karaoke-placeholder">Esta canción todavía no tiene letra.</p>';return;}
 box.innerHTML=timed.map((l,i)=>`<p class="karaoke-line" data-kline="${i}">${escapeHtml(l.text)}</p>`).join('');
}
const previousUpdateKaraoke=updateKaraoke;
updateKaraoke=function(){
 if(activeRoom&&currentRoomSong()){const timed=Array.isArray(currentRoomSong().lyrics_timed)?currentRoomSong().lyrics_timed:[];let active=-1;for(let i=0;i<timed.length;i++){if(audio.currentTime>=Number(timed[i].time))active=i;else break;}document.querySelectorAll('.karaoke-line').forEach((el,i)=>{el.classList.toggle('current',i===active);el.classList.toggle('past',i<active);el.classList.toggle('upcoming',i>active);if(i===active)el.scrollIntoView({behavior:'smooth',block:'center'});});}
 else previousUpdateKaraoke();
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
