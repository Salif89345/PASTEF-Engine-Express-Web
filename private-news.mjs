// Private local test only. No credentials or article bytes in persistent storage.
export const NEWS_ORIGIN = 'https://pee-actualites.2befriend.workers.dev';
const allowedOrigins = new Set(['http://127.0.0.1:8891', 'http://localhost:8891']);
export function createPrivateNewsClient({fetcher = fetch, origin = location.origin} = {}) {
  let authorization = null;
  let generation = 0;
  function clear() { authorization = null; generation++; }
  async function download(path, limit, accept, credential = authorization) {
    if (!allowedOrigins.has(origin)) throw Error('Test privé disponible dans la version locale uniquement.');
    if (!credential) throw Error('private-auth');
    const response = await fetcher(NEWS_ORIGIN + path, {
      method:'GET', redirect:'error', credentials:'omit', cache:'no-store',
      signal:AbortSignal.timeout(15000), headers:{Authorization:credential, Accept:accept}
    });
    if (response.status === 401) { clear(); throw Error('private-auth'); }
    if (!response.ok) throw Error('Actualités temporairement indisponibles.');
    const reader = response.body.getReader();
    const chunks=[]; let size=0;
    try {
      while (true) {
        const {done,value}=await reader.read(); if(done) break;
        size+=value.length;
        if(size>limit) { await reader.cancel(); throw Error('Contenu trop volumineux.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const result=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
    return result;
  }
  function normalizedFeed(bytes) {
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(data.edition!=='trial'||data.schemaVersion!==1||!Array.isArray(data.articles)||data.articles.length>200)
      throw Error('Format de fil privé invalide.');
    for(const article of data.articles) {
      if(article.imageUrl) {
        if(!/^\/images\/[a-z0-9_-]+\.(png|webp|jpg)$/.test(article.imageUrl))
          throw Error('Image privée non autorisée.');
        article.imageUrl=NEWS_ORIGIN+article.imageUrl;
      }
    }
    return JSON.stringify(data);
  }
  return {
    clear,
    async login(password) {
      clear(); const current=generation;
      if(typeof password!=='string'||password.length<20) throw Error('Utilisez le mot de passe Cloudflare de 20 caractères minimum.');
      const credential='Basic '+btoa(String.fromCharCode(...new TextEncoder().encode('pee:'+password)));
      const feed=normalizedFeed(await download('/feed.json',1024*1024,'application/json',credential));
      if(current!==generation) throw Error('Connexion annulée.');
      authorization=credential;return feed;
    },
    async feed() {
      const current=generation;
      const result=normalizedFeed(await download('/feed.json',1024*1024,'application/json'));
      if(current!==generation) throw Error('private-auth');return result;
    },
    async image(url) {
      const parsed=new URL(url);
      if(parsed.origin!==NEWS_ORIGIN||parsed.username||parsed.password||parsed.search||parsed.hash||
          !/^\/images\/[a-z0-9_-]+\.(png|webp|jpg)$/.test(parsed.pathname))
        throw Error('Image privée non autorisée.');
      const current=generation;
      const bytes=await download(parsed.pathname,4*1024*1024,'image/png,image/jpeg,image/webp');
      if(current!==generation) throw Error('private-auth');
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      return {bytes:btoa(binary)};
    }
  };
}
if(typeof window!=='undefined') {
  const client=createPrivateNewsClient();
  window.peePrivateNews=async(method,args)=>{
    if(method==='login') {
      try {
        const result=await client.login(args.password);
        console.info('[PEE privé] Connexion et format JSON validés.');
        return result;
      } catch(error) {
        // Diagnostic technique fixe uniquement : jamais de mot de passe, URL ou réponse.
        const code=error.message==='private-auth'?'AUTH':
          error instanceof TypeError?'NETWORK':
          error.name==='TimeoutError'?'TIMEOUT':
          error.message.startsWith('Format de fil')?'FORMAT':
          error.message.startsWith('Image privée')?'IMAGE_PATH':
          error.message.startsWith('Utilisez le mot')?'LENGTH':'CONNECTION';
        console.warn('[PEE privé] Échec de connexion : '+code);
        throw error;
      }
    }
    if(method==='fetch')return client.feed();
    if(method==='image')return client.image(args.url);
    if(method==='logout'){client.clear();return null;}
    throw Error('Action privée inconnue.');
  };
  window.addEventListener('pagehide',()=>client.clear());
}
