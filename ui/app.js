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
  var BRANDMARK = '<span class="brandmark">' + SPARK + '</span>';   // sparkle from the app icon
  function catById(id){ return state.categories.filter(function(c){ return c.id===id; })[0]; }
  function acctById(id){ return state.accounts.filter(function(a){ return a.id===id; })[0]; }
  function visibleCats(){ return state.categories.filter(function(c){ return c.visible; }); }
  function inSel(m){ return sel==='all' || m.account===sel; }
  function isActive(m){ return !m.archived && !m.snoozed; }   // shown in the cockpit
  function msgsIn(id){ return state.messages.filter(function(m){ return m.cat===id && isActive(m) && inSel(m); }); }
  function msgById(id){ return state.messages.filter(function(m){ return m.id===id; })[0]; }
  function taskById(id){ return (state.tasks||[]).filter(function(t){ return t.id===id; })[0]; }
  function guessKeyword(subject){ var w=(subject||'').replace(/[^a-z0-9 ]/gi,' ').split(/\s+/).filter(function(x){ return x.length>4; }); return (w[0]||subject||'').toLowerCase(); }

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
  function ruleWho(r){ return r.scope==='domain' ? ('@'+r.value) : r.scope==='subject' ? ('“'+r.value+'” in subject') : r.value; }
  function rulePrefix(r){ return r.scope==='subject' ? 'Mail with ' : 'Mail from '; }
  function labelChips(m){
    if(!m.labels || !m.labels.length) return '';
    return m.labels.map(function(id){ var l=labelById(id); return l ? '<span class="lbl mini" style="--lc:'+l.color+'">'+esc(l.name)+'</span>' : ''; }).join('');
  }
  function labelCount(id){ return state.messages.filter(function(m){ return isActive(m) && inSel(m) && (m.labels||[]).indexOf(id)>=0; }).length; }

  // ---- mirror to Gmail: categories + labels become Gmail labels under "MailAI/" ----
  var MIRROR_KEY = 'mailai-mirror-gmail-v1';
  function loadMirror(){ try { return localStorage.getItem(MIRROR_KEY) === '1'; } catch(e){ return false; } }
  function saveMirror(){ try { localStorage.setItem(MIRROR_KEY, state.mirrorGmail ? '1' : '0'); } catch(e){} }
  // category → the "main" Gmail label (exactly one); labels → extra Gmail labels.
  function gmailLabelNames(m){
    var c = catById(m.cat);
    var out = ['MailAI/' + (c ? c.name : m.cat)];
    (m.labels||[]).forEach(function(id){ var l = labelById(id); if(l) out.push('MailAI/' + l.name); });
    return out;
  }

  // ---- language: switch all UI labels & text between English and Dutch ----
  var LANG_KEY = 'mailai-lang-v1';
  function loadLang(){ try { return localStorage.getItem(LANG_KEY) === 'nl' ? 'nl' : 'en'; } catch(e){ return 'en'; } }
  function saveLang(){ try { localStorage.setItem(LANG_KEY, state.lang === 'nl' ? 'nl' : 'en'); } catch(e){} }
  // English UI phrase -> Dutch. Only exact, whole phrases translate, so email
  // content (senders, subjects, bodies) is never touched — just the app's chrome.
  var DICT = {
    // nav + cockpit
    'Cockpit':'Cockpit','Tasks':'Taken','Archive':'Archief','Settings':'Instellingen',
    'Good morning, Remco':'Goedemorgen, Remco','need you today ›':'heeft je aandacht ›',
    'auto-handled ›':'automatisch afgehandeld ›','Add a category tile':'Categorietegel toevoegen',
    'active':'actief',
    'Tap a number to see those emails. Need you = waiting on your action (urgent, replies, overdue). Auto-handled = MailAI already sorted it (newsletters, receipts, deliveries…).':
      'Tik op een getal om die e-mails te zien. Aandacht = wacht op jou (urgent, antwoorden, te laat). Automatisch = MailAI heeft het al gesorteerd (nieuwsbrieven, bonnen, bezorgingen…).',
    'need you':'aandacht','auto-handled':'automatisch',
    // category names + chip
    'Urgent':'Urgent','Reply':'Beantwoorden','Deliveries':'Bezorgingen','Purchases':'Aankopen',
    'Travel':'Reizen','Newsletter':'Nieuwsbrief','Tickets':'Tickets','Waiting':'Wachtend',
    'Junk':'Ongewenst','FYI':'Ter info','Reply needed':'Antwoord nodig','filed':'gearchiveerd',
    // focus screens
    'need you today':'heeft je aandacht','auto-handled today':'automatisch afgehandeld',
    // cards / detail panels
    'Full email':'Volledige e-mail','Labels · tap to fix':'Labels · tik om te corrigeren',
    'Category · tap to fix':'Categorie · tik om te corrigeren','In Gmail':'In Gmail',
    'Extracted details':'Uitgelezen gegevens','Extracted tasks':'Uitgelezen taken',
    'Suggested reply · professional':'Voorgesteld antwoord · zakelijk',
    'I assign these automatically and learn from your corrections.':'Ik wijs deze automatisch toe en leer van je correcties.',
    'Wrong bucket? Tap the right one — I learn from it.':'Verkeerde categorie? Tik de juiste — ik leer ervan.',
    'These appear on this mail in the Gmail app too. The first is the main label (your category); the rest are your labels.':
      'Deze verschijnen ook bij deze mail in de Gmail-app. De eerste is het hoofdlabel (je categorie); de rest zijn je labels.',
    // buttons
    'Send':'Versturen','Edit':'Bewerken','Discard':'Weggooien','Delete':'Verwijderen',
    'Archive (file it)':'Archiveren (opbergen)','Restore to inbox':'Terug naar inbox',
    'Move to cockpit':'Naar cockpit','Unsubscribe':'Uitschrijven','+ New':'+ Nieuw',
    '+ Create task from this email':'+ Maak een taak van deze e-mail',
    '+ Propose meeting for agenda':'+ Stel afspraak voor agenda voor',
    'Wake now':'Nu wekken','Cancel':'Annuleren','Apply rule':'Regel toepassen',
    'Just this one':'Alleen deze','This sender':'Deze afzender','Subject…':'Onderwerp…',
    // choosers
    'Later today':'Later vandaag','Tomorrow':'Morgen','Weekend':'Weekend','Next week':'Volgende week',
    '3 days':'3 dagen','1 week':'1 week','2 weeks':'2 weken',
    // settings
    'Categories & rules':'Categorieën & regels','Cockpit':'Cockpit','Show in Gmail':'Weergeven in Gmail',
    'Language':'Taal','English':'Engels','Dutch':'Nederlands',
    'Mirror categories & labels to Gmail':'Categorieën & labels spiegelen naar Gmail',
    'Mail accounts · kept separate':'Mailaccounts · gescheiden gehouden',
    'Cockpit categories · toggle to show/hide':'Cockpit-categorieën · toon/verberg',
    'Labels · AI-assigned, you correct':'Labels · door AI toegewezen, jij corrigeert',
    'Label rules · learned + yours':'Labelregels · geleerd + eigen',
    'Rules':'Regels','+ Add a category':'+ Categorie toevoegen','+ Add a label':'+ Label toevoegen',
    '+ Add a label rule':'+ Labelregel toevoegen','+ Add a rule':'+ Regel toevoegen',
    '+ Add a mail account':'+ Mailaccount toevoegen',
    'File everything to Archive (empty cockpit)':'Alles archiveren (cockpit legen)',
    'Switch the whole app between English and Dutch':'Wissel de hele app tussen Engels en Nederlands',
    // tasks / agenda
    'Set due':'Deadline','Change due':'Deadline wijzigen','Agenda · proposed meetings':'Agenda · voorgestelde afspraken',
    'Send proposal':'Voorstel sturen','Remove':'Verwijderen','Meeting':'Afspraak','with':'met',
    'Agenda':'Agenda','Open Google Calendar':'Google Agenda openen','Add to Google Calendar':'Aan Google Agenda toevoegen',
    '+ Add calendar':'+ Agenda toevoegen','Proposed by MailAI':'Voorgesteld door MailAI','Resend':'Opnieuw sturen',
    'Personal':'Persoonlijk','Work':'Werk','Family':'Familie','NL Holidays':'NL Feestdagen',
    'No events in the calendars you’re viewing.':'Geen afspraken in de agenda’s die je bekijkt.',
    // archive
    'Empty archive':'Archief legen','tap to review':'tik om te bekijken',
    '⏭ Advance demo clock (wake due snoozes)':'⏭ Demo-klok vooruit (wek gesnoozede mails)',
    // empty states / toasts
    'Nothing here yet.':'Nog niets hier.','Archived':'Gearchiveerd','Snoozed':'Gesnoozed',
    'Woke':'Gewekt','Gmail sync on · these show as labels in Gmail':'Gmail-sync aan · deze verschijnen als labels in Gmail',
    'Gmail sync off':'Gmail-sync uit','Added to agenda':'Toegevoegd aan agenda','Proposal sent':'Voorstel verstuurd'
  };
  function t(s){ return (state && state.lang === 'nl' && DICT[s] != null) ? DICT[s] : s; }
  // post-render pass: translate matching text nodes + a couple of attributes.
  function localize(rootEl){
    if(!(state && state.lang === 'nl')) return;
    var seg = function(raw){
      var key = raw.trim();
      if(DICT[key] != null) return raw.replace(key, DICT[key]);
      if(raw.indexOf(' · ') >= 0){
        var hit = false, parts = raw.split(' · ').map(function(p){ var k=p.trim(); if(DICT[k]!=null){ hit=true; return p.replace(k, DICT[k]); } return p; });
        if(hit) return parts.join(' · ');
      }
      return null;
    };
    var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    var n, jobs = [];
    while((n = walker.nextNode())){ var out = seg(n.nodeValue); if(out != null && out !== n.nodeValue) jobs.push([n, out]); }
    jobs.forEach(function(j){ j[0].nodeValue = j[1]; });
    Array.prototype.forEach.call(rootEl.querySelectorAll('[aria-label],[placeholder]'), function(el){
      ['aria-label','placeholder'].forEach(function(a){ var v = el.getAttribute(a); if(v && DICT[v] != null) el.setAttribute(a, DICT[v]); });
    });
  }

  var LEARN_KEY = 'mailai-learn-v2';
  function loadLearned(){
    try {
      var raw = JSON.parse(localStorage.getItem(LEARN_KEY)) || JSON.parse(localStorage.getItem('mailai-learn-v1')) || [];
      return raw.map(function(x){ return x.scope ? x : { scope:'sender', value:x.sender, labelId:x.labelId, action:x.action }; });
    } catch(e){ return []; }
  }
  function saveLearned(){ try { localStorage.setItem(LEARN_KEY, JSON.stringify(state.labelRules||[])); } catch(e){} }
  function ruleMatches(rule, m){ return rule.scope==='domain' ? m.domain===rule.value : rule.scope==='subject' ? (m.subject||'').toLowerCase().indexOf((rule.value||'').toLowerCase())>=0 : m.from===rule.value; }
  function learnRule(rule){
    state.labelRules = (state.labelRules||[]).filter(function(r){ return !(r.scope===rule.scope && r.value===rule.value && r.labelId===rule.labelId); });
    state.labelRules.push(rule);
    saveLearned();
  }
  function applyRule(rule){
    var n = 0;
    state.messages.forEach(function(m){
      if(!ruleMatches(rule, m)) return;
      if(!m.labels) m.labels = [];
      var i = m.labels.indexOf(rule.labelId);
      if(rule.action==='add' && i<0){ m.labels.push(rule.labelId); }
      else if(rule.action==='remove' && i>=0){ m.labels.splice(i,1); }
      n++;
    });
    return n;
  }
  // recompute from the original AI assignments + current rules (clean add/undo)
  function recomputeLabels(){ state.messages.forEach(function(m){ m.labels = (state.originalLabels[m.id]||[]).slice(); }); (state.labelRules||[]).forEach(applyRule); }
  function recomputeCats(){ state.messages.forEach(function(m){ m.cat = state.originalCat[m.id]; }); (state.catRules||[]).forEach(applyCatRule); }
  function recomputeAll(){ recomputeLabels(); recomputeCats(); }

  // ---- category rules (correction loop, mirrors labels) ----
  var CATRULE_KEY = 'mailai-catrules-v1';
  function loadCatRules(){ try { return JSON.parse(localStorage.getItem(CATRULE_KEY)) || []; } catch(e){ return []; } }
  function saveCatRules(){ try { localStorage.setItem(CATRULE_KEY, JSON.stringify(state.catRules||[])); } catch(e){} }
  function catRuleMatches(rule, m){ return rule.scope==='domain' ? m.domain===rule.value : rule.scope==='subject' ? (m.subject||'').toLowerCase().indexOf((rule.value||'').toLowerCase())>=0 : m.from===rule.value; }
  function applyCatRule(rule){ state.messages.forEach(function(m){ if(catRuleMatches(rule, m)) m.cat = rule.catId; }); }
  function learnCatRule(rule){ state.catRules = (state.catRules||[]).filter(function(r){ return !(r.scope===rule.scope && r.value===rule.value); }); state.catRules.push(rule); saveCatRules(); }
  var pendingProposal = null;   // {sender,labelId,action,others,labelName,msgId} awaiting approval
  function fixLabel(msgId, labelId){
    var m = msgById(msgId); if(!m) return;
    if(!m.labels) m.labels = [];
    var i = m.labels.indexOf(labelId);
    var adding = i < 0;
    if(adding) m.labels.push(labelId); else m.labels.splice(i, 1);  // this email only
    var l = labelById(labelId);
    toast((adding ? 'Labelled “' : 'Removed “') + (l?l.name:labelId) + '” on this email');
    // propose generalising it — you approve, adjust the scope, or decline
    pendingProposal = { sender:m.from, domain:m.domain, subject:m.subject, labelId:labelId, action:(adding?'add':'remove'), labelName:(l?l.name:labelId), msgId:msgId, scope:'sender' };
  }
  function scopeTarget(p){ return p.scope==='domain' ? ('anyone @'+p.domain) : p.scope==='subject' ? ('“'+p.subjectWord+'” in the subject') : p.sender; }
  function scopePrefix(p){ return p.scope==='subject' ? 'mail with ' : 'mail from '; }
  function scopeAffected(p){ return state.messages.filter(function(m){ return (p.scope==='domain' ? m.domain===p.domain : p.scope==='subject' ? (m.subject||'').toLowerCase().indexOf((p.subjectWord||'').toLowerCase())>=0 : m.from===p.sender) && !m.archived; }).length; }
  function scopeSegs(p, act){
    return '<div class="pscope"><button class="pseg'+(p.scope==='sender'?' on':'')+'" data-act="'+act+'" data-v="sender">This sender</button>'
      + '<button class="pseg'+(p.scope==='domain'?' on':'')+'" data-act="'+act+'" data-v="domain">@'+esc(p.domain)+'</button>'
      + '<button class="pseg'+(p.scope==='subject'?' on':'')+'" data-act="'+act+'" data-v="subject">Subject…</button></div>';
  }
  function proposalBar(){
    if(!pendingProposal) return '';
    var p = pendingProposal;
    var verb = p.action==='add' ? 'tag' : 'stop tagging';
    return '<div class="proposal"><div class="ptext">'+SPARK+' Make it a rule? '
      + '<b>Always '+verb+' '+scopePrefix(p)+esc(scopeTarget(p))+' as “'+esc(p.labelName)+'”</b> — '+scopeAffected(p)+' mail'+(scopeAffected(p)===1?'':'s')+'.</div>'
      + scopeSegs(p, 'scope')
      + '<div class="pacts"><button class="btn pri" data-act="applyrule">Apply rule</button>'
      + '<button class="btn" data-act="dismissrule">Just this one</button></div></div>';
  }

  // category correction — mirrors the label loop
  var pendingCatProposal = null;
  function setCat(msgId, catId){
    var m = msgById(msgId); if(!m || m.cat===catId) return;
    m.cat = catId;   // this email only
    var c = catById(catId);
    toast('Moved to '+(c?c.name:catId));
    pendingCatProposal = { sender:m.from, domain:m.domain, subject:m.subject, catId:catId, catName:(c?c.name:catId), msgId:msgId, scope:'sender' };
  }
  function catProposalBar(){
    if(!pendingCatProposal) return '';
    var p = pendingCatProposal;
    return '<div class="proposal"><div class="ptext">'+SPARK+' Make it a rule? <b>Always put '+scopePrefix(p)+esc(scopeTarget(p))+' in “'+esc(p.catName)+'”</b> — '+scopeAffected(p)+' mail'+(scopeAffected(p)===1?'':'s')+'.</div>'
      + scopeSegs(p, 'catscope')
      + '<div class="pacts"><button class="btn pri" data-act="applycatrule">Apply rule</button><button class="btn" data-act="dismisscatrule">Just this one</button></div></div>';
  }

  // newsletter unsubscribe — confirm first
  var pendingUnsub = null;
  function unsubBar(){
    if(!pendingUnsub) return '';
    var m = msgById(pendingUnsub);
    return '<div class="proposal"><div class="ptext">'+SPARK+' Unsubscribe from <b>'+esc(m?m.from:'')+'</b>? MailAI sends the List-Unsubscribe request, then files the email.</div>'
      + '<div class="pacts"><button class="btn danger" data-act="unsubconfirm">Unsubscribe</button><button class="btn" data-act="unsubcancel">Cancel</button></div></div>';
  }

  // sent-mail follow-up: if a reply/mail asks for something, offer a reminder
  function looksLikeRequest(text){ return /\?|please|could you|can you|let me know|get back|by (friday|monday|tomorrow|eod|end of)|availability|when (are|can|could|will)|waiting|need|kindly|follow ?up/i.test(text||''); }
  var pendingFollowup = null;   // {to, subject, account} awaiting a follow-up-in choice
  var FOLLOWUP_OPTS = [['3 days'], ['1 week'], ['2 weeks']];
  function followupBar(){
    if(!pendingFollowup) return '';
    var p = pendingFollowup;
    return '<div class="proposal"><div class="ptext">'+SPARK+' That asks '+esc(p.to)+' for something. <b>Remind you to follow up</b> if no reply?</div>'
      + '<div class="pacts" style="flex-wrap:wrap">'
      + FOLLOWUP_OPTS.map(function(o){ return '<button class="btn" data-act="followuppick" data-label="'+o[0]+'">'+o[0]+'</button>'; }).join('')
      + '<button class="btn ghost" data-act="followupcancel">No thanks</button></div></div>';
  }
  function makeFollowup(to, subject, account, label){
    var id = 'w'+Date.now();
    state.originalCat[id] = 'waiting'; state.originalLabels[id] = [];
    state.messages.push({ id:id, cat:'waiting', account:account, from:'To: '+to, to:to, initials:'→', av:'#0FA398',
      subject:'Awaiting reply — '+subject, snippet:'You asked '+to+' for a reply. I’ll flag this if nothing comes back within '+label+'.',
      chip:'Awaiting reply', days:0, overdue:false, time:'just now', domain:'', labels:[],
      reply:'Hi — just following up on my note below, whenever you get a chance. Thanks!' });
    state.tasks.push({ id:'t'+Date.now(), text:'Follow up with '+to+' · '+subject, due:'in '+label, done:false, msgId:id });
    toast('Reminder set · I’ll nudge you in '+label+' + added to Tasks');
  }

  // scheduling: if a mail is about meeting up, propose an appointment for the agenda
  function looksScheduley(m){
    var s = ((m.subject||'')+' '+(m.snippet||'')+' '+(m.summary||'')).toLowerCase();
    return /\bmeet|meeting\b|catch up|coffee|call\b|schedule|availab|calendar|appointment|agenda|are you (around|free)|which (day|time)|next week|book a/.test(s);
  }
  // a few plausible slots for the demo proposal
  var MEETING_OPTS = [['tue15','Tue · 15:00'], ['wed10','Wed · 10:00'], ['thu14','Thu · 14:00']];
  var pendingMeeting = null;   // {msgId, to} awaiting a slot choice
  function meetingBar(){
    if(!pendingMeeting) return '';
    var m = msgById(pendingMeeting.msgId);
    return '<div class="proposal"><div class="ptext">'+SPARK+' Propose a meeting with <b>'+esc(pendingMeeting.to)+'</b> — pick a time for your agenda:</div>'
      + '<div class="pacts" style="flex-wrap:wrap">'
      + MEETING_OPTS.map(function(o){ return '<button class="btn" data-act="meetingpick" data-when="'+o[1]+'">'+o[1]+'</button>'; }).join('')
      + '<button class="btn ghost" data-act="meetingcancel">Cancel</button></div></div>';
  }
  function makeMeeting(msgId, to, when){
    var m = msgById(msgId);
    var subj = m ? m.subject.replace(/^re:\s*/i,'') : 'Meeting';
    var mt = { id:'mt'+Date.now(), title:subj, withWho:to, when:when, msgId:msgId, status:'proposed',
      reply:'Hi '+to+' — how about '+when+'? I’ve pencilled it in; happy to shift if another time suits you better.' };
    (state.meetings = state.meetings || []).push(mt);
    toast('Added to agenda · '+when);
  }

  // ---- agenda: link out to Google Calendar + pull in more calendars to view ----
  var GCAL_URL = 'https://calendar.google.com';
  function gcalCreateUrl(title){ return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title); }
  var CAL_KEY = 'mailai-cals-v1';
  var DEMO_CALENDARS = [
    { id:'personal', name:'Personal',    color:'#0FA398', on:true },
    { id:'work',     name:'Work',        color:'#3E7BF0', on:true },
    { id:'family',   name:'Family',      color:'#8257E6', on:false },
    { id:'holidays', name:'NL Holidays', color:'#EA580C', on:false }
  ];
  // events that live in those calendars (what you'd also see in Google Calendar)
  var DEMO_EVENTS = [
    { cal:'work',     title:'Sprint planning',     when:'Today · 11:00' },
    { cal:'personal', title:'Dentist',             when:'Tomorrow · 09:30' },
    { cal:'work',     title:'1:1 with Sarah',      when:'Tue · 14:00' },
    { cal:'family',   title:'Dinner with parents', when:'Fri · 19:00' },
    { cal:'holidays', title:'Bank holiday',        when:'Mon · all day' }
  ];
  function loadCalPrefs(){ try { return JSON.parse(localStorage.getItem(CAL_KEY)); } catch(e){ return null; } }
  function saveCalPrefs(){ try { localStorage.setItem(CAL_KEY, JSON.stringify((state.calendars||[]).map(function(c){ return { id:c.id, on:c.on }; }))); } catch(e){} }
  function calById(id){ return (state.calendars||[]).filter(function(c){ return c.id===id; })[0]; }

  // timed snooze chooser
  var pendingSnooze = null;   // msgId awaiting a "snooze until" choice
  var SNOOZE_OPTS = [['later','Later today'], ['tomorrow','Tomorrow'], ['weekend','This weekend'], ['nextweek','Next week']];
  var SNOOZE_ORDER = { later:1, tomorrow:2, weekend:3, nextweek:4 };
  function snoozeBar(){
    if(!pendingSnooze) return '';
    var m = msgById(pendingSnooze);
    return '<div class="proposal"><div class="ptext">'+SPARK+' Snooze “'+esc(m?m.subject:'')+'” until…</div>'
      + '<div class="pacts" style="flex-wrap:wrap">'
      + SNOOZE_OPTS.map(function(o){ return '<button class="btn" data-act="snoozepick" data-when="'+o[0]+'" data-label="'+esc(o[1])+'">'+o[1]+'</button>'; }).join('')
      + '<button class="btn ghost" data-act="snoozecancel">Cancel</button></div></div>';
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
    var active = state.messages.filter(function(m){ return isActive(m) && inSel(m); });
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
      top: '<div class="brand">'+BRANDMARK+' MailAI · Cockpit</div>'
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
  // group related mail (same parcel/order/trip) — show the latest, collapse the rest
  var expandedGroups = {};
  function groupedCardList(msgs){
    var seen = {}, out = [];
    msgs.forEach(function(m){
      if(!m.group){ out.push(cardHTML(m)); return; }
      if(seen[m.group]) return;
      seen[m.group] = true;
      var members = msgs.filter(function(x){ return x.group===m.group; });
      var rep = members.filter(function(x){ return x.groupLatest; })[0] || members[0];
      var others = members.filter(function(x){ return x !== rep; });
      if(!others.length){ out.push(cardHTML(rep)); return; }
      var open = expandedGroups[m.group];
      out.push('<div class="grp">' + cardHTML(rep)
        + '<div class="grp-actions">'
        +   '<button class="grp-toggle" data-act="expandgroup" data-g="'+m.group+'">'
        +     (open ? '▴ Hide earlier' : '▾ '+others.length+' earlier update'+(others.length===1?'':'s')) + '</button>'
        +   '<button class="grp-arch" data-act="archgroup" data-g="'+m.group+'">Archive all '+members.length+'</button>'
        + '</div>'
        + (open ? '<div class="grp-more">'+others.map(cardHTML).join('')+'</div>' : '')
        + '</div>');
    });
    return out.join('');
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
    else { body = '<div class="list">'+groupedCardList(ms)+'</div>'; }
    return {
      top: '<h1>'+esc(cat.name)+'</h1>',
      withBack: false,
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
      + (ms.length ? '<div class="list">'+groupedCardList(ms)+'</div>' : '<div class="empty">Nothing here right now.</div>');
    return {
      top: '<h1>'+title+'</h1>',
      withBack: false, tabs: acctSwitcher(), body: body, nav: 'cockpit'
    };
  }

  // ---------- screen: label cockpit (a mini-cockpit per customer/project) ----------
  function labelActive(id){ return state.messages.filter(function(m){ return isActive(m) && inSel(m) && (m.labels||[]).indexOf(id)>=0; }); }
  function labelFiled(id){ return state.messages.filter(function(m){ return m.archived && !m.snoozed && inSel(m) && (m.labels||[]).indexOf(id)>=0; }); }
  function bucketOf(m){
    if(m.cat==='urgent' || (m.cat==='waiting' && m.overdue)) return 'attention';
    if(m.cat==='reply') return 'reply';
    if(m.cat==='waiting') return 'waiting';
    return 'info';
  }
  function bucketMatch(m, bucket){ return bucket==='need' ? (bucketOf(m)==='attention' || bucketOf(m)==='reply') : bucketOf(m)===bucket; }
  function labelOpenTasks(id){ return (state.tasks||[]).filter(function(t){ if(t.done) return false; var m=msgById(t.msgId); return m && (m.labels||[]).indexOf(id)>=0; }); }
  var BUCKETS = [
    { key:'attention', name:'Needs attention', sub:'urgent & overdue', color:'var(--c-urgent)', icon:ICONS.urgent },
    { key:'reply',     name:'To reply',        sub:'should reply',     color:'var(--c-reply)',  icon:ICONS.reply },
    { key:'waiting',   name:'Waiting',         sub:'awaiting others',  color:'var(--c-wait)',   icon:ICONS.waiting },
    { key:'info',      name:'Just info',       sub:'no action needed', color:'var(--c-fyi)',    icon:ICONS.fyi }
  ];
  var BUCKET_TITLE = { need:'Need you', attention:'Needs attention', reply:'To reply', waiting:'Waiting', info:'Just info', filed:'Filed' };

  function viewLabel(spec){
    var parts = spec.split('/'), id = parts[0], bucket = parts[1];
    var l = labelById(id); if(!l){ location.hash='#/'; return null; }
    if(bucket) return viewLabelBucket(l, bucket);

    var ms = labelActive(id);
    var filed = labelFiled(id);
    var count = function(k){ return ms.filter(function(m){ return bucketMatch(m,k); }).length; };
    var needYou = count('need');
    var money = ms.reduce(function(s,m){ return s + (m.total||0); }, 0);
    var tasks = labelOpenTasks(id);

    var tiles = BUCKETS.map(function(bk){
      return '<button class="tile" style="--tc:'+bk.color+'" data-nav="#/label/'+id+'/'+bk.key+'">'
        + '<span class="ticon">'+svg(bk.icon,15)+'</span><span class="tcount">'+count(bk.key)+'</span>'
        + '<span class="tname">'+bk.name+'</span><span class="tsub">'+bk.sub+'</span></button>';
    }).join('');
    tiles += '<button class="tile" style="--tc:var(--c-junk)" data-nav="#/label/'+id+'/filed">'
      + '<span class="ticon">'+svg('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',15)+'</span>'
      + '<span class="tcount">'+filed.length+'</span><span class="tname">Filed</span><span class="tsub">archived, kept here</span></button>';

    var attn = ms.filter(function(m){ return bucketOf(m)==='attention' || bucketOf(m)==='reply'; }).slice(0,3);
    var preview = attn.length ? '<div class="seghead" style="padding-left:14px">Top of the pile</div><div class="list" style="padding-top:0">'+attn.map(cardHTML).join('')+'</div>' : '';
    var taskBlock = tasks.length ? '<div class="seghead" style="padding-left:14px">Tasks · '+esc(l.name)+'</div><div class="list" style="padding-top:0">'+tasks.slice(0,4).map(taskRow).join('')+'</div>' : '';

    return {
      top: '<h1><span class="lbl" style="--lc:'+l.color+';font-size:.82em;vertical-align:middle">'+esc(l.name)+'</span></h1>'
         + '<div class="sub">'+ms.length+' mail'+(ms.length===1?'':'s')+(money?(' · €'+money.toFixed(0)):'')+(tasks.length?(' · '+tasks.length+' task'+(tasks.length===1?'':'s')):'')+'</div>',
      withBack: false,
      tabs: acctSwitcher(),
      body: '<div class="hero" style="background:linear-gradient(135deg,'+l.color+',color-mix(in srgb,'+l.color+' 50%,#0b1220))">'
          + '<button class="hstat" data-nav="#/label/'+id+'/need"><div class="big">'+needYou+'</div><div class="hl">need you ›</div></button>'
          + '<button class="hstat soft" data-nav="#/label/'+id+'/info"><div class="big">'+count('info')+'</div><div class="hl">just info ›</div></button>'
          + '</div>'
          + '<div class="herohint">Your <b>'+esc(l.name)+'</b> workspace — everything tagged this label, split by what needs you.</div>'
          + '<div class="tilegrid">'+tiles+'</div>'
          + preview + taskBlock,
      nav: 'cockpit'
    };
  }
  function viewLabelBucket(l, bucket){
    var ms = bucket==='filed' ? labelFiled(l.id) : labelActive(l.id).filter(function(m){ return bucketMatch(m, bucket); });
    var body = ms.length ? '<div class="list">'+groupedCardList(ms)+'</div>' : '<div class="empty">Nothing here in “'+esc(l.name)+'”.</div>';
    return {
      top: '<button class="back" data-nav="#/label/'+l.id+'">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' '+esc(l.name)+'</button>'
         + '<h1>'+(BUCKET_TITLE[bucket]||bucket)+'</h1>',
      withBack: true, tabs: acctSwitcher(), body: body, nav: 'cockpit'
    };
  }

  // ---------- screen: detail ----------
  function viewDetail(id){
    var m = msgById(id); if(!m){ location.hash='#/'; return null; }
    var cat = catById(m.cat);
    var parts = [];
    if(m.ticket){
      var t=m.ticket, grid=t.grid.map(function(kv){return '<div><div class="k">'+esc(kv[0])+'</div><div class="v">'+esc(kv[1])+'</div></div>';}).join('');
      parts.push('<div class="ticket '+t.style+'"><div class="tt">'+esc(t.tt)+'</div><div class="ev">'+esc(t.ev)+'</div><div class="grid">'+grid+'</div>'+(t.code?'<div class="code"></div>':'')+'</div>');
      parts.push('<button class="wallet-btn" data-act="wallet" data-id="'+m.id+'">'+svg('<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4z"/><path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',14)+' Add to Apple Wallet</button>');
    }
    // short AI summary (always) + the actual email text below it
    parts.push('<div class="panel ai"><p class="h">'+SPARK+' AI summary</p><p>'+esc(m.summary || m.snippet)+'</p></div>');
    var bodyText = m.body || m.snippet || '';
    parts.push('<details class="panel mailpanel" open><summary class="h">Full email</summary>'
      + '<div class="mailbody">'+esc(bodyText).replace(/\n/g,'<br>')+'</div></details>');
    // labels — AI-assigned, tap to fix (the app learns from the change)
    var lblEditor = (state.labels||[]).map(function(l){
      var on = (m.labels||[]).indexOf(l.id) >= 0;
      return '<button class="lbl '+(on?'on':'off')+'" style="--lc:'+l.color+'" data-act="fixlabel" data-id="'+m.id+'" data-label="'+l.id+'">'+(on?'':'+ ')+esc(l.name)+'</button>';
    }).join('');
    parts.push('<div class="panel"><p class="h">'+SPARK+' Labels · tap to fix</p><div class="lbledit">'+lblEditor
      + '<button class="lbl new" data-act="newlabel" data-id="'+m.id+'">+ New</button></div>'
      + '<div class="ai-note" style="margin-top:8px">I assign these automatically and learn from your corrections.</div></div>');
    // category — AI-assigned, tap the right one to fix (learns like labels)
    var catEditor = visibleCats().map(function(c){
      var on = m.cat===c.id;
      return '<button class="lbl cat '+(on?'on':'off')+'" style="--lc:'+c.color+'" data-act="fixcat" data-id="'+m.id+'" data-cat="'+c.id+'">'+(on?'✓ ':'')+esc(c.name)+'</button>';
    }).join('');
    parts.push('<div class="panel"><p class="h">'+SPARK+' Category · tap to fix</p><div class="lbledit">'+catEditor+'</div>'
      + '<div class="ai-note" style="margin-top:8px">Wrong bucket? Tap the right one — I learn from it.</div></div>');
    // if Gmail sync is on, show exactly which Gmail labels this mail gets
    if(state.mirrorGmail){
      parts.push('<div class="panel"><p class="h">'+svg('<path d="M3 6l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/>',13)+' In Gmail</p><div class="lbledit">'
        + gmailLabelNames(m).map(function(n,i){ return '<span class="lbl gmail'+(i===0?' main':'')+'">'+esc(n)+'</span>'; }).join('')
        + '</div><div class="ai-note" style="margin-top:8px">These appear on this mail in the Gmail app too. The <b>first</b> is the main label (your category); the rest are your labels.</div></div>');
    }
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
    // scheduling: propose a meeting/appointment for the agenda (parallel to tasks)
    if(looksScheduley(m)){
      parts.push('<div class="ai-note" style="padding:2px 4px">'+SPARK+'Looks like scheduling — want an appointment on your agenda?</div>');
    }
    parts.push('<button class="btn wide" data-act="proposemeeting" data-id="'+m.id+'" style="border-style:dashed;color:var(--accent-ink)">+ Propose meeting for agenda</button>');
    if(m.reply){
      parts.push('<div class="panel"><p class="h">Suggested reply · professional</p><div class="reply-body">'+esc(m.reply)+'</div>'
        + '<div class="btnrow"><button class="btn pri" data-act="send" data-id="'+m.id+'">Send</button>'
        + '<button class="btn" data-act="edit">Edit</button><button class="btn ghost" data-act="discard">Discard</button></div></div>');
    }
    if(m.cat==='newsletter'){
      parts.push('<div class="btnrow"><button class="btn danger wide" data-act="unsub" data-id="'+m.id+'">Unsubscribe</button></div>');
    }
    if(m.archived){
      parts.push('<div class="ai-note" style="padding:2px 4px">'+SPARK+'Filed — hidden from the cockpit, still kept under its labels.</div>');
      parts.push('<div class="btnrow"><button class="btn" data-act="restore" data-id="'+m.id+'">Restore to inbox</button>'
        + '<button class="btn danger" data-act="delete" data-id="'+m.id+'">Delete</button></div>');
    } else {
      parts.push('<div class="btnrow"><button class="btn" data-act="archive" data-id="'+m.id+'">Archive (file it)</button>'
        + '<button class="btn danger" data-act="delete" data-id="'+m.id+'">Delete</button></div>');
    }
    return {
      top: '<button class="back" data-nav="#/c/'+m.cat+'">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' '+esc(cat.name)+'</button>'
         + '<h1>'+esc(m.subject)+'</h1><div class="sub"><b>'+esc(m.from)+'</b> · '+esc(m.time)+' '+acctTag(m)+'</div>',
      withBack: true,
      body: '<div class="detail">'+parts.join('')+'</div>',
      nav: 'cockpit'
    };
  }

  // ---------- screen: archive cockpit ----------
  function archivedMsgs(){ return state.messages.filter(function(m){ return m.archived && !m.snoozed && inSel(m); }); }
  function snoozedMsgs(){ return state.messages.filter(function(m){ return m.snoozed && inSel(m); }); }
  function archiveRow(m){ return '<div class="arow">'+cardHTML(m)+'<div class="btnrow"><button class="btn" data-act="restore" data-id="'+m.id+'">Move to cockpit</button><button class="btn danger" data-act="delete" data-id="'+m.id+'">Delete</button></div></div>'; }
  function viewArchive(spec){
    if(spec) return viewArchiveCat(spec);
    var arc = archivedMsgs(), sn = snoozedMsgs();
    var cats = {}; arc.forEach(function(m){ cats[m.cat] = (cats[m.cat]||0)+1; });
    var tiles = Object.keys(cats).map(function(cid){
      var c = catById(cid) || { name:cid, color:'var(--c-junk)', id:cid };
      return '<button class="tile" style="--tc:'+c.color+'" data-nav="#/archive/'+cid+'"><span class="ticon">'+svg(iconFor(c),15)+'</span>'
        + '<span class="tcount">'+cats[cid]+'</span><span class="tname">'+esc(c.name)+'</span><span class="tsub">tap to review</span></button>';
    }).join('');
    var snoozeSec = sn.length ? '<div class="seghead" style="padding-left:14px">Snoozed · '+sn.length+'</div><div class="list" style="padding-top:0">'
      + '<button class="btn wide" data-act="advancetime" style="border-style:dashed;color:var(--accent-ink)">⏭ Advance demo clock (wake due snoozes)</button>'
      + sn.map(function(m){ return '<div class="arow">'+cardHTML(m)+'<button class="btn arow-del" data-act="unsnooze" data-id="'+m.id+'">Wake now'+(m.snoozeUntil?(' · '+esc(m.snoozeUntil)):'')+'</button></div>'; }).join('') + '</div>' : '';
    var body = '<div class="focusdesc">Mail you <b>file</b> leaves the cockpit but stays here (and under its labels). Delete one, a whole category, or empty it all.</div>'
      + (tiles ? '<div class="tilegrid">'+tiles+'</div>' : '<div class="empty">Archive is empty.</div>')
      + (arc.length ? '<div style="padding:12px 14px"><button class="btn danger wide" data-act="emptyarchive">Empty archive ('+arc.length+')</button></div>' : '')
      + snoozeSec;
    return { top:'<div class="brand">'+BRANDMARK+' MailAI · Archive</div><h1>Archive</h1><div class="sub">'+arc.length+' filed'+(sn.length?(' · '+sn.length+' snoozed'):'')+'</div>', body:body, nav:'archive' };
  }
  function viewArchiveCat(cid){
    var c = catById(cid); var ms = archivedMsgs().filter(function(m){ return m.cat===cid; });
    var body = '<div class="list">'+(ms.length ? ms.map(archiveRow).join('') : '<div class="empty">Empty.</div>')
      + (ms.length ? '<button class="btn danger wide" data-act="delcat" data-cat="'+cid+'" style="margin-top:4px">Delete all '+ms.length+' in '+(c?esc(c.name):cid)+'</button>' : '')+'</div>';
    return { top:'<button class="back" data-nav="#/archive">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' Archive</button><h1>'+(c?esc(c.name):cid)+' · filed</h1>', withBack:true, body:body, nav:'archive' };
  }

  // ---------- screen: settings ----------
  var ACCT_COLORS = ['#3E7BF0','#0FA398','#8257E6','#EA580C','#D6336C','#0891B2','#059669','#B45309'];
  function acctRows(){
    return state.accounts.map(function(a){
      var n = state.messages.filter(function(m){ return m.account===a.id && !m.archived; }).length;
      return '<div class="acctrow2">'
        + '<button class="cdot cdot-btn" style="background:'+a.color+'" data-act="acctcolor" data-id="'+a.id+'" aria-label="change colour"></button>'
        + '<span class="acctinfo"><span class="cnm">'+esc(a.name)+'</span><br><span class="ccount">'+esc(a.email)+' · '+n+' mails</span></span>'
        + '<button class="rule-x" data-act="acctrename" data-id="'+a.id+'" aria-label="rename">✎</button>'
        + '<button class="rule-x" data-act="acctremove" data-id="'+a.id+'" aria-label="remove">✕</button>'
        + '</div>';
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
      top: '<h1>Categories &amp; rules</h1>',
      withBack: false,
      body: '<div class="view pad" style="padding-top:2px">'
        + '<div class="seghead">Cockpit</div>'
        + '<div class="rule" style="color:var(--ink-2)">New mail lands in the cockpit. <b>File everything</b> to start clean — archived mail stays under its labels and in the Archive tab, and you can move any of it back to the cockpit anytime.</div>'
        + '<button class="btn wide danger" data-act="emptycockpit" style="border-style:dashed">File everything to Archive (empty cockpit)</button>'
        + '<div class="seghead">Show in Gmail</div>'
        + '<div class="catrow"><span class="grip"></span><span class="cdot" style="background:#EA4335">'+svg('<path d="M3 6l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/>',13)+'</span>'
        +   '<span><span class="cnm">Mirror categories &amp; labels to Gmail</span><br>'
        +   '<span class="ccount">Adds them as Gmail labels under <b>MailAI/</b> — visible in the Gmail app &amp; search</span></span>'
        +   '<button class="toggle'+(state.mirrorGmail?'':' off')+'" data-act="togglemirror" aria-label="toggle Gmail sync"></button></div>'
        + '<div class="rule" style="color:var(--ink-2)">'+SPARK+'Your <b>category</b> becomes the main label (e.g. <b>MailAI/Urgent</b>) — one per mail; each <b>label</b> is added too (e.g. <b>MailAI/Acme Corp</b>). Everything groups under one <b>MailAI/</b> parent you can collapse or remove in Gmail in a single step. Off by default — nothing is written to Gmail until you turn this on (and, live, connect an account).</div>'
        + '<div class="seghead">Language</div>'
        + '<div class="langrow">'
        +   '<button class="langseg'+(state.lang!=='nl'?' on':'')+'" data-act="setlang" data-v="en">🇬🇧 English</button>'
        +   '<button class="langseg'+(state.lang==='nl'?' on':'')+'" data-act="setlang" data-v="nl">🇳🇱 Nederlands</button>'
        + '</div>'
        + '<div class="rule" style="color:var(--ink-2)">'+SPARK+'Switch the whole app between English and Dutch. Your emails stay in their own language — only MailAI’s labels &amp; text change.</div>'
        + '<div class="seghead">Mail accounts · kept separate</div>' + acctRows()
        + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="addacct">+ Add a mail account</button>'
        + '<div class="seghead">Cockpit categories · toggle to show/hide</div>'+rows
        + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="addcat">+ Add a category</button>'
        + '<div class="seghead">Labels · AI-assigned, you correct</div>'
        + (state.labels||[]).map(function(l){ return '<div class="catrow"><span class="grip">#</span><span class="cdot" style="background:'+l.color+'"></span><span><span class="cnm">'+esc(l.name)+'</span><br><span class="ccount">'+labelCount(l.id)+' mails</span></span></div>'; }).join('')
        + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="newlabeldef">+ Add a label</button>'
        + '<div class="seghead">Label rules · learned + yours</div>'
        + ((state.labelRules&&state.labelRules.length) ? state.labelRules.map(function(r,i){ var l=labelById(r.labelId); return '<div class="rule rule-row"><span>'+rulePrefix(r)+'<b>'+esc(ruleWho(r))+'</b> '+(r.action==='add'?'→ tag':'✗ don’t tag')+' <b style="color:'+(l?l.color:'#888')+'">'+(l?esc(l.name):esc(r.labelId))+'</b></span><button class="rule-x" data-act="delrule" data-i="'+i+'" aria-label="remove rule">✕</button></div>'; }).join('') : '<div class="rule" style="color:var(--ink-3)">No rules yet — fix a label on any email, or add one below.</div>')
        + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="addrulelabel">+ Add a label rule</button>'
        + '<div class="seghead">Category rules · learned from “wrong category” fixes</div>'
        + ((state.catRules&&state.catRules.length) ? state.catRules.map(function(r,i){ var c=catById(r.catId); return '<div class="rule rule-row"><span>'+rulePrefix(r)+'<b>'+esc(ruleWho(r))+'</b> → <b style="color:'+(c?c.color:'#888')+'">'+(c?esc(c.name):esc(r.catId))+'</b></span><button class="rule-x" data-act="delcatrule" data-i="'+i+'" aria-label="remove rule">✕</button></div>'; }).join('') : '<div class="rule" style="color:var(--ink-3)">No category rules yet — use “Category · tap to fix” on any email.</div>')
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
      + '<div class="tkacts"><button data-act="taskedit" data-id="'+t.id+'">Edit</button><button data-act="taskdue" data-id="'+t.id+'">'+(t.due?'Change due':'Set due')+'</button><button class="del" data-act="taskdel" data-id="'+t.id+'">Delete</button></div>'
      + '</div></div>';
  }
  function meetingRow(mt){
    var m = msgById(mt.msgId);
    return '<div class="tkrow">'
      + '<span class="mtcal">'+svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',15)+'</span>'
      + '<div class="tkbody"><div class="tktext">'+esc(mt.title)+'</div>'
      + '<div class="due">'+esc(mt.when)+' · with '+esc(mt.withWho)+(mt.status==='sent'?' · <b>proposal sent</b>':'')+'</div>'
      + (m?'<button class="tklink" data-nav="#/m/'+m.id+'">'+svg('<path d="M14 4h6v6M20 4l-9 9M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/>',11)+' '+esc(m.from)+' — '+esc(m.subject)+'</button>':'')
      + '<div class="tkacts"><a class="tkgcal" href="'+gcalCreateUrl(mt.title)+'" target="_blank" rel="noopener">Add to Google Calendar</a>'
      + '<button data-act="meetingsend" data-id="'+mt.id+'">'+(mt.status==='sent'?'Resend':'Send proposal')+'</button>'
      + '<button class="del" data-act="meetingdel" data-id="'+mt.id+'">Remove</button></div>'
      + '</div></div>';
  }
  function eventRow(ev){
    var c = calById(ev.cal);
    return '<div class="evrow"><span class="evdot" style="background:'+(c?c.color:'#888')+'"></span>'
      + '<div class="evbody"><div class="evtitle">'+esc(ev.title)+'</div>'
      + '<div class="evwhen">'+esc(ev.when)+' · '+esc(c?c.name:'')+'</div></div></div>';
  }
  function agendaBlock(){
    var cals = state.calendars || [];
    var on = {}; cals.forEach(function(c){ if(c.on) on[c.id] = true; });
    var evs = (state.events||[]).filter(function(e){ return on[e.cal]; });
    var meetings = state.meetings || [];
    var head = '<div class="seghead agendahead">Agenda'
      + '<a class="gcal" href="'+GCAL_URL+'" target="_blank" rel="noopener">Open Google Calendar '+svg('<path d="M7 17L17 7M8 7h9v9"/>',12)+'</a></div>';
    var chips = '<div class="calchips">'
      + cals.map(function(c){ return '<button class="calchip'+(c.on?' on':'')+'" data-act="togglecal" data-id="'+c.id+'"><span class="cdotmini" style="background:'+c.color+'"></span>'+esc(c.name)+'</button>'; }).join('')
      + '<button class="calchip add" data-act="addcal">+ Add calendar</button></div>';
    var events = evs.length ? evs.map(eventRow).join('') : '<div class="empty" style="padding:10px 0">No events in the calendars you’re viewing.</div>';
    var mtg = meetings.length ? '<div class="agendasub">Proposed by MailAI</div>' + meetings.map(meetingRow).join('') : '';
    return head + chips + events + mtg;
  }
  function viewTasks(){
    var open = (state.tasks||[]).filter(function(t){ return !t.done; });
    var done = (state.tasks||[]).filter(function(t){ return t.done; });
    var meetings = state.meetings || [];
    var body = '<div class="list">'
      + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="tasknew">+ New task</button>'
      + (open.length ? open.map(taskRow).join('') : '<div class="empty">No open tasks. Add one from any email or above.</div>')
      + agendaBlock()
      + (done.length ? '<div class="seghead">Done</div>'+done.map(taskRow).join('') : '')
      + '</div>';
    return { top:'<div class="brand">'+BRANDMARK+' MailAI · Tasks</div><h1>Tasks</h1><div class="sub">'+open.length+' open'+(meetings.length?' · '+meetings.length+' meeting'+(meetings.length===1?'':'s'):'')+'</div>', body:body, nav:'tasks' };
  }

  // ---------- render ----------
  function tabbar(active){
    function b(id,nav,icon,label){ return '<button data-nav="'+nav+'" class="'+(active===id?'on':'')+'">'+svg(icon,20)+label+'</button>'; }
    return '<nav class="tabbar">'
      + b('cockpit','#/','<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>','Cockpit')
      + b('tasks','#/tasks','<path d="M9 11l3 3L22 4"/><path d="M21 12v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"/>','Tasks')
      + b('archive','#/archive','<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>','Archive')
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
    else if(h.indexOf('#/archive')===0) v = viewArchive(h==='#/archive' ? '' : h.slice(10));
    else if(h==='#/tasks') v = viewTasks();
    else v = viewCockpit();
    if(!v) return; // a redirect happened
    var html = '<div class="topbar'+(v.withBack?' with-back':'')+'">'+v.top+'</div>'
      + (v.tabs||'')
      + (v.bare ? v.body : '<div class="view">'+v.body+'</div>')
      + proposalBar() + catProposalBar() + unsubBar() + snoozeBar() + followupBar() + meetingBar()
      + tabbar(v.nav);
    root.innerHTML = html;
    localize(root);   // switch UI chrome to Dutch when selected
    // scroll view to top on nav
    var view = root.querySelector('.view'); if(view) view.scrollTop = 0;
  }

  // ---------- toast ----------
  var toastEl;
  function toast(msg){
    if(!toastEl){ toastEl = document.createElement('div'); toastEl.className='toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = t(msg); toastEl.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function(){ toastEl.classList.remove('show'); }, 1800);
  }

  // ---------- actions ----------
  function archive(id, word){ var m=msgById(id); if(m){ m.archived=true; m.snoozed=false; apiPost('/api/messages/'+id+'/archive'); toast((word||'Archived')+' · '+m.from); } }
  function snoozeMsg(id, label, key){ var m=msgById(id); if(m){ m.snoozed=true; m.snoozeUntil=label||''; m.snoozeBucket=SNOOZE_ORDER[key]||9; toast('Snoozed'+(label?' · '+label:'')+' · '+m.from); } }
  function removeMsg(id){ var m=msgById(id); for(var i=0;i<state.messages.length;i++){ if(state.messages[i].id===id){ state.messages.splice(i,1); break; } } if(m) toast('Deleted · '+m.from); }
  function restoreMsg(id){ var m=msgById(id); if(m){ m.archived=false; m.snoozed=false; toast('Moved to cockpit · '+m.from); } }
  function archiveGroup(gid){ var n=0; state.messages.forEach(function(m){ if(m.group===gid && isActive(m) && inSel(m)){ m.archived=true; n++; } }); toast('Filed '+n+' update'+(n===1?'':'s')); }
  function emptyCockpit(){ var n=0; state.messages.forEach(function(m){ if(isActive(m) && inSel(m)){ m.archived=true; n++; } }); toast('Filed '+n+' mail to Archive · cockpit clear'); }
  function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24) || ('cat'+Date.now()); }

  function handleAct(act, el){
    var id = el.getAttribute('data-id');
    switch(act){
      case 'archive': archive(id); back(); break;
      case 'delete': removeMsg(id); back(); break;
      case 'restore': restoreMsg(id); back(); break;
      case 'snooze': pendingSnooze = id; render(); break;
      case 'snoozepick': { var sid=pendingSnooze; pendingSnooze=null; if(sid){ snoozeMsg(sid, el.getAttribute('data-label'), el.getAttribute('data-when')); } if(location.hash==='#/m/'+sid){ back(); } else render(); break; }
      case 'snoozecancel': { pendingSnooze=null; render(); break; }
      case 'done': archive(id,'Marked done'); render(); break;
      case 'unsub': pendingUnsub = id; render(); break;
      case 'send': {
        var sm2 = msgById(id); archive(id,'Reply sent');
        if(sm2 && looksLikeRequest(sm2.reply)){ pendingFollowup = { to:sm2.from, subject:sm2.subject, account:sm2.account }; render(); }
        else back();
        break;
      }
      case 'followuppick': { if(pendingFollowup){ var f=pendingFollowup; pendingFollowup=null; makeFollowup(f.to, f.subject, f.account, el.getAttribute('data-label')); location.hash='#/c/waiting'; } else render(); break; }
      case 'followupcancel': { pendingFollowup=null; toast('No reminder set'); back(); break; }
      case 'proposemeeting': { var mm=msgById(id); if(mm){ pendingMeeting={ msgId:id, to:mm.from }; render(); } break; }
      case 'meetingpick': { if(pendingMeeting){ var pm=pendingMeeting; pendingMeeting=null; makeMeeting(pm.msgId, pm.to, el.getAttribute('data-when')); location.hash='#/tasks'; } else render(); break; }
      case 'meetingcancel': { pendingMeeting=null; render(); break; }
      case 'meetingsend': { var mts=(state.meetings||[]).filter(function(x){return x.id===id;})[0]; if(mts){ mts.status='sent'; toast('Proposal sent'); } render(); break; }
      case 'meetingdel': { state.meetings=(state.meetings||[]).filter(function(x){return x.id!==id;}); render(); break; }
      case 'togglecal': { var cc=calById(id); if(cc){ cc.on=!cc.on; saveCalPrefs(); toast(cc.on?('Showing '+cc.name):('Hidden '+cc.name)); } render(); break; }
      case 'addcal': { var nm=window.prompt('Add a calendar to view (name):',''); if(nm&&nm.trim()){ var pal=['#D6336C','#0891B2','#059669','#B45309','#7C3AED']; state.calendars.push({ id:'cal'+Date.now(), name:nm.trim(), color:pal[state.calendars.length%pal.length], on:true }); saveCalPrefs(); toast('Calendar added'); } render(); break; }
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
      case 'togglemirror': { state.mirrorGmail=!state.mirrorGmail; saveMirror(); apiPost('/api/settings/mirror',{enabled:state.mirrorGmail}); toast(state.mirrorGmail?'Gmail sync on · these show as labels in Gmail':'Gmail sync off'); render(); break; }
      case 'setlang': { var lv=el.getAttribute('data-v')==='nl'?'nl':'en'; state.lang=lv; saveLang(); apiPost('/api/settings/lang',{lang:lv}); render(); break; }
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
      case 'scope': { if(pendingProposal){ var sv=el.getAttribute('data-v'); if(sv==='subject'){ var kw=window.prompt('Apply to mail whose subject contains:', pendingProposal.subjectWord||guessKeyword(pendingProposal.subject)); if(kw&&kw.trim()){ pendingProposal.scope='subject'; pendingProposal.subjectWord=kw.trim(); } } else pendingProposal.scope=sv; } render(); break; }
      case 'applyrule': {
        if(pendingProposal){ var p=pendingProposal;
          var val = p.scope==='domain'?p.domain : p.scope==='subject'?p.subjectWord : p.sender;
          var rule = { scope:p.scope, value:val, labelId:p.labelId, action:p.action };
          learnRule(rule); recomputeLabels();
          var n = state.messages.filter(function(m){ return ruleMatches(rule, m); }).length;
          apiPost('/api/messages/'+p.msgId+'/labels', { label_id: p.labelId }); // learns server-side when live
          toast('Rule saved · applied to '+n+' mail'+(n===1?'':'s')+(p.scope==='domain'?(' @'+p.domain):(' from '+p.sender)));
          pendingProposal = null;
        }
        render(); break;
      }
      case 'dismissrule': { pendingProposal = null; toast('Kept it to just this email'); render(); break; }
      case 'delrule': { var ri=parseInt(el.getAttribute('data-i'),10); if(state.labelRules){ state.labelRules.splice(ri,1); saveLearned(); recomputeLabels(); toast('Rule removed'); } render(); break; }
      // category correction
      case 'fixcat': { setCat(id, el.getAttribute('data-cat')); render(); break; }
      case 'catscope': { if(pendingCatProposal){ var cv2=el.getAttribute('data-v'); if(cv2==='subject'){ var ck=window.prompt('Apply to mail whose subject contains:', pendingCatProposal.subjectWord||guessKeyword(pendingCatProposal.subject)); if(ck&&ck.trim()){ pendingCatProposal.scope='subject'; pendingCatProposal.subjectWord=ck.trim(); } } else pendingCatProposal.scope=cv2; } render(); break; }
      case 'applycatrule': {
        if(pendingCatProposal){ var cp=pendingCatProposal;
          var cval = cp.scope==='domain'?cp.domain : cp.scope==='subject'?cp.subjectWord : cp.sender;
          var crule = { scope:cp.scope, value:cval, catId:cp.catId };
          learnCatRule(crule); recomputeCats();
          var cn = state.messages.filter(function(m){ return catRuleMatches(crule, m); }).length;
          toast('Rule saved · '+cn+' mail'+(cn===1?'':'s')+' → '+cp.catName);
          pendingCatProposal = null;
        }
        render(); break;
      }
      case 'dismisscatrule': { pendingCatProposal = null; toast('Kept it to just this email'); render(); break; }
      case 'delcatrule': { var ci=parseInt(el.getAttribute('data-i'),10); if(state.catRules){ state.catRules.splice(ci,1); saveCatRules(); recomputeCats(); toast('Rule removed'); } render(); break; }
      // newsletter unsubscribe (confirm)
      case 'unsubconfirm': { var us=pendingUnsub; pendingUnsub=null; if(us){ archive(us,'Unsubscribed'); } if(location.hash==='#/m/'+us){ back(); } else render(); break; }
      case 'unsubcancel': { pendingUnsub = null; render(); break; }
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
      case 'expandgroup': { var g=el.getAttribute('data-g'); expandedGroups[g] = !expandedGroups[g]; render(); break; }
      case 'archgroup': { archiveGroup(el.getAttribute('data-g')); render(); break; }
      case 'emptycockpit': { if(window.confirm('File all cockpit mail to the Archive? You can move any of it back anytime.')){ emptyCockpit(); } location.hash = '#/'; break; }
      // account management
      case 'acctcolor': { var ac=acctById(id); if(ac){ var ci2=ACCT_COLORS.indexOf(ac.color); ac.color=ACCT_COLORS[(ci2+1)%ACCT_COLORS.length]; } render(); break; }
      case 'acctrename': { var ar=acctById(id); if(ar){ var an=window.prompt('Rename account:', ar.name); if(an&&an.trim()) ar.name=an.trim(); } render(); break; }
      case 'acctremove': {
        var arm=acctById(id);
        if(arm && window.confirm('Remove “'+arm.name+'”? Its mail will be deleted from the app.')){
          state.messages = state.messages.filter(function(m){ return m.account!==id; });
          state.accounts = state.accounts.filter(function(x){ return x.id!==id; });
          if(sel===id) sel='all';
          toast('Removed '+arm.name);
        }
        render(); break;
      }
      // task editing
      case 'taskedit': { var te=taskById(id); if(te){ var tn=window.prompt('Edit task:', te.text); if(tn&&tn.trim()) te.text=tn.trim(); } render(); break; }
      case 'taskdue': { var td=taskById(id); if(td){ var dd=window.prompt('Due (e.g. Today 17:00, Fri, next week) — blank to clear:', td.due||''); td.due=(dd||'').trim(); } render(); break; }
      case 'taskdel': { state.tasks=(state.tasks||[]).filter(function(x){ return x.id!==id; }); toast('Task deleted'); render(); break; }
      case 'tasknew': { var tx=window.prompt('New task:'); if(tx&&tx.trim()){ state.tasks.push({ id:'t'+Date.now(), text:tx.trim(), due:'', done:false, msgId:null }); } render(); break; }
      // timed-snooze demo clock: advance and wake anything due
      case 'advancetime': {
        state.demoNow = (state.demoNow||0) + 1;
        var woke=0; state.messages.forEach(function(m){ if(m.snoozed && (m.snoozeBucket||9) <= state.demoNow){ m.snoozed=false; m.snoozeBucket=0; m.snoozeUntil=''; woke++; } });
        toast(woke ? ('Time moved on · woke '+woke+' back to the cockpit') : 'Clock advanced · nothing due yet');
        render(); break;
      }
      case 'unsnooze': { var um=msgById(id); if(um){ um.snoozed=false; um.snoozeUntil=''; toast('Woke · '+um.from); } render(); break; }
      case 'emptyarchive': {
        if(window.confirm('Delete all filed mail? This can’t be undone.')){
          state.messages = state.messages.filter(function(m){ return !(m.archived && !m.snoozed); });
          toast('Archive emptied');
        }
        render(); break;
      }
      case 'delcat': {
        var dc = el.getAttribute('data-cat'); var cat2 = catById(dc);
        if(window.confirm('Delete all filed '+(cat2?cat2.name:dc)+' mail?')){
          state.messages = state.messages.filter(function(m){ return !(m.archived && !m.snoozed && m.cat===dc); });
          toast('Deleted');
        }
        location.hash = '#/archive'; break;
      }
      case 'addrulelabel': {
        var who = window.prompt('Auto-label mail from — a sender name, or @domain (e.g. @acme.com):');
        if(who && who.trim()){
          who = who.trim();
          var isDomain = who.charAt(0)==='@';
          var scope = isDomain ? 'domain' : 'sender';
          var value = isDomain ? who.slice(1) : who;
          var lname = window.prompt('…with label:');
          if(lname && lname.trim()){
            var lab = (state.labels||[]).filter(function(x){ return x.name.toLowerCase()===lname.trim().toLowerCase(); })[0];
            if(!lab){ lab = { id:slug(lname)+'-'+(Date.now()%1000), name:lname.trim(), color:CUSTOM_COLORS[state.labels.length % CUSTOM_COLORS.length] }; state.labels.push(lab); }
            var rule = { scope:scope, value:value, labelId:lab.id, action:'add' };
            learnRule(rule); recomputeLabels();
            var n = state.messages.filter(function(m){ return ruleMatches(rule, m); }).length;
            toast('Rule added · '+n+' mail'+(n===1?'':'s')+' tagged');
          }
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
  var swipeGuard = null;   // {card, t} — swallow only the ghost click on the swiped card
  function cardIdOf(node){ var c = node.closest && node.closest('.card'); if(!c) return null; var nv=c.getAttribute('data-nav')||''; return nv.indexOf('#/m/')===0 ? nv.slice(4) : null; }
  document.addEventListener('click', function(e){
    if(swipeGuard && (Date.now()-swipeGuard.t)<700 && e.target.closest && e.target.closest('.card')===swipeGuard.card){ swipeGuard=null; e.preventDefault(); return; }
    var navEl = e.target.closest('[data-nav]');
    var actEl = e.target.closest('[data-act]');
    if(actEl){ e.preventDefault(); handleAct(actEl.getAttribute('data-act'), actEl); return; }
    if(navEl){ e.preventDefault(); var to = navEl.getAttribute('data-nav'); if(location.hash===to) render(); else location.hash = to; }
  });
  window.addEventListener('hashchange', render);

  // swipe an email card: left = archive, right = snooze
  var sw = null;
  document.addEventListener('touchstart', function(e){
    var c = e.target.closest('.card'); var id = c && cardIdOf(c);
    sw = id ? { c:c, id:id, x:e.touches[0].clientX, y:e.touches[0].clientY, dx:0, moved:false } : null;
  }, { passive:true });
  document.addEventListener('touchmove', function(e){
    if(!sw) return;
    var dx = e.touches[0].clientX - sw.x, dy = e.touches[0].clientY - sw.y;
    if(!sw.moved && Math.abs(dx) < Math.abs(dy)){ sw = null; return; }   // vertical scroll — bail
    sw.moved = true; sw.dx = dx;
    sw.c.style.transition = 'none';
    sw.c.style.transform = 'translateX(' + dx + 'px)';
    sw.c.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 240));
  }, { passive:true });
  document.addEventListener('touchend', function(){
    if(!sw) return; var s = sw; sw = null;
    if(!s.moved) return;
    swipeGuard = { card: s.c, t: Date.now() };
    if(s.dx < -70){ var sm=msgById(s.id); if(sm && sm.group){ archiveGroup(sm.group); } else { archive(s.id, 'Archived'); } render(); }
    else if(s.dx > 70){ pendingSnooze = s.id; render(); }   // open the snooze chooser
    else { s.c.style.transition = 'transform .2s, opacity .2s'; s.c.style.transform = ''; s.c.style.opacity = ''; }
  });

  // ---------- data bootstrap (API with fixtures fallback) ----------
  function apiPost(path, body){
    if(!API_OK) return;
    fetch(path, { method:'POST', credentials:'same-origin',
      headers:{ 'Content-Type':'application/json' }, body: body ? JSON.stringify(body) : null }).catch(function(){});
  }
  function boot(data){
    state = JSON.parse(JSON.stringify({ accounts:data.accounts, categories:data.categories, labels:data.labels||[], messages:data.messages }));
    state.messages.forEach(function(m){ if(!m.labels) m.labels = []; });
    // remember the AI's original assignments so rules can be applied AND undone
    state.originalLabels = {}; state.originalCat = {};
    state.messages.forEach(function(m){ state.originalLabels[m.id] = (m.labels||[]).slice(); state.originalCat[m.id] = m.cat; });
    // a couple of example tasks so the screen isn't empty; each linked to its mail.
    state.tasks = [
      { id:'seed1', text:'Send the revised Q3 revenue slide', due:'Today · 12:00', done:false, msgId:'m1' },
      { id:'seed2', text:'Approve the vendor invoice before month-end', due:'', done:false, msgId:'m20' }
    ];
    // learned rules survive reloads (localStorage) and re-apply on load
    state.labelRules = loadLearned();
    state.catRules = loadCatRules();
    state.mirrorGmail = (data.settings && data.settings.mirror_gmail) || loadMirror();
    state.lang = (data.settings && data.settings.lang) || loadLang();
    state.meetings = [];
    var calPrefs = loadCalPrefs();
    state.calendars = DEMO_CALENDARS.map(function(c){
      var p = calPrefs && calPrefs.filter(function(x){ return x.id===c.id; })[0];
      return { id:c.id, name:c.name, color:c.color, on: p ? !!p.on : c.on };
    });
    state.events = DEMO_EVENTS.slice();
    state.demoNow = 0;
    recomputeAll();
    render();
  }
  function showSignIn(){
    var root = document.getElementById('root');
    root.innerHTML = '<div class="signin">'
      + '<div class="brand">'+BRANDMARK+' MailAI</div>'
      + '<h1>Your inbox, on autopilot</h1>'
      + '<p class="lede">Sign in with the Google account you want MailAI to manage. That account becomes your login.</p>'
      + '<a class="btn pri gsign" href="/api/login">'+svg('<path d="M3 6l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/>',16)+' Sign in with Google</a>'
      + '<p class="fine">MailAI only reads the mailboxes you connect, and never sends or deletes without you tapping. You can revoke access anytime in your Google account settings.</p>'
      + '</div>';
  }
  function load(){
    var http = location.protocol === 'http:' || location.protocol === 'https:';
    if(!http || !window.fetch){ boot(window.MAILAI_FIXTURES); return; }
    fetch('/api/inbox', { credentials:'same-origin' })
      .then(function(r){
        if(r.status===401){ showSignIn(); return null; }   // live + not signed in
        if(!r.ok) throw 0;
        return r.json();
      })
      .then(function(d){ if(d){ API_OK = true; boot(d); } })
      .catch(function(){ boot(window.MAILAI_FIXTURES); });   // offline / static prototype
  }
  load();
})();
