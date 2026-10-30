
(() => {
  'use strict';
  const prefix='pee.web.v1.';
  const read=(key,fallback=null)=>{const value=localStorage.getItem(prefix+key);return value===null?fallback:JSON.parse(value);};
  const write=(key,value)=>localStorage.setItem(prefix+key,JSON.stringify(value));
  let database;
  const db=()=>database??=new Promise((resolve,reject)=>{
    const req=indexedDB.open('pee-personal-cards',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('cards');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  async function cards(value) {
    const store=await db();
    return new Promise((resolve,reject)=>{
      const tx=store.transaction('cards',value===undefined?'readonly':'readwrite');
      const request=value===undefined?tx.objectStore('cards').get('slots'):tx.objectStore('cards').put(value,'slots');
      tx.oncomplete=()=>resolve(value===undefined?(request.result??Array(4).fill(null)):value);
      tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  const metadata=c=>c&&({id:c.id,name:c.name,mime:c.mime,pages:c.pages});
  async function selectFile(camera) {
    return new Promise(resolve=>{
      const input=document.createElement('input');input.type='file';
      input.accept=camera?'image/*':'image/png,image/jpeg,image/webp,application/pdf';
      if(camera)input.setAttribute('capture','environment');
      input.style.display='none';document.body.append(input);
      const done=file=>{input.remove();resolve(file??null);};
      input.addEventListener('change',()=>done(input.files?.[0]),{once:true});
      input.addEventListener('cancel',()=>done(null),{once:true});
      input.click();
    });
  }
  let pdfLibrary;
  async function pdfjs() {
    if(!pdfLibrary){pdfLibrary=await import('./vendor/pdf.mjs');pdfLibrary.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;}
    return pdfLibrary;
  }
  async function addFile(camera) {
    const existing=await cards();const slot=existing.indexOf(null);
    if(slot<0)throw Error('Les quatre emplacements sont occupés.');
    const file=await selectFile(camera);if(!file)return null;
    if(file.size>20*1024*1024)throw Error('Choisissez un fichier de moins de 20 Mo.');
    if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw Error('Choisissez une image JPEG, PNG, WebP ou un PDF.');
    let pages=1;
    if(file.type==='application/pdf') {
      const pdf=await(await pdfjs()).getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
      pages=pdf.numPages;await pdf.destroy();
      if(pages>100)throw Error('Le PDF dépasse 100 pages.');
    } else {
      const image=await createImageBitmap(file);image.close();
    }
    const card={id:crypto.randomUUID(),name:file.name,mime:file.type,pages,blob:file};
    existing[slot]=card;await cards(existing);return metadata(card);
  }
  async function preview(args) {
    const all=await cards();const c=args.id?all.find(c=>c?.id===args.id):all.find(Boolean);
    if(!c)throw Error('Carte introuvable.');
    const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');
    const width=Math.min(1800,Math.max(200,args.width??1000));
    if(c.mime==='application/pdf') {
      const pdf=await(await pdfjs()).getDocument({data:new Uint8Array(await c.blob.arrayBuffer()),isEvalSupported:false}).promise;
      const page=await pdf.getPage((args.page??0)+1);
      const viewport=page.getViewport({scale:width/page.getViewport({scale:1}).width});
      canvas.width=viewport.width;canvas.height=viewport.height;
      await page.render({canvasContext:ctx,viewport}).promise;await pdf.destroy();
    } else {
      const image=await createImageBitmap(c.blob);canvas.width=Math.min(width,image.width);
      canvas.height=Math.round(canvas.width*image.height/image.width);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
    }
    return {bytes:canvas.toDataURL('image/png').split(',')[1],width:canvas.width,height:canvas.height};
  }

  let visible=false, userGesture=false;
  const music=new Audio('audio/quiz_loop.wav');music.loop=true;music.volume=.3;
  const effects={tick:new Audio('audio/quiz_tick.wav'),win:new Audio('audio/quiz_win.wav')};
  const soundSettings=()=>read('audio',{enabled:true,musicEnabled:true,effectsEnabled:true});
  function updateMusic(){
    const s=soundSettings();
    if(userGesture&&visible&&!document.hidden&&s.enabled&&s.musicEnabled)music.play().catch(()=>{});
    else music.pause();
  }
  function tone(method){
    const effect=effects[method==='tick'?'tick':'win'];effect.currentTime=0;effect.play().catch(()=>{});
  }
  document.addEventListener('pointerdown',()=>{userGesture=true;updateMusic();});
  document.addEventListener('visibilitychange',updateMusic);
  let installPrompt;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
  async function invoke(channel,method,args) {
    args??={};
    const area=channel.split('/').pop();
    if(area==='private_news') {
      if(!window.peePrivateNews)throw Error('Connexion privée en cours de chargement. Réessayez.');
      return window.peePrivateNews(method,args);
    }
    if(area==='web_app') {
      if(method==='install'){
        if(installPrompt){await installPrompt.prompt();installPrompt=null;}
        else alert('Sur iPhone : Safari → Partager → Sur l’écran d’accueil.\nSur ordinateur ou Android : menu du navigateur → Installer l’application.');
        return null;
      }
      if(method==='offline'){
        if(!('serviceWorker' in navigator))throw Error('Mode hors ligne indisponible.');
        await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Rechargez la page pour activer le mode hors ligne.')),15000))]);
        const manifest=await(await fetch('offline-files.json')).json();
        const accepted=confirm('Télécharger les trois documents et les illustrations pour une consultation hors ligne ? Environ '+manifest.megabytes+' Mo seront stockés sur cet appareil.');
        if(!accepted)return null;
        const status=document.createElement('div');
        Object.assign(status.style,{position:'fixed',bottom:'14px',left:'50%',transform:'translateX(-50%)',background:'#0b513b',color:'white',padding:'16px 24px',borderRadius:'24px',zIndex:'999999',fontFamily:'Arial',maxWidth:'85vw'});
        document.body.append(status);
        const cache=await caches.open('pee-content-faccd0baf888');let count=0;
        try {
          for(const file of manifest.files){status.textContent='Documents hors ligne : '+Math.round(100*count/manifest.files.length)+' %';if(!await cache.match(file)){const response=await fetch(file);if(!response.ok)throw Error('Téléchargement incomplet. Réessayez avec une connexion stable.');await cache.put(file,response);}count++;}
          alert('Les documents sont enregistrés sur cet appareil.');return null;
        } finally {status.remove();}
      }
    }
    if(area==='settings') {
      if(method==='load')return read('settings',{});
      if(method==='save'){write('settings',{...read('settings',{}),...args});return null;}
    }
    if(area==='quiz_progress'||area==='favorites') {
      if(method==='load')return read(area);
      if(method==='save'){write(area,args.value);return null;}
    }
    if(area==='quiz_audio') {
      const s=soundSettings();
      if(method==='getSettings')return s;
      if(method==='visible')visible=args.value===true;
      else if(['enabled','musicEnabled','effectsEnabled'].includes(method)){s[method]=args.value;write('audio',s);}
      else if(s.enabled&&s.effectsEnabled)tone(method);
      updateMusic();return s.enabled;
    }
    if(['reference_source','news_source','official_source'].includes(area)&&method==='open') {
      const url=new URL(args.url);
      if(url.protocol!=='https:')throw Error('Lien non sécurisé.');
      window.open(url.href,'_blank','noopener,noreferrer');return null;
    }
    if(area==='web_news') {
      if(method==='load')return read('feed:'+args.endpoint);
      if(method==='save'){write('feed:'+args.endpoint,args.feed);return null;}
      if(method==='fetch'){
        const response=await fetch(args.endpoint,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{Accept:'application/json'}});
        if(!response.ok)throw Error('Fil momentanément indisponible.');
        const text=await response.text();if(text.length>1024*1024)throw Error('Fil trop volumineux.');return text;
      }
    }
    if(area==='member_card') {
      if(method==='loadAll')return(await cards()).map(metadata);
      if(method==='load')return metadata((await cards()).find(Boolean));
      if(method==='pendingShared'||method==='cancel'||method==='discardShared')return null;
      if(method==='pick'||method==='capture')return addFile(method==='capture');
      if(method==='preview')return preview(args);
      if(method==='remove'||method==='rename'||method==='reorder') {
        let all=await cards();
        if(method==='remove')all=all.map(c=>c?.id===args.id?null:c);
        if(method==='rename')all=all.map(c=>c?.id===args.id?{...c,name:args.name}:c);
        if(method==='reorder'){
          if(args.ids.length!==4||new Set(args.ids.filter(Boolean)).size!==all.filter(Boolean).length||args.ids.filter(Boolean).some(id=>!all.some(c=>c?.id===id)))throw Error('Ordre invalide.');
          all=args.ids.map(id=>id?all.find(c=>c?.id===id):null);
        }
        await cards(all);return null;
      }
      if(method==='export') {
        const c=(await cards()).find(Boolean);if(!c)return false;
        const a=document.createElement('a');a.href=URL.createObjectURL(c.blob);a.download=c.name;a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),30000);return true;
      }
      throw Error('Utilisez le bouton Importer pour choisir votre carte sur cet appareil.');
    }
    throw Error('Fonction indisponible dans ce navigateur.');
  }
  window.peeInvoke=async(channel,method,args)=>{
    try{return JSON.stringify((await invoke(channel,method,JSON.parse(args)))??null);}
    catch(error){return JSON.stringify({_error:error.message||'Action impossible.'});}
  };
})();
