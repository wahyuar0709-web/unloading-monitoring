
'use strict';
/* ================= KONFIG & STATE ================= */
var LS = { URL:'unl_url', USER:'unl_user', PASS:'unl_pass', MODE:'unl_mode' };
var SATUAN_OPTS = ['Pallet','Palet','Bags','box','Dus','Drum','pcs','tanki','Pail','Roll','Unit','Lainnya'];
var TEMUAN_FALLBACK = ['TIDAK ADA (NORMAL)','Actual tidak sama dengan surat jalan','Barang rusak','Kemasan rusak / bocor','Dokumen tidak lengkap','Lainnya'];
var ST_LIST = ['Dijadwalkan','Tiba','Sedang Bongkar','Selesai','Dibatalkan'];
var ST_CLS = {'Dijadwalkan':'bg-sched','Tiba':'bg-tiba','Sedang Bongkar':'bg-work','Selesai':'bg-done','Dibatalkan':'bg-cancel'};
var ST_BORD = {'Dijadwalkan':'','Tiba':'st-Tiba','Sedang Bongkar':'st-SedangBongkar','Selesai':'st-Selesai','Dibatalkan':'st-Dibatalkan'};

var S = {
  me:null, cred:{u:'',p:''}, settings:{}, suppliers:[], operators:[],
  visits:[], users:[], audit:[], temuanOpts:TEMUAN_FALLBACK,
  jumlahDock:3, serverDelta:0,
  mode:'operasi', tab:'queue', sumber:'walkin', adminTab:'users',
  refreshTimer:null, clockTimer:null, tickTimer:null, rfCount:0, spinning:false,
  knownIds:null, lateSet:new Set(), firstLoad:true,
  fDash:{date:'',vendor:'',status:''}, fMon:{date:'',vendor:'',status:''},
  lastUpdate:null, audioCtx:null
};

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function pad2(n){ return n<10?'0'+n:''+n; }
function ic(n,c){ return '<svg class="ic'+(c?' '+c:'')+'" aria-hidden="true"><use href="#i-'+n+'"/></svg>'; }

/* ================= TEMA ================= */
var THEME_KEY='unl_theme';
function themePref(){
  var t=localStorage.getItem(THEME_KEY);
  if(!t) t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
  return t;
}
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  var b=$('btnTheme');
  if(b){ b.innerHTML=ic(t==='dark'?'sun':'moon'); b.title=(t==='dark'?'Mode terang':'Mode gelap'); }
}
applyTheme(themePref());

/* ================= WAKTU ================= */
function nowMs(){ return Date.now()+S.serverDelta; }
function ymdJak(ms){ var d=new Date(ms+7*3600000); return d.toISOString().slice(0,10); }
function todayJak(){ return ymdJak(nowMs()); }
function fmtHM(iso){ if(!iso)return '-'; try{return new Date(iso).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});}catch(e){return '-';} }
function fmtDT(iso){ if(!iso)return '-'; var d=new Date(iso); try{return d.toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short'})+' '+fmtHM(iso);}catch(e){return '-';} }
function minsSince(iso,base){ if(!iso)return null; var ms=base-nowMsOf(iso); return Math.floor(ms/60000); }
function nowMsOf(iso){ return Date.parse(iso)||Date.now(); }
function durStr(m){ if(m==null)return '-'; var h=Math.floor(m/60), r=m%60; return h>0 ? h+'j '+pad2(r)+'m' : r+' mnt'; }

/* ================= API ================= */
function apiUrl(action,params){
  var base = localStorage.getItem(LS.URL)||'';
  var q = '?action='+encodeURIComponent(action);
  Object.keys(params||{}).forEach(function(k){ if(params[k]!==''&&params[k]!=null) q+='&'+encodeURIComponent(k)+'='+encodeURIComponent(params[k]); });
  q += '&username='+encodeURIComponent(S.cred.u)+'&password='+encodeURIComponent(S.cred.p);
  return base+q;
}
function handleServerDelta(j){ if(j&&j.server_time){ var st=Date.parse(j.server_time); if(!isNaN(st)) S.serverDelta=st-Date.now(); } }
function authFail(msg){ return String(msg||'').indexOf('AUTH:')===0; }

async function callFetch(url,opt){
  var res = await fetch(url,opt);
  var j = await res.json();
  handleServerDelta(j);
  if(!j.ok) throw new Error(j.error||'Kesalahan server');
  return j;
}
async function apiGet(action,params){
  if(!localStorage.getItem(LS.URL)) throw new Error('URL Web App belum diisi.');
  return callFetch(apiUrl(action,params),{method:'GET',redirect:'follow'});
}
async function apiPost(action,payload){
  var base = localStorage.getItem(LS.URL);
  if(!base) throw new Error('URL Web App belum diisi.');
  var body = {action:action};
  Object.keys(payload||{}).forEach(function(k){ body[k]=payload[k]; });
  body.username=S.cred.u; body.password=S.cred.p;
  return callFetch(base,{method:'POST',redirect:'follow',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(body)});
}
async function apiLogin(u,p){
  var base = localStorage.getItem(LS.URL);
  if(!base) throw new Error('URL Web App belum diisi. Klik "URL Web App" di atas.');
  var res = await fetch(base,{method:'POST',redirect:'follow',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'login',username:u,password:p})});
  var j = await res.json();
  if(!j.ok) throw new Error(j.error||'Login gagal');
  handleServerDelta(j);
  return j.data;
}

/* ================= TOAST & MODAL ================= */
function toast(msg,type,retryCb){
  var t=document.createElement('div');
  t.className='toast'+(type==='err'?' err':type==='ok'?' ok':'');
  var icon=type==='err'?ic('alert'):type==='ok'?ic('check-c'):ic('clock');
  t.innerHTML=icon+'<span style="flex:1">'+esc(msg)+'</span>';
  if(retryCb){ var b=document.createElement('button'); b.className='retry'; b.textContent='↳ Coba Lagi';
    b.onclick=function(){ t.remove(); retryCb(); }; t.appendChild(b); }
  $('toastWrap').appendChild(t);
  setTimeout(function(){ t.remove(); }, retryCb?12000:3200);
}
function openModal(title,sub,bodyHtml,onMount,actions){
  var box=$('modalBox');
  box.innerHTML='<h3>'+esc(title)+'</h3>'+(sub?'<div class="msub">'+esc(sub)+'</div>':'')+
    '<div id="mBody">'+bodyHtml+'</div><div class="mfoot" id="mFoot"></div>';
  var foot=$('mFoot');
  (actions||[{label:'Tutup',cls:'sec'}]).forEach(function(a){
    var b=document.createElement('button');
    b.className='btn '+(a.cls||'sec'); b.style.marginTop='0'; b.textContent=a.label;
    b.onclick=function(){ if(a.onClick){ a.onClick(box); } else closeModal(); };
    foot.appendChild(b);
  });
  $('modalOverlay').classList.remove('hide');
  if(onMount) onMount(box);
}
function closeModal(){ $('modalOverlay').classList.add('hide'); $('modalBox').innerHTML=''; }
function confirmDialog(msg,cb,danger){
  openModal('Konfirmasi','', '<p style="font-size:14px">'+esc(msg)+'</p>',null,
    [{label:'Ya, Lanjut',cls:danger?'danger':'',onClick:function(){closeModal();cb();}},
     {label:'Batal',cls:'sec'}]);
}

/* ================= LOGIN FLOW ================= */
function showLogin(errMsg){
  $('appScreen').classList.add('hide'); $('loginScreen').classList.remove('hide');
  stopAllTimers();
  if(errMsg){ var e=$('loginErr'); e.textContent=errMsg; e.classList.remove('hide'); }
  var ub=$('urlBox'); if(!localStorage.getItem(LS.URL)) ub.open=true;
}
async function doLogin(u,p){
  var btn=$('btnLogin'); btn.disabled=true; btn.innerHTML='<span class="spin"></span> Masuk...';
  try{
    var data=await apiLogin(u,p);
    localStorage.setItem(LS.USER,u); localStorage.setItem(LS.PASS,p);
    S.cred={u:u,p:p}; S.me={username:data.username,nama:data.nama,role:data.role};
    S.temuanOpts=(data.temuan_options&&data.temuan_options.length)?data.temuan_options:TEMUAN_FALLBACK;
    enterApp();
  }catch(e){ showLogin(e.message.replace('AUTH: ','')); }
  finally{ btn.disabled=false; btn.textContent='Masuk'; }
}
function enterApp(){
  $('loginScreen').classList.add('hide'); $('appScreen').classList.remove('hide');
  $('loginErr').classList.add('hide');
  $('whoName').textContent=S.me.nama;
  $('whoRole').textContent='Role: '+S.me.role+(S.me.role==='SPB'?' (pantau)':'');
  $('tabAdmin').style.display = S.me.role==='ADMIN'?'':'none';
  document.querySelector('[data-tab="form"]').style.display = canAct()?'':'none';
  if(!canAct()&&S.tab==='form')S.tab='queue';
  if(!isAdmin()&&S.tab==='admin')S.tab='queue';
  setMode(localStorage.getItem(LS.MODE)||(window.innerWidth>=1024?'monitor':'operasi'));
  refreshData(false);
}
function forceLogout(msg){
  localStorage.removeItem(LS.USER); localStorage.removeItem(LS.PASS);
  S.cred={u:'',p:''}; S.me=null; S.knownIds=null; S.lateSet.clear(); S.firstLoad=true;
  S.tab='queue'; S.adminTab='users'; S.sumber='walkin';
  S.visits=[]; S.users=[]; S.audit=[]; S.settings={}; S.suppliers=[]; S.operators=[];
  S.fDash={date:'',vendor:'',status:''}; S.fMon={date:'',vendor:'',status:''};
  showLogin(msg||null);
}

/* ================= DATA LOAD ================= */
async function refreshData(showSpin){
  if(!S.me) return;
  if(showSpin){ S.spinning=true; $('spinBox').innerHTML='<span class="spin"></span>'; }
  $('connDot').className='dot';
  try{
    var j=await apiGet('bootstrap',{});
    var d=j.data||{};
    S.visits=d.visits||[]; S.suppliers=d.suppliers||[];
    S.settings=d.settings||{}; S.jumlahDock=Number(d.jumlah_dock)||3;
    S.lastUpdate=nowMs();
    detectEvents();
    renderAll();
    $('connDot').className='dot';
    S.firstLoad=false;
  }catch(e){
    $('connDot').className='dot off';
    if(authFail(e.message)){ forceLogout('Sesi berakhir: '+e.message.replace('AUTH: ','')); return; }
    toast('Gagal memuat data: '+e.message,'err',function(){ refreshData(true); });
  }finally{
    S.spinning=false; $('spinBox').innerHTML='';
  }
}
function detectEvents(){
  var parah=Number(S.settings['threshold_telat_parah_menit'])||60;
  var seen={}, now=nowMs();
  S.visits.forEach(function(v){
    if(v.status==='Tiba'){
      var w=minsSince(v.aktual_tiba,now);
      if(w!=null&&w>=parah&&!S.lateSet.has(v.kode_kedatangan)){
        S.lateSet.add(v.kode_kedatangan);
        if(!S.firstLoad&&S.mode==='monitor'){ beep(); setTimeout(beep,260); toast(v.no_polisi+' menunggu '+durStr(w)+'!','err'); }
      }
    }
    if(!S.firstLoad&&S.mode==='monitor'&&v.status==='Tiba'&&ymdJak(nowMsOf(v.aktual_tiba||v._ts_iso))===todayJak()){
      if(S.knownIds&&!S.knownIds.has(v.kode_kedatangan)){ beep(); }
    }
    seen[v.kode_kedatangan]=1;
  });
  S.knownIds=S.knownIds||new Set();
  Object.keys(seen).forEach(function(id){ S.knownIds.add(id); });
}

/* ================= TIMERS ================= */
function startTimers(){
  stopAllTimers();
  scheduleRefresh();
  S.clockTimer=setInterval(function(){
    if(S.mode==='monitor'){ $('bigClock').textContent=jktTime(nowMs()); $('bigDate').textContent=jktDate(nowMs()); }
  },1000);
  if(S.mode==='monitor'){ $('bigClock').textContent=jktTime(nowMs()); $('bigDate').textContent=jktDate(nowMs()); }
  S.tickTimer=setInterval(tickRunning,15000);
  updateRfLabel();
  S.rfInt=setInterval(function(){ if(S.rfCount>0){S.rfCount--;updateRfLabel();} },1000);
}
function updateRfLabel(){ if($('rfLeft'))$('rfLeft').textContent=Math.max(0,S.rfCount); }
function scheduleRefresh(){
  if(S.refreshTimer)clearInterval(S.refreshTimer);
  var ms=S.mode==='monitor'?15000:30000;
  S.rfCount=ms/1000;
  S.refreshTimer=setInterval(function(){ if(!document.hidden)refreshData(true); },ms);
}
function stopAllTimers(){
  ['refreshTimer','clockTimer','tickTimer','rfInt'].forEach(function(k){ if(S[k]){clearInterval(S[k]);S[k]=null;} });
}
document.addEventListener('visibilitychange',function(){
  if(!document.hidden&&S.me){ refreshData(false); scheduleRefresh(); }
});
function jktTime(ms){ try{return new Date(ms).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch(e){return new Date(ms).toTimeString().slice(0,8);} }
function jktDate(ms){ try{return new Date(ms).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',weekday:'long',day:'numeric',month:'long',year:'numeric'});}catch(e){return '';} }
function beep(){
  try{
    S.audioCtx=S.audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    var c=S.audioCtx; if(c.state==='suspended')c.resume();
    var o=c.createOscillator(),g=c.createGain();
    o.type='square'; o.frequency.value=880; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(.07,c.currentTime); o.start(); o.stop(c.currentTime+.16);
  }catch(e){}
}
function tickRunning(){
  document.querySelectorAll('[data-runstart]').forEach(function(elm){
    var b=elm.querySelector('b'); if(!b)return;
    var m=minsSince(elm.getAttribute('data-runstart'),nowMs());
    if(m!=null)b.textContent=durStr(Math.max(0,m));
  });
}

/* ================= RENDER ROOT ================= */
function renderAll(){
  if(!S.me)return;
  fillVendorSelects();
  var isMon=S.mode==='monitor';
  $('viewMonitor').classList.toggle('hide',!isMon);
  $('tabsBar').style.display=isMon?'none':'';
  if(isMon){ renderMonitor(); return; }
  ['queue','form','dash','admin'].forEach(function(t){
    $('view'+t.charAt(0).toUpperCase()+t.slice(1)).classList.toggle('hide',S.tab!==t);
  });
  if(S.tab==='queue')renderQueue();
  if(S.tab==='dash')renderDash();
  if(S.tab==='form')renderFormHint();
  if(S.tab==='admin')renderAdmin();
}
function fillVendorSelects(){
  var opts='<option value="">-- Pilih Supplier --</option>'+S.suppliers.map(function(v){return '<option>'+esc(v)+'</option>';}).join('');
  var key=S.suppliers.join('\u0001');
  if(S._supKey!==key){ S._supKey=key; var e=$('fVendor'); if(e)e.innerHTML=opts; }
}

/* ================= QUEUE (OPERASI) ================= */
function canAct(){ return S.me&&(S.me.role==='ADMIN'||S.me.role==='OPERATOR'); }
function isAdmin(){ return S.me&&S.me.role==='ADMIN'; }
function todayVisits(){
  var td=todayJak();
  return S.visits.filter(function(v){
    var d=v.tanggal_kedatangan||v._ts_iso;
    return d&&ymdJak(nowMsOf(d))===td;
  });
}
function runningBongkarMin(v){
  if(v.status!=='Sedang Bongkar'||!v.mulai_bongkar)return null;
  var m=minsSince(v.mulai_bongkar,nowMs());
  var bs=v.break_start,be=v.break_end;
  if(bs&&!be){ var cur=minsSince(bs,nowMs()); m-=cur; }
  else if(bs&&be){ m-=(nowMsOf(be)-nowMsOf(bs))/60000; }
  return Math.max(0,Math.round(m));
}
function cardHtml(v){
  var late=false,tm='',hot=false;
  if(v.status==='Tiba'&&v.aktual_tiba){
    var w=minsSince(v.aktual_tiba,nowMs());
    tm=ic('clock')+' Menunggu <b>'+durStr(w)+'</b>';
    var parah=Number(S.settings['threshold_telat_parah_menit'])||60;
    if(w>=parah){late=true;hot=true;}
    else{ var tpt=Number(S.settings['threshold_tepat_waktu_menit'])||15; if(w>tpt)tm+=' <span style="opacity:.75;font-weight:600">(melewati batas normal)</span>'; }
  }else if(v.status==='Sedang Bongkar'&&v.mulai_bongkar){
    var b=runningBongkarMin(v);
    tm=ic('activity')+' Bongkar berjalan <b>'+durStr(b)+'</b>'+(v.break_start&&!v.break_end?' '+ic('coffee')+' istirahat':'');
    if(v.dock)tm+=' | Dock '+v.dock;
  }else if(v.status==='Selesai'){
    tm=ic('clock')+' Tunggu '+durStr(v.durasi_tunggu_menit)+' | Bongkar '+durStr(v.durasi_bongkar_menit);
  }else if(v.status==='Dijadwalkan'&&v.plan_tiba){
    var diff=Math.round((nowMsOf(v.plan_tiba)-nowMs())/60000);
    tm=ic('calendar')+(diff>0?' Rencana tiba dalam <b>'+durStr(diff)+'</b>':' <span style="color:var(--bad)">Rencana tiba terlewat '+durStr(-diff)+' lalu</span>');
    if(diff<-30)late=true;
  }
  var badges='<span class="badge '+ST_CLS[v.status]+'">'+esc(v.status)+'</span>'+
    (v.sumber==='Walk-in'?'<span class="badge bg-gray">Walk-in</span>':'<span class="badge bg-gray">Jadwal</span>')+
    (v.jenis_transaksi==='Retur'?'<span class="badge bg-gray">Retur</span>':'')+
    (v.qty?'<span class="badge bg-gray">'+esc(v.qty+' '+(v.satuan||''))+'</span>':'');
  var ops=[];
  if(v.operator_tiba)ops.push('Tiba: '+v.operator_tiba);
  if(v.operator_bongkar)ops.push('Bongkar: '+v.operator_bongkar);
  var acts='';
  if(canAct()){
    if(v.status==='Dijadwalkan'){
      acts+='<button class="a-blue" data-act="tiba" data-id="'+esc(v.kode_kedatangan)+'">'+ic('truck')+' Truk Tiba</button>';
      if(isAdmin())acts+='<button class="a-gray" data-act="edit" data-id="'+esc(v.kode_kedatangan)+'" title="Koreksi data" aria-label="Koreksi data">'+ic('pencil')+'</button>'+
        '<button class="a-red" data-act="batal" data-id="'+esc(v.kode_kedatangan)+'">Batalkan</button>';
    }else if(v.status==='Tiba'){
      acts+='<button class="a-amber" data-act="mulai" data-id="'+esc(v.kode_kedatangan)+'">'+ic('play')+' Mulai Bongkar</button>';
      if(isAdmin())acts+='<button class="a-gray" data-act="edit" data-id="'+esc(v.kode_kedatangan)+'" title="Koreksi data" aria-label="Koreksi data">'+ic('pencil')+'</button>';
    }else if(v.status==='Sedang Bongkar'){
      if(!v.break_start||v.break_end)acts+='<button class="a-gray" data-act="jeda" data-id="'+esc(v.kode_kedatangan)+'">'+ic('coffee')+' Jeda Istirahat</button>';
      else acts+='<button class="a-gray" data-act="lanjut" data-id="'+esc(v.kode_kedatangan)+'">'+ic('play')+' Lanjut Kerja</button>';
      acts+='<button class="a-green" data-act="selesai" data-id="'+esc(v.kode_kedatangan)+'">'+ic('flag')+' Selesaikan</button>';
    }
  }
  var runAttr='';
  if(v.status==='Tiba'&&v.aktual_tiba)runAttr=' data-runstart="'+esc(v.aktual_tiba)+'"';
  else if(v.status==='Sedang Bongkar'&&v.mulai_bongkar)runAttr=' data-runstart="'+esc(v.mulai_bongkar)+'"';
  return '<div class="trk '+(ST_BORD[v.status]||'')+(late?' late':'')+'" data-id="'+esc(v.kode_kedatangan)+'">'+
    '<div class="row1"><span class="plate">'+esc(v.no_polisi||'-')+'</span>'+badges+'</div>'+
    '<div class="meta"><b>'+esc(v.vendor||'-')+'</b>'+
    (v.kode_kedatangan?'<br><span style="font-size:11px">'+esc(v.kode_kedatangan)+'</span>':'')+
    (v.nama_supir?'<br>'+ic('user')+' '+esc(v.nama_supir):'')+
    (v.no_surat_jalan?'<br>'+ic('file')+' SJ: '+esc(v.no_surat_jalan):'')+
    ((v.break_start)?'<br>'+ic('coffee')+' Istirahat: '+fmtHM(v.break_start)+(v.break_end?' - '+fmtHM(v.break_end)+' ('+Math.round((nowMsOf(v.break_end)-nowMsOf(v.break_start))/60000)+'m)':' - sekarang'):'')+
    (ops.length?'<br>'+esc(ops.join(' | ')):'')+
    '</div>'+
    (tm?'<div class="timer'+(hot?' hot':'')+'"'+runAttr+'>'+tm+'</div>':'')+
    (v.temuan&&v.temuan!=='TIDAK ADA (NORMAL)'?'<div class="meta" style="color:var(--bad)">'+ic('alert')+' '+esc(v.temuan)+'</div>':'')+
    (acts?'<div class="acts">'+acts+'</div>':'')+
    '</div>';
}
function renderQueue(){
  if(S.firstLoad&&!S.visits.length){
    var sk=''; for(var q=0;q<3;q++)sk+='<div class="skel"></div>';
    var colHtml=''; for(var c2=0;c2<4;c2++)colHtml+='<div><div class="col-h">'+ic('clock')+' &nbsp;</div>'+sk+'</div>';
    $('queueCols').innerHTML=colHtml;
    return;
  }
  var tv=todayVisits();
  var cols=[
    {t:'Dijadwalkan',ico:'calendar'},{t:'Tiba',ico:'truck'},
    {t:'Sedang Bongkar',ico:'activity'},{t:'Selesai',ico:'check-c'}
  ];
  var html=cols.map(function(c){
    var arr=tv.filter(function(v){return v.status===c.t;})
      .sort(function(a,b){return (a.dock||99)-(b.dock||99)||String(a.aktual_tiba||a.plan_tiba||'').localeCompare(String(b.aktual_tiba||b.plan_tiba||''));});
    return '<div><div class="col-h">'+ic(c.ico)+' '+c.t+' <span class="n">'+arr.length+'</span></div>'+
      (arr.map(cardHtml).join('')||'<div class="empty">Kosong</div>')+'</div>';
  }).join('');
  var canc=tv.filter(function(v){return v.status==='Dibatalkan';});
  if(canc.length)html+='<div style="grid-column:1/-1"><div class="col-h">'+ic('ban')+' Dibatalkan <span class="n">'+canc.length+'</span></div>'+canc.map(cardHtml).join('')+'</div>';
  $('queueCols').innerHTML=html;
}

/* ================= AKSI TRUCK ================= */
async function actTruk(act,id,extra){
  if(S.busy){toast('Masih ada proses berjalan, tunggu sebentar...','');return;}
  S.busy=true;
  try{
    var payload={kode_kedatangan:id};
    if(extra)Object.keys(extra).forEach(function(k){payload[k]=extra[k];});
    await apiPost(act,payload);
    toast('Berhasil: '+act,'ok');
    await refreshData(true);
  }catch(e){
    if(authFail(e.message)){forceLogout(e.message.replace('AUTH: ',''));return;}
    toast(e.message,'err',function(){actTruk(act,id,extra);});
  }finally{S.busy=false;}
}
function findVisit(id){ return S.visits.filter(function(v){return v.kode_kedatangan===id;})[0]; }

function modalMulai(v){
  var occupied={};
  S.visits.forEach(function(x){ if(x.status==='Sedang Bongkar'&&x.kode_kedatangan!==v.kode_kedatangan&&x.dock)occupied[x.dock]=1; });
  var opts='';
  for(var i=1;i<=S.jumlahDock;i++){
    var dis=occupied[i]?' disabled':'' ;
    opts+='<option value="'+i+'"'+dis+'>'+(dis?'Dock '+i+' (terpakai)':'Dock '+i)+'</option>';
  }
  openModal('Mulai Bongkar',v.no_polisi+' - '+v.vendor,
    '<label>Pilih Dock/Bay <span style="color:var(--bad)">*</span></label><select id="mDock">'+opts+'</select>',
    function(){ $('mDock').focus(); },
    [{label:ic('play')+' Mulai',cls:'',onClick:function(){
        var d=$('mDock').value; if(!d){toast('Pilih dock dulu','err');return;}
        closeModal(); actTruk('markMulaiBongkar',v.kode_kedatangan,{dock:d});
      }},{label:'Batal',cls:'sec'}]);
}
function modalSelesai(v){
  var satuan=SATUAN_OPTS.map(function(s){return '<option>'+s+'</option>';}).join('');
  var temuan=S.temuanOpts.map(function(t,i){return '<label class="rdo'+(i===0?' sel':'')+'"><input type="radio" name="mTemuan" value="'+esc(t)+'"'+(i===0?' checked':'')+'> '+esc(t)+'</label>';}).join('');
  openModal('Selesaikan Bongkar',v.no_polisi+' - '+v.vendor,
    '<label>QTY <span style="color:var(--bad)">*</span></label><input id="mQty" type="number" min="1" step="any" inputmode="decimal" placeholder="Contoh: 34">'+
    '<label>Satuan <span style="color:var(--bad)">*</span></label><select id="mSat">'+satuan+'</select>'+
    '<label>Temuan Abnormal <span style="color:var(--bad)">*</span></label><div class="radio-set" id="radTemuan">'+temuan+'</div>'+
    '<label>Keterangan tambahan</label><input id="mKat" placeholder="Opsional">',
    function(){
      $('mQty').focus();
      $('radTemuan').addEventListener('click',function(ev){
        var l=ev.target.closest('label.rdo'); if(!l)return;
        this.querySelectorAll('label.rdo').forEach(function(x){x.classList.remove('sel');});
        l.classList.add('sel');
      });
    },
    [{label:ic('flag')+' Konfirmasi Selesai',cls:'',onClick:function(){
        var q=Number($('mQty').value);
        if(!q||q<=0){toast('QTY wajib diisi angka > 0','err');return;}
        var t=document.querySelector('input[name="mTemuan"]:checked');
        if(!t){toast('Pilih temuan abnormal','err');return;}
        closeModal(); actTruk('markSelesaiBongkar',v.kode_kedatangan,{qty:q,satuan:$('mSat').value,temuan:t.value,keterangan:$('mKat').value});
      }},{label:'Batal',cls:'sec'}]);
}
function modalEdit(v){
  openModal('Koreksi Data (Admin)',v.kode_kedatangan,
    '<label>Supplier</label><input id="eVend" value="'+esc(v.vendor)+'" list="dlSup"><datalist id="dlSup">'+S.suppliers.map(function(s){return '<option>'+esc(s);}).join('')+'</datalist>'+
    '<label>No. Polisi</label><input id="ePol" value="'+esc(v.no_polisi)+'" style="text-transform:uppercase">'+
    '<label>Nama Supir</label><input id="eSupir" value="'+esc(v.nama_supir||'')+'">'+
    '<label>No. Surat Jalan</label><input id="eSJ" value="">'+
    '<label>Catatan koreksi</label><input id="eCat" placeholder="Alasan perubahan (masuk audit log)">',
    null,
    [{label:ic('save')+' Simpan Koreksi',cls:'',onClick:function(){
        var pay={kode_kedatangan:v.kode_kedatangan};
        if($('eVend').value&&$('eVend').value!==v.vendor)pay.supplier=$('eVend').value;
        if($('ePol').value&&$('ePol').value.toUpperCase()!==String(v.no_polisi||'').toUpperCase())pay.no_polisi=$('ePol').value.toUpperCase();
        if($('eSupir').value!==String(v.nama_supir||''))pay.nama_supir=$('eSupir').value;
        if($('eSJ').value)pay.no_surat_jalan=$('eSJ').value;
        if($('eCat').value)pay.catatan=$('eCat').value;
        if(Object.keys(pay).length<2){toast('Tidak ada perubahan','err');return;}
        closeModal(); actTruk('editVisit',v.kode_kedatangan,pay);
      }},{label:'Batal',cls:'sec'}]);
}

/* ================= DASHBOARD (OPERASI) ================= */
function computeStats(list){
  var st={total:list.length,Dijadwalkan:0,Tiba:0,'Sedang Bongkar':0,Selesai:0,Dibatalkan:0};
  var tw=[],tb=[],tepat=0,fin=0;
  var tpt=Number(S.settings['threshold_tepat_waktu_menit'])||15;
  var docks={};
  list.forEach(function(v){
    if(st[v.status]!==undefined)st[v.status]++;
    if(v.status==='Sedang Bongkar'&&v.dock)docks[v.dock]=1;
    if(v.status==='Selesai'){
      if(v.durasi_tunggu_menit!=null){tw.push(v.durasi_tunggu_menit);fin++;if(v.durasi_tunggu_menit<=tpt)tepat++;}
      if(v.durasi_bongkar_menit!=null)tb.push(v.durasi_bongkar_menit);
    }
  });
  var avg=function(a){return a.length?Math.round(a.reduce(function(x,y){return x+y;},0)/a.length):null;};
  return {counts:st,avgTunggu:avg(tw),avgBongkar:avg(tb),
    tepatPct:fin?Math.round(tepat/fin*100):null,dockUsed:Object.keys(docks).length};
}
function statCards(st){
  return [
    {l:'Total Truk Hari Ini',v:st.counts.total,c:''},
    {l:'Belum/Bongkar Berjalan',v:st.counts['Tiba']+st.counts['Sedang Bongkar'],c:'warn'},
    {l:'Rata-rata Tunggu',v:durStr(st.avgTunggu),c:st.avgTunggu>(Number(S.settings['threshold_telat_parah_menit'])||60)?'bad':''},
    {l:'Rata-rata Bongkar',v:durStr(st.avgBongkar),c:''},
    {l:'Tepat Waktu (≤'+(Number(S.settings['threshold_tepat_waktu_menit'])||15)+'m)',v:st.tepatPct==null?'-':st.tepatPct+'%',c:'ok'},
    {l:'Dock Terpakai',v:st.dockUsed+'/'+S.jumlahDock,c:''}
  ];
}
function statsHtml(cards){
  return cards.map(function(c){return '<div class="stat '+c.c+'"><div class="v">'+esc(c.v)+'</div><div class="l">'+esc(c.l)+'</div></div>';}).join('');
}
function applyFilters(list,f){
  return list.filter(function(v){
    var okDate=!f.date||ymdJak(nowMsOf(v.tanggal_kedatangan||v._ts_iso))===f.date;
    var okVen=!f.vendor||String(v.vendor||'').toLowerCase().indexOf(f.vendor.toLowerCase())!==-1;
    var okSt=!f.status||v.status===f.status;
    return okDate&&okVen&&okSt;
  });
}
function rowForTable(v){
  return '<tr><td>'+fmtDT(v.tanggal_kedatangan||v._ts_iso)+'</td><td><b>'+esc(v.no_polisi||'-')+'</b></td><td>'+esc(v.vendor||'')+'</td>'+
    '<td class="col-opt">'+esc(v.jenis_transaksi||'')+'</td><td class="col-opt">'+esc(v.sumber||'')+'</td>'+
    '<td>'+fmtHM(v.plan_tiba)+'</td><td>'+fmtHM(v.aktual_tiba)+'</td><td>'+fmtHM(v.mulai_bongkar)+'</td><td>'+fmtHM(v.selesai_bongkar)+'</td>'+
    '<td>'+(v.dock||'-')+'</td><td>'+(v.qty!=null?esc(v.qty+' '+(v.satuan||'')):'-')+'</td>'+
    '<td class="col-opt">'+(v.durasi_tunggu_menit!=null?v.durasi_tunggu_menit:'-')+'</td><td class="col-opt">'+(v.durasi_bongkar_menit!=null?v.durasi_bongkar_menit:'-')+'</td>'+
    '<td><span class="badge '+ST_CLS[v.status]+'">'+esc(v.status)+'</span></td>'+
    '<td class="col-opt">'+esc(v.operator_tiba||'-')+'</td><td class="col-opt">'+esc(v.operator_bongkar||'-')+'</td>'+
    '<td>'+esc(v.temuan||'')+'</td></tr>';
}
var TABLE_HEAD='<thead><tr><th>Tanggal</th><th>No. Polisi</th><th>Supplier</th><th class="col-opt">Jenis</th><th class="col-opt">Sumber</th><th>Plan</th><th>Tiba</th><th>Mulai</th><th>Selesai</th><th>Dock</th><th>Qty</th><th class="col-opt">Tunggu(m)</th><th class="col-opt">Bongkar(m)</th><th>Status</th><th class="col-opt">Op Tiba</th><th class="col-opt">Op Bongkar</th><th>Temuan</th></tr></thead>';
function tableHtml(list){
  if(!list.length)return TABLE_HEAD+'<tbody><tr><td colspan="17" style="text-align:center;color:var(--muted);padding:20px">Tidak ada data</td></tr></tbody>';
  return TABLE_HEAD+'<tbody>'+list.map(rowForTable).join('')+'</tbody>';
}
function renderDash(){
  renderTrend(S.visits);
  var f=S.fDash=readFilters('dDate','dVendor','dStatus');
  var isDefault=(!f.date||f.date===todayJak())&&!f.vendor&&!f.status;
  var list=isDefault?todayVisits():applyFilters(S.visits,f);
  S.dashList=list;
  var cards=statCards(computeStats(list));
  if(!isDefault)cards[0].l='Total Truk Terfilter';
  $('dashStats').innerHTML=statsHtml(cards);
  $('dashTbl').innerHTML=tableHtml(list.slice().sort(byCreated));
}
function renderTrend(src){
  var el=$('trendChart'); if(!el)return;
  var days=[],i,ms,d;
  var DOW=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  for(i=6;i>=0;i--){
    ms=nowMs()-i*86400000; d=new Date(ms+7*3600000);
    days.push({k:ymdJak(ms), l:DOW[d.getUTCDay()]+' '+d.getUTCDate()+'/'+(d.getUTCMonth()+1)});
  }
  var cnt={},sum={},n={};
  days.forEach(function(x){cnt[x.k]=0;});
  src.forEach(function(v){
    if(v.status!=='Selesai')return;
    var base=v.selesai_bongkar||v.tanggal_kedatangan||v._ts_iso;
    if(!base)return;
    var t=Date.parse(base); if(isNaN(t))return;
    var k=ymdJak(t);
    if(!(k in cnt))return;
    cnt[k]++;
    if(v.durasi_bongkar_menit!=null){sum[k]=(sum[k]||0)+v.durasi_bongkar_menit;n[k]=(n[k]||0)+1;}
  });
  var max=1; days.forEach(function(x){ if(cnt[x.k]>max)max=cnt[x.k]; });
  el.innerHTML=days.map(function(x){
    var c=cnt[x.k], avg=n[x.k]?Math.round(sum[x.k]/n[x.k]):null;
    return '<div class="bar-w" title="'+x.l+': '+c+' truk selesai'+(avg?' &middot; rata-rata bongkar '+durStr(avg):'')+'">'+
      '<span class="bar-v">'+c+'</span>'+
      '<div class="bar" style="height:'+Math.max(3,Math.round(c/max*100))+'%"></div>'+
      '<span class="bar-l">'+x.l+'</span></div>';
  }).join('');
}
function readFilters(dId,vId,sId){
  return {date:$(dId).value.trim(),vendor:$(vId).value.trim(),status:$(sId).value};
}
function byCreated(a,b){ return String(b._ts_iso||'').localeCompare(String(a._ts_iso||'')); }
function csvExport(list,name){
  var head=['Tanggal','No Polisi','Supplier','Jenis','Sumber','Plan Tiba','Aktual Tiba','Mulai Bongkar','Selesai Bongkar','Dock','QTY','Satuan','Durasi Tunggu (mnt)','Durasi Bongkar (mnt)','Status','Operator Tiba','Operator Bongkar','Temuan','Keterangan'];
  var rows=list.map(function(v){
    return [fmtDT(v.tanggal_kedatangan||v._ts_iso),v.no_polisi,v.vendor,v.jenis_transaksi,v.sumber,fmtHM(v.plan_tiba),fmtHM(v.aktual_tiba),fmtHM(v.mulai_bongkar),fmtHM(v.selesai_bongkar),v.dock,v.qty,v.satuan,v.durasi_tunggu_menit,v.durasi_bongkar_menit,v.status,v.operator_tiba,v.operator_bongkar,v.temuan,v.catatan];
  });
  var csv='\uFEFF'+[head].concat(rows).map(function(r){
    return r.map(function(c){c=String(c==null?'':c);return /[",;\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(';');
  }).join('\r\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
  toast('CSV diunduh','ok');
}

/* ================= FORM INPUT TRUK ================= */
function renderFormHint(){
  var schedOk=isAdmin();
  $('segJadwal').style.display=schedOk?'':'none';
  if(!schedOk&&S.sumber==='jadwal')setSumber('walkin');
  $('formHint').textContent=S.sumber==='walkin'
    ?'Catat truk yang datang tanpa jadwal. Langsung berstatus Tiba dengan jam kedatangan sekarang.'
    :'Buat jadwal kedatangan. Truk akan muncul di kolom Dijadwalkan.';
}
function setSumber(v){
  S.sumber=v;
  document.querySelectorAll('#segSumber button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-v')===v);});
  $('wrapPlan').classList.toggle('hide',v!=='jadwal');
  renderFormHint();
}
/**
 * Validasi form truck sebelum submit.
 * @returns {boolean} true jika valid
 */
function validateTruckForm(){
  var vendor=$('fVendor').value.trim();
  var pol=$('fPol').value.trim().toUpperCase();
  // Validasi supplier
  if(!vendor){$('fVendor').focus();toast('Pilih supplier dulu','err');return false;}
  // Validasi no polisi (format: B 1234 XYZ atau similar: huruf/angka/spasi, minimal 3 char)
  var platePattern = /^[A-Z0-9\s]{3,}$/;
  if(!pol){$('fPol').focus();toast('No. polisi wajib diisi','err');return false;}
  if(!platePattern.test(pol)){$('fPol').focus();toast('Format no. polisi tidak valid','err');return false;}
  // Validasi nama supir (opsional tapi jika diisi harus huruf/ruang)
  var supir=$('fSupir').value.trim();
  if(supir && !/^[A-Za-z\s]+$/.test(supir)){$('fSupir').focus();toast('Format nama supir tidak valid','err');return false;}
  // Validasi jenis transaksi
  var jenis=$('fJenis').value;
  if(!jenis){$('fJenis').focus();toast('Pilih jenis transaksi','err');return false;}
  // Validasi rencana tiba (jika jadwal)
  if(S.sumber==='jadwal'){
    if(!$('fPlan').value){$('fPlan').focus();toast('Isi rencana tiba','err');return false;}
  }
  return true;
}

async function submitTruck(){
  if(S.busy)return;
  if(!validateTruckForm())return;
  var vendor=$('fVendor').value,pol=$('fPol').value.trim().toUpperCase();
  var payload={vendor:vendor,no_polisi:pol,nama_supir:$('fSupir').value.trim(),no_po:$('fSJ').value.trim(),jenis_transaksi:$('fJenis').value,catatan:$('fCatatan').value.trim()};
  var btn=$('btnSubmitTruck');
  S.busy=true;btn.disabled=true;
  try{
    if(S.sumber==='jadwal'){
      if(!$('fPlan').value){toast('Isi rencana tiba','err');return;}
      payload.plan_tiba=new Date($('fPlan').value).toISOString();
      await apiPost('createSchedule',payload);
    }else{
      await apiPost('createWalkin',payload);
    }
    ['fPol','fSupir','fSJ','fCatatan'].forEach(function(id){$(id).value='';});
    toast('Truk tersimpan','ok');
    S.tab='queue';renderAll();
    await refreshData(true);
  }catch(e){
    if(authFail(e.message)){forceLogout(e.message.replace('AUTH: ',''));return;}
    toast(e.message,'err',function(){submitTruck();});
  }finally{S.busy=false;btn.disabled=false;}
}

/* ================= ADMIN ================= */
function renderAdmin(){ renderAdminTab(S.adminTab); }
function renderAdminTab(a){
  document.querySelectorAll('#adminNav button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-a')===a);});
  var body=$('adminBody');
  if(a==='users'){ body.innerHTML='<p class="hint">Memuat users...</p>'; loadUsers(); }
  else if(a==='operators')renderOperators(body);
  else if(a==='suppliers'){
    body.innerHTML='<h2>Supplier Aktif ('+S.suppliers.length+')</h2><p class="hint">Kelola langsung di sheet Master Supplier (kolom Status = active).</p>'+
      S.suppliers.map(function(s){return '<div class="list-row"><span class="grow">'+esc(s)+'</span><span class="pill g">active</span></div>';}).join('');
  }
  else if(a==='settings')renderSettings(body);
  else if(a==='audit'){ body.innerHTML='<p class="hint">Memuat log...</p>'; loadAudit(); }
}
async function loadUsers(){
  try{
    var j=await apiGet('users',{});
    S.users=j.data||[];
    var html='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h2>Akun Login</h2><button class="btn small" id="btnAddUser">'+ic('plus')+' Tambah User</button></div>';
    S.users.forEach(function(u){
      html+='<div class="list-row"><div class="grow"><b>'+esc(u.username)+'</b> — '+esc(u.nama)+' <span class="pill b">'+esc(u.role)+'</span></div>'+
        '<span class="pill '+(u.aktif?'g':'r')+'">'+(u.aktif?'aktif':'nonaktif')+'</span>'+
        '<button class="btn small sec" data-uact="reset" data-uname="'+esc(u.username)+'">'+ic('key')+' Reset</button>'+
        '<button class="btn small '+(u.aktif?'danger':'')+'" data-uact="toggle" data-uname="'+esc(u.username)+'" data-cur="'+(u.aktif?'1':'0')+'">'+(u.aktif?'Nonaktifkan':'Aktifkan')+'</button></div>';
    });
    $('adminBody').innerHTML=html;
    $('btnAddUser').onclick=modalAddUser;
    $('adminBody').querySelectorAll('[data-uact]').forEach(function(b){
      b.onclick=function(){
        var un=b.getAttribute('data-uname'),act=b.getAttribute('data-uact');
        if(act==='reset')modalResetPass(un);
        else confirmDialog((b.getAttribute('data-cur')==='1'?'Nonaktifkan':'Aktifkan')+' akun '+un+'?',async function(){
          try{await apiPost('setUserAktif',{username:un,aktif:b.getAttribute('data-cur')!=='1'});toast('OK','ok');loadUsers();}
          catch(e){toast(e.message,'err');}
        },true);
      };
    });
  }catch(e){$('adminBody').innerHTML='<p class="hint">Gagal: '+esc(e.message)+'</p>';}
}
function modalAddUser(){
  openModal('Tambah User','','<label>Username (huruf kecil)</label><input id="nuName" autocapitalize="none">'+
    '<label>Nama Lengkap</label><input id="nuNama">'+
    '<label>Role</label><select id="nuRole"><option value="OPERATOR">OPERATOR</option><option value="SPB">SPB (pantau)</option><option value="ADMIN">ADMIN</option></select>'+
    '<label>Password (min 6)</label><input id="nuPass" type="password">',
    function(){$('nuName').focus();},
    [{label:ic('save')+' Buat',cls:'',onClick:async function(){
      try{
        await apiPost('createUser',{username:$('nuName').value.trim(),nama:$('nuNama').value.trim(),role:$('nuRole').value,password:$('nuPass').value});
        closeModal();toast('User dibuat','ok');loadUsers();
      }catch(e){toast(e.message,'err');}
    }},{label:'Batal',cls:'sec'}]);
}
function modalResetPass(un){
  openModal('Reset Password',un,'<label>Password baru (min 6)</label><input id="rpNew" type="password">',null,
    [{label:ic('key')+' Reset',cls:'',onClick:async function(){
      try{await apiPost('resetPassword',{username:un,new_password:$('rpNew').value});closeModal();toast('Password direset','ok');}
      catch(e){toast(e.message,'err');}
    }},{label:'Batal',cls:'sec'}]);
}
async function renderOperators(body){
  body.innerHTML='<p class="hint">Memuat operator...</p>';
  var list=[];
  try{
    var j=await apiGet('operatorsAll',{});
    list=j.data||[];
  }catch(e){ body.innerHTML='<p class="hint">Gagal memuat operator: '+esc(e.message)+'</p>'; return; }
  var html='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h2>Operator Forklift</h2><button class="btn small" id="btnAddOp">'+ic('plus')+' Tambah</button></div>';
  list.forEach(function(o){
    var nm=typeof o==='string'?o:o.nama_operator;
    var aktif=typeof o==='string'?true:!!o.aktif;
    html+='<div class="list-row"><span class="grow">'+esc(nm)+'</span><span class="pill '+(aktif?'g':'r')+'">'+(aktif?'aktif':'nonaktif')+'</span>'+
      '<button class="btn small sec" data-op="'+esc(nm)+'" data-cur="'+(aktif?'1':'0')+'">'+(aktif?'Nonaktifkan':'Aktifkan')+'</button></div>';
  });
  if(!list.length)html+='<p class="hint">Belum ada operator.</p>';
  body.innerHTML=html;
  $('btnAddOp').onclick=function(){
    openModal('Tambah Operator','','<label>Nama Operator</label><input id="noNama">',function(){$('noNama').focus();},
      [{label:'Simpan',cls:'',onClick:async function(){
        try{await apiPost('addOperator',{nama_operator:$('noNama').value.trim()});closeModal();toast('OK','ok');renderAdminTab('operators');refreshData(false);}
        catch(e){toast(e.message,'err');}
      }},{label:'Batal',cls:'sec'}]);
  };
  body.querySelectorAll('[data-op]').forEach(function(b){
    b.onclick=function(){
      var cur=b.getAttribute('data-cur')==='1';
      confirmDialog((cur?'Nonaktifkan':'Aktifkan')+' operator '+b.getAttribute('data-op')+'?',async function(){
        try{await apiPost('setOperatorAktif',{nama_operator:b.getAttribute('data-op'),aktif:!cur});toast('OK','ok');renderAdminTab('operators');refreshData(false);}
        catch(e){toast(e.message,'err');}
      },cur);
    };
  });
}
function renderSettings(body){
  var items=[['threshold_tepat_waktu_menit','Batas tepat waktu (menit)'],['threshold_telat_parah_menit','Batas telat parah (menit)'],['jumlah_dock','Jumlah dock/bay']];
  var html='<h2>Settings</h2><p class="hint">Nilai juga bisa diedit langsung di sheet Settings.</p>';
  items.forEach(function(it){
    var val=S.settings[it[0]];
    html+='<label>'+it[1]+'</label><div style="display:flex;gap:8px"><input id="st_'+it[0]+'" value="'+esc(val==null?'':val)+'"><button class="btn small" data-save="'+it[0]+'" style="width:auto">Simpan</button></div>';
  });
  body.innerHTML=html;
  body.querySelectorAll('[data-save]').forEach(function(b){
    b.onclick=async function(){
      var key=b.getAttribute('data-save'),raw=$('st_'+key).value.trim(),n=Number(raw);
      if(raw===''||isNaN(n)){toast('Nilai harus angka','err');return;}
      if(key==='jumlah_dock'&&(n<1||Math.floor(n)!==n)){toast('Jumlah dock harus bilangan bulat minimal 1','err');return;}
      if(key!=='jumlah_dock'&&n<0){toast('Nilai tidak boleh negatif','err');return;}
      try{await apiPost('updateSetting',{key:key,value:n});toast('Tersimpan','ok');refreshData(false);}
      catch(e){toast(e.message,'err');}
    };
  });
}
async function loadAudit(){
  try{
    var j=await apiGet('audit',{limit:100});
    S.audit=j.data||[];
    var html='<h2>Audit Log (100 terakhir)</h2><div class="scroll-x maxh" style="margin-top:8px"><table class="tbl"><thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>ID</th><th>Detail</th></tr></thead><tbody>'+
      S.audit.map(function(a){return '<tr><td>'+fmtDT(a.timestamp)+'</td><td>'+esc(a.user)+'</td><td>'+esc(a.aksi)+'</td><td>'+esc(a.unload_id)+'</td><td>'+esc(a.detail)+'</td></tr>';}).join('')+
      '</tbody></table></div>';
    $('adminBody').innerHTML=html;
  }catch(e){$('adminBody').innerHTML='<p class="hint">Gagal: '+esc(e.message)+'</p>';}
}

/* ================= MONITOR DESKTOP ================= */
function renderMonitor(){
  var tv=todayVisits();
  var st=computeStats(tv);
  $('monStats').innerHTML=statsHtml(statCards(st));
  var cols=[{t:'Dijadwalkan',ico:'calendar'},{t:'Tiba',ico:'truck'},{t:'Sedang Bongkar',ico:'activity'},{t:'Selesai',ico:'check-c'}];
  var parah=Number(S.settings['threshold_telat_parah_menit'])||60;
  $('kanban').innerHTML=cols.map(function(c){
    var arr=tv.filter(function(v){return v.status===c.t;}).sort(function(a,b){return (a.dock||99)-(b.dock||99);});
    return '<div class="kcol"><div class="kh"><span>'+ic(c.ico)+' '+c.t+'</span><span>'+arr.length+'</span></div>'+
      arr.map(function(v){
        var cls=c.t==='Tiba'?'c1':c.t==='Sedang Bongkar'?'c2':'c3';
        var t='',hot=false;
        if(c.t==='Tiba'&&v.aktual_tiba){var w=minsSince(v.aktual_tiba,nowMs());t='Menunggu '+durStr(w);if(w>=parah){hot=true;t=ic('alert')+' '+t;}}
        else if(c.t==='Sedang Bongkar'&&v.mulai_bongkar){t='Bongkar '+durStr(runningBongkarMin(v))+(v.break_start&&!v.break_end?' '+ic('coffee'):'');}
        else if(c.t==='Dijadwalkan'&&v.plan_tiba){var df=Math.round((nowMsOf(v.plan_tiba)-nowMs())/60000);t=df>0?('Plan '+durStr(df)+' lagi'):('Telat '+durStr(-df));if(df<-30){hot=true;}}
        else if(c.t==='Selesai'){t='T'+durStr(v.durasi_tunggu_menit)+' B'+durStr(v.durasi_bongkar_menit);}
        return '<div class="kcard '+cls+(hot?' late':'')+'"><div class="p">'+esc(v.no_polisi||'-')+(v.dock?' <small style="color:var(--work)">D'+v.dock+'</small>':'')+'</div>'+
          '<div class="s">'+esc(v.vendor||'')+'</div><div class="t'+(hot?' hot':'')+'">'+esc(t)+'</div>'+
          '<div class="ops">'+esc((v.operator_tiba?'T:'+v.operator_tiba:'')+(v.operator_bongkar?(v.operator_tiba?' · ':'')+'B:'+v.operator_bongkar:''))+'</div></div>';
      }).join('')||'<div class="empty">Kosong</div>'+'</div>';
  }).join('');
  var f=S.fMon=readFilters('mDate','mVendor','mStatus');
  var isDefault=(!f.date||f.date===todayJak())&&!f.vendor&&!f.status;
  var list=isDefault?todayVisits():applyFilters(S.visits,f);
  S.monList=list;
  $('monTbl').innerHTML=tableHtml(list.slice().sort(byCreated).slice(0,300));
  $('lastUpd').textContent=jktTime(S.lastUpdate||nowMs());
}

/* ================= MODE & TAB SWITCH ================= */
function setMode(m){
  S.mode=m; localStorage.setItem(LS.MODE,m);
  document.body.setAttribute('data-mode',m);
  if(m==='monitor'){ applyTheme('dark'); } else { applyTheme(themePref()); }
  $('btnMode').innerHTML = m==='monitor' ? ic('phone')+' Operasi' : ic('monitor')+' Monitor';
  $('btnFs').style.display=m==='monitor'?'':'none';
  if(S.me){startTimers();renderAll();}
}
function setTab(t){
  if(t==='admin'&&!isAdmin())t='queue';
  if(t==='form'&&!canAct())t='queue';
  S.tab=t;
  document.querySelectorAll('#tabsBar button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-tab')===t);});
  renderAll();
}

/* ================= BINDING AWAL ================= */
function bindStatic(){
  $('loginForm').addEventListener('submit',function(ev){
    ev.preventDefault();
    var u=$('inUser').value.trim(),p=$('inPass').value,url=$('inUrl').value.trim();
    if(!u||!p){showLogin('Username dan password wajib diisi.');return;}
    if(url)localStorage.setItem(LS.URL,url.replace(/\/+$/,''));
    doLogin(u,p);
  });
  $('btnOut').onclick=function(){confirmDialog('Keluar dari aplikasi?',function(){forceLogout('Anda telah keluar.');},true);};
  $('btnRefreshTop').onclick=function(){refreshData(true);};
  $('btnFs').onclick=function(){
    if(document.fullscreenElement)document.exitFullscreen();
    else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();
  };
  $('btnMode').onclick=function(){setMode(S.mode==='monitor'?'operasi':'monitor');};
  $('btnTheme').onclick=function(){
    var t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    localStorage.setItem(THEME_KEY,t);
    if(S.mode!=='monitor') applyTheme(t); else applyTheme('dark');
  };
  $('btnKey').onclick=function(){
    openModal('Ganti Password',S.me?S.me.nama:'',
      '<label>Password lama</label><input id="cpOld" type="password">'+
      '<label>Password baru (min 6)</label><input id="cpNew" type="password">',null,
      [{label:ic('key')+' Ganti',cls:'',onClick:async function(){
        try{await apiPost('changePassword',{old_password:$('cpOld').value,new_password:$('cpNew').value});
          closeModal();toast('Password diganti. Silakan logout & login ulang.','ok');}
        catch(e){toast(e.message,'err');}
      }},{label:'Batal',cls:'sec'}]);
  };
  document.querySelectorAll('#tabsBar button').forEach(function(b){b.onclick=function(){setTab(b.getAttribute('data-tab'));};});
  document.querySelectorAll('#segSumber button').forEach(function(b){b.onclick=function(){setSumber(b.getAttribute('data-v'));};});
  $('btnSubmitTruck').onclick=submitTruck;

  // delegasi klik kartu antrean
  $('queueCols').addEventListener('click',function(ev){
    var b=ev.target.closest('[data-act]'); if(!b)return;
    var id=b.getAttribute('data-id'),act=b.getAttribute('data-act');
    var v=findVisit(id);
    if(act==='tiba')confirmDialog('Konfirmasi truk '+v.no_polisi+' sudah tiba?',function(){actTruk('markTiba',id,{operator_tiba:S.me.nama});});
    else if(act==='mulai')modalMulai(v);
    else if(act==='selesai')modalSelesai(v);
    else if(act==='jeda')confirmDialog('Catat mulai istirahat?',function(){actTruk('pauseBreak',id);});
    else if(act==='lanjut')confirmDialog('Lanjut kerja (akhiri istirahat)?',function(){actTruk('resumeBreak',id);});
    else if(act==='batal')confirmDialog('Batalkan jadwal truk ini?',function(){actTruk('cancel',id);},true);
    else if(act==='edit')modalEdit(v);
  });

  // filter dashboard
  ['dDate','dVendor','dStatus'].forEach(function(id){
    $(id).addEventListener('change',function(){
      S.fDash={date:$('dDate').value,vendor:$('dVendor').value,status:$('dStatus').value};
      renderDash();
    });
  });
  $('btnCsv').onclick=function(){
    csvExport(S.dashList||applyFilters(S.visits,S.fDash),'unloading_'+(S.fDash.date||todayJak())+'.csv');
  };
  // filter monitor
  ['mDate','mVendor','mStatus'].forEach(function(id){
    $(id).addEventListener('change',function(){
      S.fMon={date:$('mDate').value,vendor:$('mVendor').value,status:$('mStatus').value};
      renderMonitor();
    });
  });
  $('btnCsvMon').onclick=function(){
    csvExport(S.monList||applyFilters(S.visits,S.fMon),'unloading_monitor_'+(S.fMon.date||todayJak())+'.csv');
  };
  // admin nav
  document.querySelectorAll('#adminNav button').forEach(function(b){
    b.onclick=function(){S.adminTab=b.getAttribute('data-a');renderAdminTab(S.adminTab);};
  });
  // overlay klik luar
  $('modalOverlay').addEventListener('click',function(ev){if(ev.target===this)closeModal();});
  // prefill login
  $('inUrl').value=localStorage.getItem(LS.URL)||'';
  $('inUser').value=localStorage.getItem(LS.USER)||'';
  $('dDate').value=todayJak(); $('mDate').value=todayJak();
  window.addEventListener('online',function(){$('connDot').className='dot';if(S.me)refreshData(false);});
  window.addEventListener('offline',function(){$('connDot').className='dot off';});
}

/* ================= INIT ================= */
document.addEventListener('DOMContentLoaded',function(){
  bindStatic();
  var u=localStorage.getItem(LS.USER),p=localStorage.getItem(LS.PASS);
  if(localStorage.getItem(LS.URL)&&u&&p){
    S.cred={u:u,p:p};
    doLoginSilent(u,p);
  }else{
    showLogin();
  }
});
async function doLoginSilent(u,p){
  try{
    var data=await apiLogin(u,p);
    S.me={username:data.username,nama:data.nama,role:data.role};
    S.temuanOpts=(data.temuan_options&&data.temuan_options.length)?data.temuan_options:TEMUAN_FALLBACK;
    enterApp();
  }catch(e){ forceLogout(null); showLogin(e.message.replace('AUTH: ','')); }
}
