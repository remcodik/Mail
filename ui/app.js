/* MailAI — Sprint 1 frontend app (vanilla JS, mock data).
   Cockpit → category → detail, plus settings. State is in-memory (fixtures).
   Sprint 2 will swap the fixture load for GET /api/inbox (same shape). */
(function () {
  'use strict';
  var state = null;      // populated by boot(); from the API when available, else fixtures
  var sel = 'all';       // selected mail account: 'all' | account id — keeps Work/Private separated
  var API_OK = false;    // true when data was loaded from the backend
  var CUSTOM_COLORS = ['#0891B2', '#7C3AED', '#DB2777', '#059669', '#D97706'];
  var GENERIC_ICON = '<path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h8z"/><circle cx="7.5" cy="7.5" r="1.3"/>';
  // category icons live in the frontend (presentation), keyed by category id
  var ICONS = {
    urgent: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    reply: '<path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>',
    delivery: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>',
    purchase: '<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    travel: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    newsletter: '<rect x="3" y="4" width="13" height="16" rx="1"/><path d="M16 8h5v10a2 2 0 0 1-2 2H6"/><path d="M6 8h6M6 12h6M6 16h4"/>',
    ticket: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9 6v12"/>',
    waiting: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    junk: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    fyi: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'
  };
  function iconFor(c){ return ICONS[c.id] || c.icon || GENERIC_ICON; }
  var root = document.getElementById('root');

  // ---------- helpers ----------
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function svg(inner, size){ size = size || 20; return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'+inner+'</svg>'; }
  var SPARK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/></svg>';
  function catById(id){ return state.categories.filter(function(c){ return c.id===id; })[0]; }
  function acctById(id){ return state.accounts.filter(function(a){ return a.id===id; })[0]; }
  function visibleCats(){ return state.categories.filter(function(c){ return c.visible; }); }
  function inSel(m){ return sel==='all' || m.account===sel; }
  function msgsIn(id){ return state.messages.filter(function(m){ return m.cat===id && !m.archived && inSel(m); }); }
  function msgById(id){ return state.messages.filter(function(m){ return m.id===id; })[0]; }

  // account switcher (segmented) — shown on cockpit + category views
  function acctSwitcher(){
    var opts = [{ id:'all', name:'All mail', color:null }].concat(state.accounts);
    return '<div class="acctbar">' + opts.map(function(a){
      return '<button class="acctseg'+(sel===a.id?' on':'')+'" data-act="setacct" data-id="'+a.id+'">'
        + (a.color?'<span class="adot" style="background:'+a.color+'"></span>':'')
        + esc(a.name)+'</button>';
    }).join('') + '</div>';
  }
  function acctTag(m){
    var a = acctById(m.account); if(!a) return '';
    return '<span class="acctag" style="--ac:'+a.color+'">'+esc(a.name)+'</span>';
  }
  function selLabel(){
    if(sel==='all') return state.accounts.map(function(a){ return a.name; }).join(' + ');
    var a = acctById(sel); return a ? a.name+' · '+a.email : 'All mail';
  }

  function hintFor(cat){
    var ms = msgsIn(cat.id), n = ms.length, a;
    switch(cat.id){
      case 'urgent': a = ms.filter(function(m){return m.needsAction;}).length; return '<b>'+a+'</b> need action';
      case 'reply': return '<b>'+n+'</b> drafts ready';
      case 'delivery': a = ms.filter(function(m){return m.pickup;}).length; return a ? '<b>'+a+'</b> ready for pickup' : n+' in transit';
      case 'purchase': a = ms.reduce(function(s,m){return s+(m.total||0);},0); return '€'+a.toFixed(0)+' this week';
      case 'travel': a = Math.min.apply(null, ms.map(function(m){return m.daysUntil==null?999:m.daysUntil;})); return (a<999) ? 'Trip in <b>'+a+' days</b>' : 'no trips';
      case 'newsletter': a = ms.reduce(function(s,m){return s+(m.unread||0);},0); return a+' unread';
      case 'ticket': return '<b>'+n+'</b> for Wallet';
      case 'waiting': a = ms.filter(function(m){return m.overdue;}).length; return a ? '<b>'+a+'</b> overdue' : n+' waiting';
      default: return n+' mail'+(n===1?'':'s');
    }
  }

  // ---------- screen: cockpit ----------
  function viewCockpit(){
    var active = state.messages.filter(function(m){ return !m.archived && inSel(m); });
    var needYou = active.filter(function(m){ return m.needsAction || m.cat==='reply' || (m.cat==='waiting'&&m.overdue); }).length;
    var autoHandled = active.length - needYou;
    var tiles = visibleCats().map(function(c){
      var n = msgsIn(c.id).length;
      return '<button class="tile" style="--tc:'+c.color+'" data-nav="#/c/'+c.id+'">'
        + '<span class="ticon">'+svg(iconFor(c),15)+'</span>'
        + '<span class="tcount">'+n+'</span>'
        + '<span class="tname">'+esc(c.name)+'</span>'
        + '<span class="tsub">'+hintFor(c)+'</span></button>';
    }).join('');
    return {
      top: '<div class="brand"><span class="dot"></span> MailAI · Cockpit</div>'
         + '<h1>Good morning, Remco</h1><div class="sub">Tue 15 Jul · '+esc(selLabel())+' · '+active.length+' active</div>',
      body: acctSwitcher() + '<div class="hero"><div class="hstat"><div class="big">'+needYou+'</div><div class="hl">need you today</div></div>'
          + '<div class="hstat"><div class="big">'+autoHandled+'</div><div class="hl">auto-handled</div></div></div>'
          + '<div class="tilegrid">'+tiles
          + '<button class="tile add" style="grid-column:1/-1" data-act="addcat">'+svg('<path d="M12 5v14M5 12h14"/>',15)+' Add a category tile</button></div>',
      nav: 'cockpit'
    };
  }

  // ---------- screen: category list ----------
  function cardHTML(m){
    return '<button class="card" data-nav="#/m/'+m.id+'"><span class="av" style="background:'+m.av+'">'+esc(m.initials)+'</span>'
      + '<span><span class="top"><span class="from">'+esc(m.from)+'</span><span class="time">'+esc(m.time)+'</span></span>'
      + '<span class="subj">'+esc(m.subject)+'</span><span class="snip">'+esc(m.snippet)+'</span>'
      + (m.ai ? '<span class="ai-note">'+SPARK+esc(m.ai)+'</span>' : '')
      + '<span class="chip-wrap" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px"><span class="chip" style="--cc:'+catById(m.cat).color+'">'+esc(m.chip||catById(m.cat).name)+'</span>'+acctTag(m)+'</span></span></button>';
  }
  function newsletterHTML(m){
    return '<div class="nrow"><div><div class="nm">'+esc(m.from)+' '+acctTag(m)+'</div><div class="fr">'+esc(m.freq||'')+' · '+(m.unread||0)+' unread</div></div>'
      + '<div class="acts"><button class="pill unsub" data-act="unsub" data-id="'+m.id+'">Unsubscribe</button>'
      + '<button class="pill" data-act="archive" data-id="'+m.id+'">Archive</button></div></div>';
  }
  function waitingHTML(m){
    return '<div class="wcard'+(m.overdue?' over':'')+'"><div class="top"><span class="to">'+esc(m.to||m.from)+' '+acctTag(m)+'</span>'
      + '<span class="days'+(m.overdue?' hot':'')+'">'+m.days+' day'+(m.days===1?'':'s')+(m.overdue?' · overdue':'')+'</span></div>'
      + '<div class="sj">'+esc(m.subject)+'</div>'
      + '<div class="btnrow"><button class="btn pri" data-nav="#/m/'+m.id+'">Follow up</button>'
      + '<button class="btn" data-act="done" data-id="'+m.id+'">Done</button></div></div>';
  }
  function ticketCardHTML(m){
    var t = m.ticket;
    var grid = t.grid.map(function(kv){ return '<div><div class="k">'+esc(kv[0])+'</div><div class="v">'+esc(kv[1])+'</div></div>'; }).join('');
    return '<button class="ticket '+t.style+'" data-nav="#/m/'+m.id+'" style="border:0;text-align:left;width:100%">'
      + '<div class="tt">'+esc(t.tt)+' · '+esc(acctById(m.account).name)+'</div><div class="ev">'+esc(t.ev)+'</div><div class="grid">'+grid+'</div>'
      + (t.code?'<div class="code"></div>':'')+'</button>';
  }
  function viewCategory(id){
    var cat = catById(id); if(!cat){ location.hash='#/'; return null; }
    var ms = msgsIn(id);
    var tabs = visibleCats().map(function(c){
      return '<button class="tab" data-nav="#/c/'+c.id+'" aria-selected="'+(c.id===id)+'">'+esc(c.name)+' <span class="badge">'+msgsIn(c.id).length+'</span></button>';
    }).join('');
    var body;
    if(!ms.length){ body = '<div class="empty">Nothing here right now — all clear.</div>'; }
    else if(id==='newsletter'){ body = '<div class="list">'+ms.map(newsletterHTML).join('')+'<button class="btn pri wide" style="margin-top:4px" data-act="archiveall" data-cat="newsletter">Archive all read</button></div>'; }
    else if(id==='waiting'){ body = '<div class="list">'+ms.map(waitingHTML).join('')+'</div>'; }
    else if(id==='ticket'){ body = '<div class="list">'+ms.map(ticketCardHTML).join('')+'</div>'; }
    else { body = '<div class="list">'+ms.map(cardHTML).join('')+'</div>'; }
    return {
      top: '<button class="back" data-nav="#/">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' Cockpit</button>'
         + '<h1>'+esc(cat.name)+'</h1>',
      withBack: true,
      tabs: acctSwitcher() + '<div class="tabs">'+tabs+'</div>',
      body: body,
      nav: 'cockpit'
    };
  }

  // ---------- screen: detail ----------
  function viewDetail(id){
    var m = msgById(id); if(!m || m.archived){ location.hash='#/'; return null; }
    var cat = catById(m.cat);
    var parts = [];
    if(m.ticket){
      var t=m.ticket, grid=t.grid.map(function(kv){return '<div><div class="k">'+esc(kv[0])+'</div><div class="v">'+esc(kv[1])+'</div></div>';}).join('');
      parts.push('<div class="ticket '+t.style+'"><div class="tt">'+esc(t.tt)+'</div><div class="ev">'+esc(t.ev)+'</div><div class="grid">'+grid+'</div>'+(t.code?'<div class="code"></div>':'')+'</div>');
      parts.push('<button class="wallet-btn" data-act="wallet" data-id="'+m.id+'">'+svg('<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4z"/><path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',14)+' Add to Apple Wallet</button>');
    }
    if(m.summary){
      parts.push('<div class="panel ai"><p class="h">'+SPARK+' AI summary</p><p>'+esc(m.summary)+'</p></div>');
    } else {
      parts.push('<div class="panel"><p class="h">Message</p><p>'+esc(m.snippet)+'</p></div>');
    }
    if(m.extracted){
      var kv = Object.keys(m.extracted).map(function(k){
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px">'
          + '<span style="color:var(--ink-2)">'+esc(k)+'</span><span style="font-weight:600;text-align:right">'+esc(m.extracted[k])+'</span></div>';
      }).join('');
      parts.push('<div class="panel"><p class="h">'+SPARK+' Extracted details</p>'+kv+'</div>');
    }
    if(m.tasks && m.tasks.length){
      parts.push('<div class="panel"><p class="h">Extracted tasks</p>'+m.tasks.map(function(t){
        return '<div class="task"><span class="box"></span><div>'+esc(t.text)+(t.due?'<br><span class="due">Due · '+esc(t.due)+'</span>':'')+'</div></div>';
      }).join('')+'</div>');
    }
    if(m.reply){
      parts.push('<div class="panel"><p class="h">Suggested reply · professional</p><div class="reply-body">'+esc(m.reply)+'</div>'
        + '<div class="btnrow"><button class="btn pri" data-act="send" data-id="'+m.id+'">Send</button>'
        + '<button class="btn" data-act="edit">Edit</button><button class="btn ghost" data-act="discard">Discard</button></div></div>');
    }
    if(m.cat==='newsletter'){
      parts.push('<div class="btnrow"><button class="btn danger wide" data-act="unsub" data-id="'+m.id+'">Unsubscribe</button></div>');
    }
    parts.push('<div class="btnrow"><button class="btn" data-act="archive" data-id="'+m.id+'">Archive</button>'
      + '<button class="btn danger" data-act="delete" data-id="'+m.id+'">Delete</button></div>');
    return {
      top: '<button class="back" data-nav="#/c/'+m.cat+'">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' '+esc(cat.name)+'</button>'
         + '<h1>'+esc(m.subject)+'</h1><div class="sub"><b>'+esc(m.from)+'</b> · '+esc(m.time)+' '+acctTag(m)+'</div>',
      withBack: true,
      body: '<div class="detail">'+parts.join('')+'</div>',
      nav: 'cockpit'
    };
  }

  // ---------- screen: settings ----------
  function acctRows(){
    return state.accounts.map(function(a){
      var n = state.messages.filter(function(m){ return m.account===a.id && !m.archived; }).length;
      return '<div class="catrow"><span class="grip">'+svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',14)+'</span>'
        + '<span class="cdot" style="background:'+a.color+'"></span>'
        + '<span><span class="cnm">'+esc(a.name)+'</span><br><span class="ccount">'+esc(a.email)+'</span></span>'
        + '<span class="ccount">'+n+' mails</span></div>';
    }).join('');
  }
  function viewSettings(){
    var rows = state.categories.map(function(c){
      return '<div class="catrow"><span class="grip">⠿</span>'
        + '<span class="cdot" style="background:'+c.color+'">'+svg(iconFor(c),13)+'</span>'
        + '<span><span class="cnm">'+esc(c.name)+'</span>'+(c.builtin?'':' <span class="ccount">· custom</span>')+'<br>'
        + '<span class="ccount">'+msgsIn(c.id).length+' mails'+(c.visible?'':' · hidden')+'</span></span>'
        + '<button class="toggle'+(c.visible?'':' off')+'" data-act="togglecat" data-id="'+c.id+'" aria-label="toggle '+esc(c.name)+'"></button></div>';
    }).join('');
    return {
      top: '<button class="back" data-nav="#/">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' Cockpit</button><h1>Categories &amp; rules</h1>',
      withBack: true,
      body: '<div class="view pad" style="padding-top:2px">'
        + '<div class="seghead">Mail accounts · kept separate</div>' + acctRows()
        + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="addacct">+ Add a mail account</button>'
        + '<div class="seghead">Cockpit categories · toggle to show/hide</div>'+rows
        + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="addcat">+ Add a category</button>'
        + '<div class="seghead">Rules</div>'
        + '<div class="rule"><b>Emails from my boss</b> are always <b style="color:var(--c-urgent)">Urgent</b></div>'
        + '<div class="rule"><b>Anything from klm.com</b> → <b style="color:var(--c-ticket)">Tickets</b></div>'
        + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="addrule">+ Add a rule</button>'
        + '<div class="ai-note" style="padding:8px 2px">'+SPARK+'Your last 10 “wrong category” corrections guide every new classification.</div>'
        + '</div>',
      bare: true,
      nav: 'settings'
    };
  }

  // ---------- screen: tasks ----------
  function viewTasks(){
    var items = [];
    state.messages.forEach(function(m){ if(!m.archived && m.tasks) m.tasks.forEach(function(t){ items.push({t:t, m:m}); }); });
    var body = items.length ? '<div class="list">'+items.map(function(it){
      return '<div class="wcard"><div class="task"><span class="box"></span><div>'+esc(it.t.text)
        + (it.t.due?'<br><span class="due">Due · '+esc(it.t.due)+'</span>':'')
        + '<br><span class="ccount" style="font-size:11px;color:var(--ink-3)">from “'+esc(it.m.subject)+'”</span></div></div></div>';
    }).join('')+'</div>' : '<div class="empty">No open tasks. Nice.</div>';
    return { top:'<div class="brand"><span class="dot"></span> MailAI · Tasks</div><h1>Tasks</h1><div class="sub">'+items.length+' extracted from your mail</div>', body:body, nav:'tasks' };
  }

  // ---------- render ----------
  function tabbar(active){
    function b(id,nav,icon,label){ return '<button data-nav="'+nav+'" class="'+(active===id?'on':'')+'">'+svg(icon,20)+label+'</button>'; }
    return '<nav class="tabbar">'
      + b('cockpit','#/','<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>','Cockpit')
      + b('tasks','#/tasks','<path d="M9 11l3 3L22 4"/><path d="M21 12v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"/>','Tasks')
      + b('settings','#/settings','<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>','Settings')
      + '</nav>';
  }

  function render(){
    var h = location.hash || '#/';
    var v;
    if(h.indexOf('#/c/')===0) v = viewCategory(h.slice(4));
    else if(h.indexOf('#/m/')===0) v = viewDetail(h.slice(4));
    else if(h==='#/settings') v = viewSettings();
    else if(h==='#/tasks') v = viewTasks();
    else v = viewCockpit();
    if(!v) return; // a redirect happened
    var html = '<div class="topbar'+(v.withBack?' with-back':'')+'">'+v.top+'</div>'
      + (v.tabs||'')
      + (v.bare ? v.body : '<div class="view">'+v.body+'</div>')
      + tabbar(v.nav);
    root.innerHTML = html;
    // scroll view to top on nav
    var view = root.querySelector('.view'); if(view) view.scrollTop = 0;
  }

  // ---------- toast ----------
  var toastEl;
  function toast(msg){
    if(!toastEl){ toastEl = document.createElement('div'); toastEl.className='toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function(){ toastEl.classList.remove('show'); }, 1800);
  }

  // ---------- actions ----------
  function archive(id, word){ var m=msgById(id); if(m){ m.archived=true; apiPost('/api/messages/'+id+'/archive'); toast((word||'Archived')+' · '+m.from); } }
  function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24) || ('cat'+Date.now()); }

  function handleAct(act, el){
    var id = el.getAttribute('data-id');
    switch(act){
      case 'archive': archive(id); back(); break;
      case 'delete': archive(id,'Deleted'); back(); break;
      case 'done': archive(id,'Marked done'); render(); break;
      case 'unsub': archive(id,'Unsubscribed'); back(); break;
      case 'send': archive(id,'Reply sent'); back(); break;
      case 'wallet': toast('Added to Apple Wallet (demo)'); break;
      case 'edit': toast('Editing (demo)'); break;
      case 'discard': toast('Draft discarded'); break;
      case 'addrule': toast('Rule editor coming in a later sprint'); break;
      case 'archiveall': {
        var c = el.getAttribute('data-cat');
        msgsIn(c).forEach(function(m){ m.archived=true; });
        toast('Archived all'); render(); break;
      }
      case 'setacct': { sel = id; render(); break; }
      case 'addacct': {
        if(API_OK){
          // Backend flow: demo adds instantly; live returns a Google OAuth URL.
          fetch('/api/accounts/connect', { method:'POST', credentials:'same-origin',
            headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({}) })
            .then(function(r){ return r.json(); })
            .then(function(d){
              if(d && d.authorize_url){ window.location.href = d.authorize_url; return; }
              toast('Mail account connected · kept separate'); load();
            })
            .catch(function(){ toast('Could not connect account'); });
          break;
        }
        // Offline/static fallback: add a local demo account.
        var email = window.prompt('Connect a mail account — enter its address (e.g. you@work.com):');
        if(email && email.trim()){
          var pal = ['#3E7BF0','#0FA398','#8257E6','#EA580C','#D6336C'];
          var nm = (window.prompt('Label this account (e.g. Work, Private):') || email.split('@')[0]).trim();
          state.accounts.push({ id:'acct'+Date.now(), name:nm, email:email.trim(), color:pal[state.accounts.length % pal.length] });
          toast('Connected “'+nm+'” · kept separate');
        }
        render(); break;
      }
      case 'togglecat': { var cat=catById(id); if(cat){ cat.visible=!cat.visible; apiPost('/api/categories/'+id+'/visibility',{visible:cat.visible}); } render(); break; }
      case 'addcat': {
        var name = window.prompt('New category name (e.g. Finance & bills):');
        if(name && name.trim()){
          var color = CUSTOM_COLORS[state.categories.filter(function(c){return !c.builtin;}).length % CUSTOM_COLORS.length];
          state.categories.push({ id: slug(name)+'-'+(Date.now()%1000), name: name.trim(), color: color, icon: GENERIC_ICON, hint: 'mails', visible: true, builtin: false });
          toast('Added “'+name.trim()+'” · define its rule in Settings');
        }
        render(); break;
      }
    }
  }
  function back(){
    // go to the category of the last message acted on, else cockpit
    if(location.hash.indexOf('#/m/')===0){ var m=msgById(location.hash.slice(4)); location.hash = m ? '#/c/'+m.cat : '#/'; }
    else render();
  }

  // ---------- events ----------
  document.addEventListener('click', function(e){
    var navEl = e.target.closest('[data-nav]');
    var actEl = e.target.closest('[data-act]');
    if(actEl){ e.preventDefault(); handleAct(actEl.getAttribute('data-act'), actEl); return; }
    if(navEl){ e.preventDefault(); var to = navEl.getAttribute('data-nav'); if(location.hash===to) render(); else location.hash = to; }
  });
  window.addEventListener('hashchange', render);

  // ---------- data bootstrap (API with fixtures fallback) ----------
  function apiPost(path, body){
    if(!API_OK) return;
    fetch(path, { method:'POST', credentials:'same-origin',
      headers:{ 'Content-Type':'application/json' }, body: body ? JSON.stringify(body) : null }).catch(function(){});
  }
  function boot(data){
    state = JSON.parse(JSON.stringify({ accounts:data.accounts, categories:data.categories, messages:data.messages }));
    render();
  }
  function load(){
    var http = location.protocol === 'http:' || location.protocol === 'https:';
    if(!http || !window.fetch){ boot(window.MAILAI_FIXTURES); return; }
    fetch('/api/inbox', { credentials:'same-origin' })
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){ API_OK = true; boot(d); })
      .catch(function(){ boot(window.MAILAI_FIXTURES); });
  }
  load();
})();
