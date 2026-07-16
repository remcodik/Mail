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

  // ---------- labels + learning loop ----------
  function labelById(id){ return (state.labels||[]).filter(function(l){ return l.id===id; })[0]; }
  function labelChips(m){
    if(!m.labels || !m.labels.length) return '';
    return m.labels.map(function(id){ var l=labelById(id); return l ? '<span class="lbl mini" style="--lc:'+l.color+'">'+esc(l.name)+'</span>' : ''; }).join('');
  }
  function labelCount(id){ return state.messages.filter(function(m){ return !m.archived && inSel(m) && (m.labels||[]).indexOf(id)>=0; }).length; }

  var LEARN_KEY = 'mailai-learn-v1';
  function loadLearned(){ try { return JSON.parse(localStorage.getItem(LEARN_KEY)) || []; } catch(e){ return []; } }
  function saveLearned(){ try { localStorage.setItem(LEARN_KEY, JSON.stringify(state.labelRules||[])); } catch(e){} }
  function learnRule(sender, labelId, action){
    state.labelRules = (state.labelRules||[]).filter(function(r){ return !(r.sender===sender && r.labelId===labelId); });
    state.labelRules.push({ sender: sender, labelId: labelId, action: action });
    saveLearned();
  }
  function applyRule(sender, labelId, action){
    var n = 0;
    state.messages.forEach(function(m){
      if(m.from !== sender) return;
      if(!m.labels) m.labels = [];
      var i = m.labels.indexOf(labelId);
      if(action==='add' && i<0){ m.labels.push(labelId); }
      else if(action==='remove' && i>=0){ m.labels.splice(i,1); }
      n++;
    });
    return n;
  }
  function applyLearnedToAll(){ (state.labelRules||[]).forEach(function(r){ applyRule(r.sender, r.labelId, r.action); }); }
  var pendingProposal = null;   // {sender,labelId,action,others,labelName,msgId} awaiting approval
  function fixLabel(msgId, labelId){
    var m = msgById(msgId); if(!m) return;
    if(!m.labels) m.labels = [];
    var i = m.labels.indexOf(labelId);
    var adding = i < 0;
    if(adding) m.labels.push(labelId); else m.labels.splice(i, 1);  // this email only
    var l = labelById(labelId);
    toast((adding ? 'Labelled “' : 'Removed “') + (l?l.name:labelId) + '” on this email');
    // propose generalising to all mail from this sender — you approve or decline
    var others = state.messages.filter(function(x){ return x.from===m.from && x.id!==m.id && !x.archived; }).length;
    pendingProposal = { sender:m.from, labelId:labelId, action:(adding?'add':'remove'), others:others, labelName:(l?l.name:labelId), msgId:msgId };
  }
  function proposalBar(){
    if(!pendingProposal) return '';
    var p = pendingProposal;
    var verb = p.action==='add' ? 'tag' : 'stop tagging';
    var scope = p.others>0 ? (' — updates '+p.others+' other mail'+(p.others===1?'':'s')) : '';
    return '<div class="proposal"><div class="ptext">'+SPARK+' Make this a rule? '
      + '<b>Always '+verb+' mail from '+esc(p.sender)+' as “'+esc(p.labelName)+'”</b>'+scope+'.</div>'
      + '<div class="pacts"><button class="btn pri" data-act="applyrule">Apply rule</button>'
      + '<button class="btn" data-act="dismissrule">Just this one</button></div></div>';
  }

  function labelsRow(){
    if(!state.labels || !state.labels.length) return '';
    var chips = state.labels.map(function(l){
      return '<button class="lblchip" style="--lc:'+l.color+'" data-nav="#/label/'+l.id+'">'+esc(l.name)+' <b>'+labelCount(l.id)+'</b></button>';
    }).join('');
    return '<div class="lblrow"><span class="lblrow-h">'+SPARK+' Labels</span>'+chips+'</div>';
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
      body: acctSwitcher() + labelsRow()
          + '<div class="hero">'
          + '<button class="hstat" data-nav="#/focus/need"><div class="big">'+needYou+'</div><div class="hl">need you today ›</div></button>'
          + '<button class="hstat soft" data-nav="#/focus/auto"><div class="big">'+autoHandled+'</div><div class="hl">auto-handled ›</div></button>'
          + '</div>'
          + '<div class="herohint">Tap a number to see those emails. <b>Need you</b> = waiting on your action (urgent, replies, overdue). <b>Auto-handled</b> = MailAI already sorted it (newsletters, receipts, deliveries…).</div>'
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
      + '<span class="chip-wrap" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px"><span class="chip" style="--cc:'+catById(m.cat).color+'">'+esc(m.chip||catById(m.cat).name)+'</span>'+acctTag(m)+labelChips(m)+'</span></span></button>';
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

  // ---------- screen: focus (need-you / auto-handled) ----------
  function isNeedYou(m){ return m.needsAction || m.cat==='reply' || (m.cat==='waiting' && m.overdue); }
  function viewFocus(kind){
    var ms = state.messages.filter(function(m){ if(m.archived || !inSel(m)) return false; return kind==='need' ? isNeedYou(m) : !isNeedYou(m); });
    var title = kind==='need' ? 'Need you today' : 'Auto-handled';
    var desc = kind==='need'
      ? 'Emails waiting on <b>your action</b> — urgent items, replies to send, and overdue follow-ups.'
      : 'MailAI <b>already sorted these</b> — newsletters, receipts, deliveries and FYIs you don’t need to act on.';
    var body = '<div class="focusdesc">'+desc+'</div>'
      + (ms.length ? '<div class="list">'+ms.map(cardHTML).join('')+'</div>' : '<div class="empty">Nothing here right now.</div>');
    return {
      top: '<button class="back" data-nav="#/">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' Cockpit</button><h1>'+title+'</h1>',
      withBack: true, tabs: acctSwitcher(), body: body, nav: 'cockpit'
    };
  }

  // ---------- screen: label filter ----------
  function viewLabel(id){
    var l = labelById(id); if(!l){ location.hash='#/'; return null; }
    var ms = state.messages.filter(function(m){ return !m.archived && inSel(m) && (m.labels||[]).indexOf(id)>=0; });
    var body = ms.length ? '<div class="list">'+ms.map(cardHTML).join('')+'</div>'
                         : '<div class="empty">No mail labelled “'+esc(l.name)+'” in this view.</div>';
    return {
      top: '<button class="back" data-nav="#/">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' Cockpit</button>'
         + '<h1><span class="lbl" style="--lc:'+l.color+';font-size:.8em;vertical-align:middle">'+esc(l.name)+'</span></h1>',
      withBack: true, tabs: acctSwitcher(), body: body, nav: 'cockpit'
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
    // labels — AI-assigned, tap to fix (the app learns from the change)
    var lblEditor = (state.labels||[]).map(function(l){
      var on = (m.labels||[]).indexOf(l.id) >= 0;
      return '<button class="lbl '+(on?'on':'off')+'" style="--lc:'+l.color+'" data-act="fixlabel" data-id="'+m.id+'" data-label="'+l.id+'">'+(on?'':'+ ')+esc(l.name)+'</button>';
    }).join('');
    parts.push('<div class="panel"><p class="h">'+SPARK+' Labels · tap to fix</p><div class="lbledit">'+lblEditor
      + '<button class="lbl new" data-act="newlabel" data-id="'+m.id+'">+ New</button></div>'
      + '<div class="ai-note" style="margin-top:8px">I assign these automatically and learn from your corrections.</div></div>');
    if(m.extracted){
      var kv = Object.keys(m.extracted).map(function(k){
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px">'
          + '<span style="color:var(--ink-2)">'+esc(k)+'</span><span style="font-weight:600;text-align:right">'+esc(m.extracted[k])+'</span></div>';
      }).join('');
      parts.push('<div class="panel"><p class="h">'+SPARK+' Extracted details</p>'+kv+'</div>');
    }
    if(m.tasks && m.tasks.length){
      parts.push('<div class="panel"><p class="h">Extracted tasks</p>'+m.tasks.map(function(t,ti){
        var added = (state.tasks||[]).some(function(x){ return x.msgId===m.id && x.text===t.text; });
        return '<div class="task"><span class="box"></span><div style="flex:1">'+esc(t.text)+(t.due?'<br><span class="due">Due · '+esc(t.due)+'</span>':'')+'</div>'
          + '<button class="miniadd'+(added?' done':'')+'" data-act="addtask" data-id="'+m.id+'" data-ti="'+ti+'"'+(added?' disabled':'')+'>'+(added?'✓ Added':'+ Task')+'</button></div>';
      }).join('')+'</div>');
    }
    parts.push('<button class="btn wide" data-act="newtask" data-id="'+m.id+'" style="border-style:dashed;color:var(--accent-ink)">+ Create task from this email</button>');
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
        + '<div class="seghead">Labels · AI-assigned, you correct</div>'
        + (state.labels||[]).map(function(l){ return '<div class="catrow"><span class="grip">#</span><span class="cdot" style="background:'+l.color+'"></span><span><span class="cnm">'+esc(l.name)+'</span><br><span class="ccount">'+labelCount(l.id)+' mails</span></span></div>'; }).join('')
        + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="newlabeldef">+ Add a label</button>'
        + ((state.labelRules&&state.labelRules.length) ? '<div class="seghead">Learned from your fixes</div>'+state.labelRules.map(function(r){ var l=labelById(r.labelId); return '<div class="rule">Mail from <b>'+esc(r.sender)+'</b> '+(r.action==='add'?'→ tag':'✗ not')+' <b style="color:'+(l?l.color:'#888')+'">'+(l?esc(l.name):esc(r.labelId))+'</b></div>'; }).join('') : '')
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
  function taskRow(t){
    var m = msgById(t.msgId);
    return '<div class="tkrow'+(t.done?' done':'')+'">'
      + '<button class="tkbox'+(t.done?' on':'')+'" data-act="taskdone" data-id="'+t.id+'" aria-label="toggle done">'+(t.done?svg('<path d="M4 12l6 6L20 6"/>',13):'')+'</button>'
      + '<div class="tkbody"><div class="tktext">'+esc(t.text)+'</div>'
      + (t.due?'<div class="due">Due · '+esc(t.due)+'</div>':'')
      + (m?'<button class="tklink" data-nav="#/m/'+m.id+'">'+svg('<path d="M14 4h6v6M20 4l-9 9M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/>',11)+' '+esc(m.from)+' — '+esc(m.subject)+'</button>':'')
      + '</div></div>';
  }
  function viewTasks(){
    var open = (state.tasks||[]).filter(function(t){ return !t.done; });
    var done = (state.tasks||[]).filter(function(t){ return t.done; });
    var body = '<div class="list">'
      + (open.length ? open.map(taskRow).join('') : '<div class="empty">No open tasks. Add one from any email.</div>')
      + (done.length ? '<div class="seghead">Done</div>'+done.map(taskRow).join('') : '')
      + '</div>';
    return { top:'<div class="brand"><span class="dot"></span> MailAI · Tasks</div><h1>Tasks</h1><div class="sub">'+open.length+' open · each linked to its mail</div>', body:body, nav:'tasks' };
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
    else if(h.indexOf('#/focus/')===0) v = viewFocus(h.slice(8));
    else if(h.indexOf('#/label/')===0) v = viewLabel(h.slice(8));
    else if(h.indexOf('#/m/')===0) v = viewDetail(h.slice(4));
    else if(h==='#/settings') v = viewSettings();
    else if(h==='#/tasks') v = viewTasks();
    else v = viewCockpit();
    if(!v) return; // a redirect happened
    var html = '<div class="topbar'+(v.withBack?' with-back':'')+'">'+v.top+'</div>'
      + (v.tabs||'')
      + (v.bare ? v.body : '<div class="view">'+v.body+'</div>')
      + proposalBar()
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
      case 'fixlabel': { fixLabel(id, el.getAttribute('data-label')); render(); break; }
      case 'applyrule': {
        if(pendingProposal){ var p=pendingProposal;
          learnRule(p.sender, p.labelId, p.action);
          var n = applyRule(p.sender, p.labelId, p.action);
          apiPost('/api/messages/'+p.msgId+'/labels', { label_id: p.labelId }); // learns server-side when live
          toast('Rule saved · applied to '+n+' mail'+(n===1?'':'s')+' from '+p.sender);
          pendingProposal = null;
        }
        render(); break;
      }
      case 'dismissrule': { pendingProposal = null; toast('Kept it to just this email'); render(); break; }
      case 'newlabel': {
        var lnm = window.prompt('New label (e.g. Project X, Customer Acme, tax-2026):');
        if(lnm && lnm.trim()){
          var lid = slug(lnm)+'-'+(Date.now()%1000);
          state.labels.push({ id:lid, name:lnm.trim(), color:CUSTOM_COLORS[state.labels.length % CUSTOM_COLORS.length] });
          fixLabel(id, lid);
        }
        render(); break;
      }
      case 'newlabeldef': {
        var dnm = window.prompt('New label name:');
        if(dnm && dnm.trim()){ state.labels.push({ id:slug(dnm)+'-'+(Date.now()%1000), name:dnm.trim(), color:CUSTOM_COLORS[state.labels.length % CUSTOM_COLORS.length] }); toast('Label “'+dnm.trim()+'” created'); }
        render(); break;
      }
      case 'addtask': {
        var mm = msgById(id), ti = parseInt(el.getAttribute('data-ti'),10), tt = mm.tasks[ti];
        if(!(state.tasks||[]).some(function(x){ return x.msgId===id && x.text===tt.text; })){
          state.tasks.push({ id:id+'-t'+ti, text:tt.text, due:tt.due, done:false, msgId:id });
          toast('Added to Tasks · linked to this mail');
        }
        render(); break;
      }
      case 'newtask': {
        var ntx = window.prompt('New task from this email:');
        if(ntx && ntx.trim()){ state.tasks.push({ id:'t'+Date.now(), text:ntx.trim(), due:'', done:false, msgId:id }); toast('Task created · linked to this mail'); }
        render(); break;
      }
      case 'taskdone': { var tk=(state.tasks||[]).filter(function(x){ return x.id===id; })[0]; if(tk){ tk.done=!tk.done; } render(); break; }
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
    state = JSON.parse(JSON.stringify({ accounts:data.accounts, categories:data.categories, labels:data.labels||[], messages:data.messages }));
    state.messages.forEach(function(m){ if(!m.labels) m.labels = []; });
    // a couple of example tasks so the screen isn't empty; each linked to its mail.
    // (extracted tasks on the detail screen stay actionable via "+ Task".)
    state.tasks = [
      { id:'seed1', text:'Send the revised Q3 revenue slide', due:'Today · 12:00', done:false, msgId:'m1' },
      { id:'seed2', text:'Approve the vendor invoice before month-end', due:'', done:false, msgId:'m20' }
    ];
    // learned label rules survive reloads (localStorage) and re-apply on load
    state.labelRules = loadLearned();
    applyLearnedToAll();
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
