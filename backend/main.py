import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from backend.config import settings
from backend.db.database import init_db
from backend.api.routes import router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_WIDGET_JS = r"""
/* UMKM AI Suite — Embeddable Webchat Widget v1.0
 * Embed di website client sebelum </body>:
 *   <script src="https://YOUR-BACKEND.up.railway.app/widget.js"></script>
 * Konfigurasi opsional (taruh SEBELUM script ini):
 *   <script>
 *     var UMKM_BACKEND  = "https://YOUR-BACKEND.up.railway.app";
 *     var UMKM_THEME    = "#16a34a";
 *     var UMKM_AGENT    = "AI Assistant";
 *     var UMKM_GREETING = "Halo! Ada yang bisa saya bantu?";
 *     var UMKM_AUTO_OPEN = false;
 *   </script>
 */
(function () {
  var BASE = (typeof UMKM_BACKEND  !== 'undefined' ? UMKM_BACKEND  : '').replace(/\/$/, '');
  var COLOR= (typeof UMKM_THEME    !== 'undefined' ? UMKM_THEME    : '#16a34a');
  var NAME = (typeof UMKM_AGENT    !== 'undefined' ? UMKM_AGENT    : 'AI Assistant');
  var GREET= (typeof UMKM_GREETING !== 'undefined' ? UMKM_GREETING : 'Halo! Ada yang bisa saya bantu? 😊');
  var AUTO = (typeof UMKM_AUTO_OPEN!== 'undefined' ? UMKM_AUTO_OPEN: false);

  if (!BASE) { console.warn('[UMKM Widget] UMKM_BACKEND tidak di-set'); return; }

  /* ── CSS ── */
  var style = document.createElement('style');
  style.textContent = [
    '#_uw{--p:'+COLOR+';font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;position:fixed;bottom:24px;right:24px;z-index:99999}',
    '#_ub{width:60px;height:60px;border-radius:50%;background:var(--p);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(0,0,0,.2);transition:.2s}',
    '#_ub:hover{filter:brightness(.9)}',
    '#_ub svg{width:28px;height:28px;fill:#fff}',
    '#_win{display:none;position:absolute;bottom:72px;right:0;width:360px;max-width:calc(100vw - 48px);height:520px;max-height:calc(100vh - 110px);background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.18);flex-direction:column;overflow:hidden;border:1px solid #e5e7eb;animation:_su .2s ease}',
    '#_win.open{display:flex}',
    '@keyframes _su{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
    '#_wh{background:var(--p);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}',
    '#_wh .av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:18px}',
    '#_wh .nm{font-weight:600;font-size:14px}',
    '#_wh .st{font-size:11px;opacity:.85}',
    '#_wh .st::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#86efac;margin-right:4px}',
    '#_cl{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;opacity:.8;line-height:1;margin-left:auto}',
    '#_cl:hover{opacity:1}',
    '#_msgs{flex:1;overflow-y:auto;padding:16px;background:#f9fafb;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}',
    '.um{display:flex;max-width:85%}.um.bot{align-self:flex-start}.um.usr{align-self:flex-end;flex-direction:row-reverse}',
    '.ub{padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.55;word-break:break-word;white-space:pre-wrap}',
    '.um.bot .ub{background:#fff;color:#111;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.08)}',
    '.um.usr .ub{background:var(--p);color:#fff;border-bottom-right-radius:4px}',
    '.typ{display:flex;gap:4px;padding:12px 14px;background:#fff;border-radius:16px;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.08);width:fit-content}',
    '.typ span{width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:_b 1.2s infinite}',
    '.typ span:nth-child(2){animation-delay:.2s}.typ span:nth-child(3){animation-delay:.4s}',
    '@keyframes _b{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',
    '#_ft{border-top:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;background:#fff;flex-shrink:0}',
    '#_inp{flex:1;border:1px solid #e5e7eb;border-radius:24px;padding:9px 16px;font-size:13.5px;outline:none;resize:none;font-family:inherit;line-height:1.4;max-height:100px;overflow-y:auto;transition:.15s}',
    '#_inp:focus{border-color:var(--p)}',
    '#_snd{width:38px;height:38px;border-radius:50%;background:var(--p);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:flex-end;transition:.15s}',
    '#_snd:hover{filter:brightness(.9)}#_snd svg{width:18px;height:18px;fill:#fff}',
    '#_snd:disabled{background:#9ca3af;cursor:not-allowed}',
    '#_pw{text-align:center;font-size:10px;color:#9ca3af;padding:4px 12px 6px;background:#fff}',
  ].join('');
  document.head.appendChild(style);

  /* ── HTML ── */
  var wrap = document.createElement('div');
  wrap.id = '_uw';
  wrap.innerHTML = [
    '<div id="_win">',
      '<div id="_wh">',
        '<div class="av">🤖</div>',
        '<div><div class="nm" id="_nm">'+NAME+'</div><div class="st">Online</div></div>',
        '<button id="_cl" aria-label="Tutup">×</button>',
      '</div>',
      '<div id="_msgs"></div>',
      '<div id="_ft">',
        '<textarea id="_inp" placeholder="Ketik pesan..." rows="1"></textarea>',
        '<button id="_snd" disabled><svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button>',
      '</div>',
      '<div id="_pw">Powered by UMKM AI Suite</div>',
    '</div>',
    '<button id="_ub" aria-label="Chat">',
      '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
    '</button>',
  ].join('');
  document.body.appendChild(wrap);

  var win  = document.getElementById('_win');
  var btn  = document.getElementById('_ub');
  var cl   = document.getElementById('_cl');
  var msgs = document.getElementById('_msgs');
  var inp  = document.getElementById('_inp');
  var snd  = document.getElementById('_snd');
  var isOpen = false, busy = false;

  var SK = 'umkm_sid', HK = 'umkm_hist';
  var sid = localStorage.getItem(SK) || ('wc_' + Math.random().toString(36).substr(2,9) + '_' + Date.now());
  localStorage.setItem(SK, sid);
  var hist = [];
  try { hist = JSON.parse(localStorage.getItem(HK) || '[]'); } catch(e){}
  hist.forEach(function(m){ addMsg(m.r, m.t, false); });

  /* Ambil config dari backend */
  fetch(BASE + '/api/webchat/widget-config')
    .then(function(r){ return r.json(); })
    .then(function(c){
      if (c.business_name) document.getElementById('_nm').textContent = c.business_name;
      if (c.theme_color)   document.getElementById('_uw').style.setProperty('--p', c.theme_color);
      if (c.greeting && !hist.length) { addMsg('bot', c.greeting); save('bot', c.greeting); }
      if (c.auto_open && !isOpen) toggle();
    }).catch(function(){
      if (!hist.length) { addMsg('bot', GREET); save('bot', GREET); }
      if (AUTO && !isOpen) toggle();
    });

  btn.addEventListener('click', toggle);
  cl.addEventListener('click',  function(){ isOpen=true; toggle(); });
  inp.addEventListener('input',  function(){
    snd.disabled = !inp.value.trim();
    inp.style.height='auto';
    inp.style.height=Math.min(inp.scrollHeight,100)+'px';
  });
  inp.addEventListener('keydown', function(e){
    if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }
  });
  snd.addEventListener('click', send);

  function toggle(){
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    if (isOpen){ scrollBot(); inp.focus(); }
  }

  function send(){
    var txt = inp.value.trim();
    if (!txt || busy) return;
    addMsg('usr', txt); save('usr', txt);
    inp.value = ''; inp.style.height = 'auto'; snd.disabled = true;
    var tyEl = showTyping(); busy = true;
    fetch(BASE + '/api/webchat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, message: txt })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      removeTyping(tyEl);
      var rep = d.reply || 'Maaf, terjadi kesalahan. Silakan coba lagi.';
      addMsg('bot', rep); save('bot', rep);
    })
    .catch(function(){
      removeTyping(tyEl);
      addMsg('bot', 'Maaf, tidak bisa terhubung ke server.');
    })
    .finally(function(){ busy = false; });
  }

  function addMsg(role, text, anim){
    var w = document.createElement('div'); w.className = 'um ' + (role==='usr'?'usr':'bot');
    var b = document.createElement('div'); b.className = 'ub'; b.textContent = text;
    w.appendChild(b); msgs.appendChild(w);
    if (anim !== false) scrollBot();
  }
  function showTyping(){
    var w = document.createElement('div'); w.className = 'um bot';
    w.innerHTML = '<div class="typ"><span></span><span></span><span></span></div>';
    msgs.appendChild(w); scrollBot(); return w;
  }
  function removeTyping(el){ if (el && el.parentNode) el.parentNode.removeChild(el); }
  function scrollBot(){ msgs.scrollTop = msgs.scrollHeight; }
  function save(r,t){
    hist.push({r:r,t:t});
    if (hist.length > 40) hist = hist.slice(-40);
    try { localStorage.setItem(HK, JSON.stringify(hist)); } catch(e){}
  }
})();
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — initializing database...")
    try:
        await init_db()
        logger.info("Database initialized OK")
    except Exception as e:
        logger.exception("Database init FAILED: %s", e)
        raise
    yield
    logger.info("Shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    description="AI Suite untuk UMKM Indonesia — WA Auto-Reply & Konten Marketing",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: izinkan semua origin jika CORS_ORIGINS kosong
_raw = getattr(settings, "CORS_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _raw.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/widget.js", tags=["Widget"], include_in_schema=False)
async def serve_widget_js():
    """Widget JS yang bisa di-embed langsung di website client."""
    return Response(
        content=_WIDGET_JS,
        media_type="application/javascript",
        headers={
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": str(exc), "detail": type(exc).__name__},
    )


@app.get("/", tags=["health"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "status": "running",
    }
