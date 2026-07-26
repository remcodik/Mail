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
  function todayStr(){ try { return new Date().toLocaleDateString(state.lang==='nl'?'nl-NL':'en-GB', { weekday:'short', day:'numeric', month:'short', timeZone:'Europe/Amsterdam' }); } catch(e){ return ''; } }
  // App version — bump BUILD + add a CHANGELOG entry on each release. The same
  // stamp is on the app.js/style.css URLs in index.html so a new build busts the cache.
  var BUILD = '2026.07.26-18';
  var CHANGELOG = [
    { v:'2026.07.26-18', notes:['Opening a mail now marks it read automatically, so it clears from New once you\u2019ve looked at it (you can still tap \u201cMark as unread\u201d to keep it)'] },
    { v:'2026.07.26-17', notes:['New \u201cNew\u201d tile at the top of the cockpit \u2014 all your unread mail in one place, newest first, so you can see what just arrived; each mail still stays in its own category', 'FIXED: the category/label strip now keeps its position when you scroll back the other way too'] },
    { v:'2026.07.26-16', notes:['FIXED: the category/label strip no longer jumps back to the first item every time \u2014 it keeps its sideways scroll position so you can tap straight through to the next one'] },
    { v:'2026.07.26-15', notes:['FIXED: tapping the Tickets tile did nothing when a ticket mail had no parsed ticket data \u2014 it now opens the list (those mails show as normal cards)', 'FIXED: the category chip on a list/archive card now always matches the category shown in the email detail (it could go stale after a correction)'] },
    { v:'2026.07.26-14', notes:['Amounts are colour-coded: green \u201cto receive\u201d vs red \u201cto pay\u201d, with a + / \u2013 sign and a small tag', 'In the email detail the \u201cShow original with images\u201d button moved to the top and the full email starts collapsed \u2014 no scrolling to the end', 'The \u201cIn Gmail\u201d info is now a collapsed section (it\u2019s just a mirror of your category/labels)'] },
    { v:'2026.07.26-13', notes:['Mail list cards now have an Archive button (not only in the detail)', 'Cleaner email detail: the suggested reply sits right under the summary, a sticky bar keeps Reply \u00b7 Archive \u00b7 Delete always in reach, and the extra actions fold into \u201cMore actions\u201d', 'Money categories show an Amount panel with a \u201cRe-read (incl. images)\u201d button so you can see what was found'] },
    { v:'2026.07.26-12', notes:['Settings sections now start collapsed \u2014 tap a heading to open it', 'Every category can be deleted now (built-ins too), and a deleted built-in stays gone', 'Amount reading now also fetches remote banner images (e.g. energy \u201cTotaal te ontvangen\u201d) and reads the headline total whether it\u2019s to pay OR to receive'] },
    { v:'2026.07.26-11', notes:['Amount detection now also scans the mail\u2019s HTML text (many receipts put the total in HTML, not plain text) before using image vision \u2014 fixes \u20ac0 on Purchases'] },
    { v:'2026.07.26-10', notes:['Per-category € toggle in Settings \u2014 turn on \u201cshow amount\u201d for any category (e.g. Te betalen)', 'Reads amounts from receipt/invoice IMAGES too (Claude vision) when there is no amount in the text'] },
    { v:'2026.07.26-9', notes:['Amount recognition now understands the word \u201cEuro/EUR\u201d and amounts written after the number (e.g. \u201cEuro 120,03\u201d) \u2014 fixes Invoices totals'] },
    { v:'2026.07.26-8', notes:['Purchases & Invoices tiles show BOTH the count and the \u20ac amount (e.g. \u201c3 mails \u00b7 \u20ac249\u201d)'] },
    { v:'2026.07.26-7', notes:['FIXED: the \u20ac amount on Invoices/Purchases tiles now reads the live detector value (extracted.total), so it no longer shows \u20ac0'] },
    { v:'2026.07.26-6', notes:['Invoice-type categories (Invoices/Facturen\u2026) now show the total \u20ac amount in the cockpit, like Purchases \u2014 amount read from the mail (\u20ac1.234,56 and \u20ac12.99 both understood)'] },
    { v:'2026.07.26-5', notes:['Tiles show two numbers only \u2014 unread big (accent) and total small (grey) \u2014 no words'] },
    { v:'2026.07.26-4', notes:['One clean unread indicator per mail (removed the duplicate dot), and the read/unread circle no longer overlaps the text'] },
    { v:'2026.07.26-3', notes:['Tiles show just the unread number \u2014 no subtitle text'] },
    { v:'2026.07.26-2', notes:['Cockpit & archive tiles now lead with the UNREAD count (big, in accent) with the total as a small \u201cunread of N\u201d line \u2014 removed the cluttered corner badge'] },
    { v:'2026.07.26', notes:['Version and cache-buster now use the real Amsterdam date (it was stuck on 25 Jul)'] },
    { v:'2026.07.25-23', notes:['Mark read/unread straight from the mail list (and archive) \u2014 the circle on each card, no need to open it', 'Cockpit & archive tiles show an unread badge and a \u201c\u00b7 N new\u201d count'] },
    { v:'2026.07.25-22', notes:['Dates and times now show in Amsterdam time (Europe/Amsterdam)'] },
    { v:'2026.07.25-21', notes:['Unread mail stands out (bold + accent bar + dot); Mark as read / unread in any mail (cockpit & archive)', 'Label chips & Settings now show a “filed” count so you see archived mail under a label', 'New Gmail is pulled automatically in the background when you open the app (plus the manual \u21bb)'] },
    { v:'2026.07.25-20', notes:['Removed the leftover demo example tasks from the live app (an earlier version had saved them)'] },
    { v:'2026.07.25-19', notes:['FIXED: fixing a mail\u2019s category/label now sticks \u2014 it no longer snaps back to the old one when rules re-run', 'The \u21bb button (cockpit + archive) instantly re-sorts everything with your current rules'] },
    { v:'2026.07.25-18', notes:['Tasks & agenda now stay after a refresh (saved on your device)', 'Settings: a short “What is an AI rule?” explainer at the top of Label rules'] },
    { v:'2026.07.25-17', notes:['One-time actions on search results — search (with AI), then Tag all / Archive all once, without a saved rule', '“Save as rule” turns your AI search into a permanent rule if you want', 'Your last search is remembered when you reopen Search'] },
    { v:'2026.07.25-16', notes:['Search (with AI): find mail literally, or tap ✨AI to search by meaning in any language', 'Sync now: ↻ button on the cockpit pulls new Gmail and re-applies your rules', 'Make a rule from an email (prefilled) via the email detail', 'Pause/resume any rule with its On/Off switch — no need to delete'] },
    { v:'2026.07.25-15', notes:['Live preview in the New rule builder — see how many mails it catches (and example subjects) as you type, semantic for AI rules'] },
    { v:'2026.07.25-14', notes:['New full-screen “New rule” builder — clear 3-step form with dropdowns', 'Couple a rule to a label OR a category from one dropdown (existing ones + “New label…”)', 'Match type is a dropdown: AI / sender / @domain / subject, with help per choice'] },
    { v:'2026.07.25-13', notes:['Category rules can now be AI too — describe in plain words what belongs in a category and Claude sorts it there (semantic, live)', 'Pick the category from a list; edit AI category rules with ✎'] },
    { v:'2026.07.25-12', notes:['AI label rules are now truly semantic (live) — Claude reads the meaning, so “factuur” finds English invoices, synonyms and typos work', 'Falls back to on-device keyword match in the offline demo'] },
    { v:'2026.07.25-11', notes:['You now PICK a rule’s label from a list instead of typing it — a typo can’t silently create a duplicate label anymore', 'Tap the label ▾ on any rule to move it to another label', 'Category-rule editing warns if you type a category that doesn’t exist'] },
    { v:'2026.07.25-10', notes:['Settings reorganised into collapsible sections — Label rules on top (open), everything else tidied below and folded away', 'Sections you open stay open while you work'] },
    { v:'2026.07.25-9', notes:['FIXED: “Move to cockpit”, delete and snooze now stick after a refresh (they weren’t saved to the server before)', 'Category rules are now editable too — tap ✎ to change what they match, with a live · N mails count'] },
    { v:'2026.07.25-8', notes:['FIXED: custom categories & label edits now survive a refresh', 'Removed the confusing fixed example rules (“boss”, “klm.com”) — every rule shown is real and editable/deletable now', 'Settings explains how to make AI rules and how to change any rule'] },
    { v:'2026.07.25-7', notes:['Label rules are now fully editable — tap ✎ to change what a rule matches (incl. the ones I generate), tap → tag to flip it, and see a live count of matching mail', 'New AI rules: describe in plain language what to tag (e.g. “invoices, payments”)', '“Suggest a rule from my mail” proposes a rule from your own labelling'] },
    { v:'2026.07.25-6', notes:['Archive category tiles follow the same order as the Cockpit/Settings'] },
    { v:'2026.07.25-5', notes:['Swipe left/right between Cockpit · Tasks · Archive · Settings', 'Swiping on a card still archives/snoozes as before'] },
    { v:'2026.07.25-4', notes:['“Merge with another delivery…” to manually group mail the app couldn’t link (e.g. a pickup notice with no tracking number)', 'Remove a mail from its group again; both are remembered'] },
    { v:'2026.07.25-3', notes:['Grouping now also works in the Archive (filed mail)', 'Same-tracking mail merges even with other mail in between', 'The most recent status (delivered ▸ pickup ▸ in transit) shows on top'] },
    { v:'2026.07.25-2', notes:['Deliveries & purchases group by tracking or order number — works on existing mail too', 'Always show carrier · #tracking · pickup point on delivery mail', 'Reorder/toggle in Settings keeps your scroll position (no jump to top)'] },
    { v:'2026.07.25', notes:['Mail list & detail show the date, not just the time', 'Show original email with images (safe, sandboxed)', 'Back from a filed mail returns to the Archive', 'Rename/delete categories; rename/recolor/delete labels', 'Import older mail from a date is always available', 'This version panel + “refresh to newest” button'] },
    { v:'2026.07.24', notes:['Firestore storage so you stay signed in on free hosting', 'Keep-warm ping to avoid cold starts', 'New cockpit-style app icon'] },
    { v:'2026.07.23', notes:['Propose meeting for the agenda + Google Calendar link', 'English/Dutch toggle for the whole app', 'Mirror categories & labels to Gmail', 'Undo on rule/label/category changes'] }
  ];
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
  function ruleWho(r){ return r.scope==='ai' ? ('“'+(r.value||'')+'”') : r.scope==='domain' ? ('@'+r.value) : r.scope==='subject' ? ('“'+r.value+'” in subject') : r.value; }
  function rulePrefix(r){ return r.scope==='ai' ? 'Mail about ' : r.scope==='subject' ? 'Mail with ' : 'Mail from '; }
  function labelChips(m){
    if(!m.labels || !m.labels.length) return '';
    return m.labels.map(function(id){ var l=labelById(id); return l ? '<span class="lbl mini" style="--lc:'+l.color+'">'+esc(l.name)+'</span>' : ''; }).join('');
  }
  function labelCount(id){ return state.messages.filter(function(m){ return isActive(m) && inSel(m) && (m.labels||[]).indexOf(id)>=0; }).length; }

  // ---- mirror to Gmail: categories + labels become Gmail labels under "MailAI/" ----
  var MIRROR_KEY = 'mailai-mirror-gmail-v1';
  function loadMirror(){ try { return localStorage.getItem(MIRROR_KEY) === '1'; } catch(e){ return false; } }
  function saveMirror(){ try { localStorage.setItem(MIRROR_KEY, state.mirrorGmail ? '1' : '0'); } catch(e){} }
  // manual "merge with…" links: { messageId: groupId } — persisted, wins over auto-grouping
  var MERGES_KEY = 'mailai-merges-v1';
  function loadMerges(){ try { return JSON.parse(localStorage.getItem(MERGES_KEY) || '{}') || {}; } catch(e){ return {}; } }
  function saveMerges(){ try { localStorage.setItem(MERGES_KEY, JSON.stringify(state.merges || {})); } catch(e){} }
  // tasks & agenda meetings survive reloads
  var TASKS_KEY = 'mailai-tasks-v1', MEET_KEY = 'mailai-meetings-v1';
  function loadTasks(){ try { return JSON.parse(localStorage.getItem(TASKS_KEY) || 'null'); } catch(e){ return null; } }
  function saveTasks(){ try { localStorage.setItem(TASKS_KEY, JSON.stringify(state.tasks || [])); } catch(e){} }
  function loadMeetings(){ try { return JSON.parse(localStorage.getItem(MEET_KEY) || 'null'); } catch(e){ return null; } }
  function saveMeetings(){ try { localStorage.setItem(MEET_KEY, JSON.stringify(state.meetings || [])); } catch(e){} }
  // custom categories & labels (adds, renames, colours, deletes) survive reloads
  var CATS_KEY = 'mailai-cats-v1', LABELS_KEY = 'mailai-labels-v1';
  function saveCats(){ try { localStorage.setItem(CATS_KEY, JSON.stringify(state.categories || [])); } catch(e){} }
  var CATSDEL_KEY = 'mailai-catdel-v1';   // built-in category ids the user deleted (tombstones)
  function loadCatDeleted(){ try { return JSON.parse(localStorage.getItem(CATSDEL_KEY) || '[]'); } catch(e){ return []; } }
  function rememberCatDeleted(id){ try { var s = loadCatDeleted(); if(s.indexOf(id)<0){ s.push(id); localStorage.setItem(CATSDEL_KEY, JSON.stringify(s)); } } catch(e){} }
  function loadCats(){ try { return JSON.parse(localStorage.getItem(CATS_KEY) || 'null'); } catch(e){ return null; } }
  function saveLabels(){ try { localStorage.setItem(LABELS_KEY, JSON.stringify(state.labels || [])); } catch(e){} }
  function loadLabels(){ try { return JSON.parse(localStorage.getItem(LABELS_KEY) || 'null'); } catch(e){ return null; } }
  // On boot: start from the server/default defs, then re-apply the user's saved
  // customizations. Built-ins can't be deleted, so any new built-in the server
  // adds later is appended; the user's custom cats/labels are preserved.
  function applyCustomDefs(defaultCats){
    var savedC = loadCats();
    if(savedC && savedC.length){
      var have = {}; savedC.forEach(function(c){ have[c.id] = 1; });
      var gone = {}; loadCatDeleted().forEach(function(id){ gone[id] = 1; });
      // re-append built-ins the server adds later, but never a built-in the user deleted
      (defaultCats || []).forEach(function(c){ if(c.builtin && !have[c.id] && !gone[c.id]) savedC.push(c); });
      state.categories = savedC;
    }
    var savedL = loadLabels();
    if(savedL){ state.labels = savedL; }
  }
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
    'New':'Nieuw','all caught up':'alles bijgewerkt',
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
    'Gmail sync off':'Gmail-sync uit','Added to agenda':'Toegevoegd aan agenda','Proposal sent':'Voorstel verstuurd',
    'Undo':'Ongedaan maken','Removed':'Verwijderd','Rule removed':'Regel verwijderd','Task deleted':'Taak verwijderd'
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
  function saveLearned(){ try { localStorage.setItem(LEARN_KEY, JSON.stringify((state.labelRules||[]).map(function(r){ var o={}; for(var k in r){ if(k!=='_aiIds') o[k]=r[k]; } return o; }))); } catch(e){} }
  // plain-language "AI rule": matches when a significant word from the description
  // appears in the mail (a light on-device approximation of the AI labeler).
  var _STOP = { with:1, from:1, that:1, this:1, mail:1, email:1, about:1, over:1, your:1, been:1, will:1, they:1, them:1, when:1, which:1, then:1 };
  function _aiRuleMatch(desc, m){
    var text = ((m.subject||'')+' '+(m.snippet||'')+' '+(m.summary||'')+' '+(m.from||'')).toLowerCase();
    var words = (desc||'').toLowerCase().split(/[^a-z0-9]+/)
      .filter(function(w){ return w.length>3 && !_STOP[w]; })
      .map(function(w){ return w.replace(/s$/, ''); });   // light stem so plural/singular match
    return words.some(function(w){ return w.length>2 && text.indexOf(w)>=0; });
  }
  function ruleMatches(rule, m){
    // AI rules: use Claude's semantic match when we have it (live), else the
    // on-device keyword heuristic (demo/offline/while it loads).
    return rule.scope==='ai' ? (rule._aiIds ? !!rule._aiIds[m.id] : _aiRuleMatch(rule.value, m))
      : rule.scope==='domain' ? m.domain===rule.value
      : rule.scope==='subject' ? (m.subject||'').toLowerCase().indexOf((rule.value||'').toLowerCase())>=0
      : m.from===rule.value;
  }
  // Ask the backend (real Claude) which mail matches each AI rule's meaning —
  // handles synonyms, other languages and typos. Live only; no-op in demo.
  function evaluateAiRules(){
    if(!API_OK) return;
    var aiRules = (state.labelRules||[]).filter(function(r){ return r.scope==='ai'; })
      .concat((state.catRules||[]).filter(function(r){ return r.scope==='ai'; }));
    if(!aiRules.length) return;
    var items = (state.messages||[]).map(function(m){ return { id:m.id, text:((m.subject||'')+' — '+(m.snippet||'')).slice(0,200) }; });
    Promise.all(aiRules.map(function(r){
      return fetch('/api/labels/ai-match', { method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ description:r.value, items:items }) })
        .then(function(x){ return x.ok ? x.json() : null; })
        .then(function(d){ if(d && d.ids){ var s={}; d.ids.forEach(function(id){ s[id]=1; }); r._aiIds = s; } })
        .catch(function(){});
    })).then(function(){ recomputeAll(); render(); });
  }
  // ---- live preview for the rule builder (updates as you type) ----
  var rbPvTimer = null, rbPvCache = {};
  function rbMatchList(kind, val){
    if(kind==='ai') return (state.messages||[]).filter(function(m){ return _aiRuleMatch(val, m); });
    var v = (kind==='domain' && val.charAt(0)==='@') ? val.slice(1) : val;
    var rule = { scope:kind, value:v };
    return (state.messages||[]).filter(function(m){ return ruleMatches(rule, m); });
  }
  function rbShow(list){
    var pv = document.getElementById('rb-preview'); if(!pv) return;
    var n = list.length;
    var ex = list.slice(0,3).map(function(m){ return '<div class="rb-pv-ex"><b>'+esc(m.from)+'</b> — '+esc((m.subject||'').slice(0,52))+'</div>'; }).join('');
    pv.innerHTML = '<div class="rb-pv-count">'+n+' mail'+(n===1?'':'s')+' match right now</div>'
      + (n ? ex : '<div class="rb-pv-empty">No matches yet — try other words.</div>');
  }
  function rbUpdatePreview(){
    var kEl=document.getElementById('rb-kind'), vEl=document.getElementById('rb-val'), pv=document.getElementById('rb-preview');
    if(!pv || !kEl || !vEl) return;
    var kind=kEl.value, val=(vEl.value||'').trim();
    if(!val){ pv.innerHTML='<span class="rb-pv-empty">Type above to see matching mail…</span>'; return; }
    if(kind==='ai' && API_OK){
      if(rbPvCache[val]){ rbShow(rbPvCache[val]); return; }
      pv.innerHTML = '<span class="rb-pv-empty">'+SPARK+'Reading your mail…</span>';
      var items=(state.messages||[]).map(function(m){ return { id:m.id, text:((m.subject||'')+' — '+(m.snippet||'')).slice(0,200) }; });
      fetch('/api/labels/ai-match',{ method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ description:val, items:items }) })
        .then(function(x){ return x.ok ? x.json() : null; })
        .then(function(d){ var ids=d&&d.ids; var list = ids ? (state.messages||[]).filter(function(m){ return ids.indexOf(m.id)>=0; }) : rbMatchList('ai',val);
          rbPvCache[val]=list; var cur=document.getElementById('rb-val'); if(cur && (cur.value||'').trim()===val) rbShow(list); })
        .catch(function(){ rbShow(rbMatchList('ai',val)); });
    } else {
      rbShow(rbMatchList(kind, val));
    }
  }
  function rbDebouncedPreview(){ if(rbPvTimer) clearTimeout(rbPvTimer); rbPvTimer=setTimeout(rbUpdatePreview, 500); }
  // one row per rule: what it matches · which label · live count · edit/flip/delete
  function ruleRowHTML(r, i){
    var l = labelById(r.labelId);
    var n = (state.messages||[]).filter(function(m){ return ruleMatches(r, m); }).length;
    return '<div class="rule rule-row'+(r.off?' isoff':'')+'"><span>'
      + '<button class="ruletog'+(r.off?' off':'')+'" data-act="ruletoggleoff" data-i="'+i+'" aria-label="'+(r.off?'enable':'disable')+' rule">'+(r.off?'Off':'On')+'</button> '
      + (r.scope==='ai' ? '<span class="rbadge">'+SPARK+'AI</span> ' : '')
      + rulePrefix(r) + '<b>' + esc(ruleWho(r)) + '</b> '
      + '<button class="ruleflip" data-act="ruleflip" data-i="'+i+'">' + (r.action==='remove' ? '✗ don’t tag' : '→ tag') + '</button> '
      + '<button class="rulelabel" data-act="rulerelabel" data-i="'+i+'" style="color:'+(l?l.color:'#888')+'">'+(l?esc(l.name):esc(r.labelId))+' ▾</button>'
      + ' <span class="ccount">· '+n+' mail'+(n===1?'':'s')+'</span></span>'
      + '<button class="rule-x" data-act="editrule" data-i="'+i+'" aria-label="edit rule">✎</button>'
      + '<button class="rule-x" data-act="delrule" data-i="'+i+'" aria-label="remove rule">✕</button></div>';
  }
  function learnRule(rule){
    state.labelRules = (state.labelRules||[]).filter(function(r){ return !(r.scope===rule.scope && r.value===rule.value && r.labelId===rule.labelId); });
    state.labelRules.push(rule);
    saveLearned();
  }
  function applyRule(rule){
    var n = 0;
    if(rule.off) return n;   // disabled rules don't apply (kept for later)
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
  function recomputeLabels(){
    var exist = {}; (state.labels||[]).forEach(function(l){ exist[l.id] = 1; });
    state.messages.forEach(function(m){ m.labels = (state.originalLabels[m.id]||[]).slice().filter(function(id){ return exist[id]; }); });
    (state.labelRules||[]).forEach(applyRule);
  }
  function recomputeCats(){ state.messages.forEach(function(m){ m.cat = state.originalCat[m.id]; }); (state.catRules||[]).forEach(applyCatRule); }
  function recomputeAll(){ recomputeLabels(); recomputeCats(); deriveGroups(); }

  // --- delivery/purchase grouping (works retroactively on stored mail text) ---
  function _grpText(m){ return ((m.subject||'')+' '+(m.snippet||'')+' '+(m.summary||'')+' '+(m.body||'')); }
  function _normKey(s){ return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function findTracking(t){
    // carrier-specific formats first (most reliable), then a generic long number
    var res = [/\b3S[A-Z0-9]{9,}\b/i, /\bJVGL[A-Z0-9]{8,}\b/i, /\b1Z[A-Z0-9]{16}\b/i,
               /\bJJD[0-9]{12,}\b/i, /\b[0-9]{12,18}\b/];
    for(var i=0;i<res.length;i++){ var mm=t.match(res[i]); if(mm) return mm[0]; }
    return '';
  }
  function findOrder(t){
    var mm = t.match(/(?:order|bestel(?:ling|nr|nummer)?|ordernr|order\s*id)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,})/i);
    return mm ? mm[1] : '';
  }
  function findCarrier(t){
    var m2 = t.match(/\b(PostNL|DHL|DPD|GLS|UPS|FedEx|bol(?:\.com)?|Amazon|Coolblue|Bpost)\b/i);
    return m2 ? m2[1] : '';
  }
  // The group key: tracking first (same parcel across senders), else order+account
  // (bridges the pre-tracking phase), matching the agreed rules.
  function groupKeyOf(m){
    if(m.cat!=='delivery' && m.cat!=='purchase') return '';
    var ex = m.extracted || {}, t = _grpText(m);
    var track = ex.tracking_number || findTracking(t);
    if(track) return 'trk:'+_normKey(track);
    var order = ex.order_id || findOrder(t);
    if(order) return 'ord:'+_normKey(order)+'@'+_normKey(m.email||m.from||'');
    return '';
  }
  function deriveGroups(){
    (state.messages||[]).forEach(function(m){
      if(m.group) return;              // keep any seed/backend-assigned group
      var k = groupKeyOf(m);
      if(k) m.group = k;
    });
    // manual "merge with…" links win over auto-grouping
    var mm = state.merges || {};
    (state.messages||[]).forEach(function(m){ if(mm[m.id]) m.group = mm[m.id]; });
  }
  // link two mails (and everything already in either's group) into one group
  function mergeMessages(aId, bId){
    var a = msgById(aId), b = msgById(bId);
    if(!a || !b || aId===bId) return;
    if(!state.merges) state.merges = {};
    var gid = 'man:' + bId;                       // stable target id
    var groups = {}; if(a.group) groups[a.group]=1; if(b.group) groups[b.group]=1;
    var ids = {}; ids[aId]=1; ids[bId]=1;
    (state.messages||[]).forEach(function(m){ if(m.group && groups[m.group]) ids[m.id]=1; });
    var before = {};
    Object.keys(ids).forEach(function(k){ before[k] = state.merges[k]; state.merges[k] = gid; });
    saveMerges(); recomputeAll();
    toast('Samengevoegd · '+Object.keys(ids).length+' mails', function(){
      Object.keys(ids).forEach(function(k){ if(before[k]===undefined) delete state.merges[k]; else state.merges[k]=before[k]; });
      saveMerges(); recomputeAll(); render();
    });
  }
  function unmergeMessage(id){
    if(state.merges && state.merges[id]!==undefined){ var prev=state.merges[id]; delete state.merges[id]; saveMerges(); recomputeAll();
      toast('Uit groep gehaald', function(){ state.merges[id]=prev; saveMerges(); recomputeAll(); render(); }); }
  }
  // A compact, always-present line: carrier · #tracking · pickup + code
  function groupInfoLine(m){
    if(m.cat!=='delivery' && m.cat!=='purchase') return '';
    var ex = m.extracted || {}, t = _grpText(m), bits = [];
    var carrier = ex.carrier || findCarrier(t);
    var track = ex.tracking_number || findTracking(t);
    var order = ex.order_id || (track ? '' : findOrder(t));
    var pickup = ex.pickup_location || '', code = ex.pickup_code || '';
    if(carrier) bits.push(esc(carrier));
    if(track) bits.push('#'+esc(track));
    else if(order) bits.push('order '+esc(order));
    if(pickup) bits.push('📍 '+esc(pickup)+(code?' · '+esc(code):''));
    return bits.join(' · ');
  }
  // Which member represents the group: the most-advanced status (delivered >
  // ready for pickup > in transit > ordered), so the newest state shows on top.
  function _statusRank(m){
    var t = _grpText(m).toLowerCase();
    if(/afgeleverd|bezorgd|delivered/.test(t)) return 5;
    if(/afhaalpunt|klaargezet|opgehaald|ready for pickup|pickup/.test(t)) return 4;
    if(/onderweg|verzonden|out for delivery|shipped|in transit/.test(t)) return 3;
    if(/besteld|bestelling|ontvangen|order (confirmed|received)|confirmed/.test(t)) return 1;
    return 2;
  }
  function pickRep(members){
    return members.filter(function(x){ return x.groupLatest; })[0]
      || members.slice().sort(function(a,b){ return _statusRank(b)-_statusRank(a); })[0]
      || members[0];
  }

  // ---- category rules (correction loop, mirrors labels) ----
  var CATRULE_KEY = 'mailai-catrules-v1';
  function loadCatRules(){ try { return JSON.parse(localStorage.getItem(CATRULE_KEY)) || []; } catch(e){ return []; } }
  function saveCatRules(){ try { localStorage.setItem(CATRULE_KEY, JSON.stringify((state.catRules||[]).map(function(r){ var o={}; for(var k in r){ if(k!=='_aiIds') o[k]=r[k]; } return o; }))); } catch(e){} }
  function catRuleMatches(rule, m){
    return rule.scope==='ai' ? (rule._aiIds ? !!rule._aiIds[m.id] : _aiRuleMatch(rule.value, m))
      : rule.scope==='domain' ? m.domain===rule.value
      : rule.scope==='subject' ? (m.subject||'').toLowerCase().indexOf((rule.value||'').toLowerCase())>=0
      : m.from===rule.value;
  }
  function applyCatRule(rule){ if(rule.off) return; state.messages.forEach(function(m){ if(catRuleMatches(rule, m)) m.cat = rule.catId; }); }
  function learnCatRule(rule){ state.catRules = (state.catRules||[]).filter(function(r){ return !(r.scope===rule.scope && r.value===rule.value); }); state.catRules.push(rule); saveCatRules(); }

  // ---- cockpit category order (reorder from Settings; persists) ----
  var CATORDER_KEY = 'mailai-catorder-v1';
  function saveCatOrder(){ try { localStorage.setItem(CATORDER_KEY, JSON.stringify(state.categories.map(function(c){ return c.id; }))); } catch(e){} }
  function applyCatOrder(){
    var ord; try { ord = JSON.parse(localStorage.getItem(CATORDER_KEY)); } catch(e){ ord = null; }
    if(!ord || !ord.length) return;
    state.categories.sort(function(a, b){
      var ia = ord.indexOf(a.id), ib = ord.indexOf(b.id);
      if(ia < 0) ia = 999; if(ib < 0) ib = 999;   // categories added later go to the end
      return ia - ib;
    });
  }
  function moveCat(id, dir){
    var cats = state.categories, idx = cats.map(function(c){ return c.id; }).indexOf(id), j = idx + dir;
    if(idx < 0 || j < 0 || j >= cats.length) return;
    var tmp = cats[idx]; cats[idx] = cats[j]; cats[j] = tmp;
    saveCatOrder(); saveCats(); render();
  }
  var pendingProposal = null;   // {sender,labelId,action,others,labelName,msgId} awaiting approval
  function fixLabel(msgId, labelId){
    var m = msgById(msgId); if(!m) return;
    if(!m.labels) m.labels = [];
    var i = m.labels.indexOf(labelId);
    var adding = i < 0;
    if(adding) m.labels.push(labelId); else m.labels.splice(i, 1);  // this email only
    state.originalLabels[msgId] = m.labels.slice();   // new baseline so a recompute keeps it
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
  // sticky action bar on the email detail — primary actions always in reach,
  // no scrolling to the bottom. Reply (jumps to the suggested reply), Archive
  // (or Restore when filed), Delete.
  function detailBar(){
    var h = location.hash || '';
    if(h.indexOf('#/m/')!==0) return '';
    var m = msgById(h.slice(4));
    if(!m) return '';
    var reply = m.reply ? '<button class="btn pri" data-act="replyjump" data-id="'+m.id+'">'+svg('<path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>',15)+' Reply</button>' : '';
    var file = m.archived
      ? '<button class="btn" data-act="restore" data-id="'+m.id+'">Restore</button>'
      : '<button class="btn" data-act="archive" data-id="'+m.id+'">'+svg('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',14)+' Archive</button>';
    return '<div class="detailbar">'+reply+file
      + '<button class="btn danger" data-act="delete" data-id="'+m.id+'">'+svg('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/>',14)+' Delete</button></div>';
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
    m.chip = c ? c.name : catId;   // keep the card chip in sync with the detail category
    state.originalCat[msgId] = catId;   // make it the new baseline so a recompute keeps it
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
  var pendingRule = null;   // a rule waiting for its label to be picked (no typing = no duplicates)
  function rulePickBar(){
    if(!pendingRule) return '';
    var pr = pendingRule;
    var what = pr.applyOnce ? ('Tag these '+pr.applyOnce.length+' found mails with — one time:')
      : pr.editIndex!=null ? 'Move this rule to which label?' : 'Tag matching mail with — pick a label:';
    var chips = (state.labels||[]).map(function(l){
      return '<button class="pseg" data-act="rulepick" data-id="'+l.id+'" style="text-align:left"><span class="cdotmini" style="background:'+l.color+'"></span>'+esc(l.name)+'</button>';
    }).join('');
    return '<div class="proposal"><div class="ptext">'+SPARK+' '+what+'</div>'
      + '<div class="pacts" style="flex-wrap:wrap">'+chips
      + '<button class="pseg" data-act="rulepick" data-id="__new__" style="border-style:dashed">+ New label…</button>'
      + '<button class="btn ghost" data-act="rulepickcancel">Cancel</button></div></div>';
  }
  var pendingCatRule = null;   // an AI category rule waiting for its category
  function catPickBar(){
    if(!pendingCatRule) return '';
    var chips = (state.categories||[]).map(function(c){
      return '<button class="pseg" data-act="catrulepick" data-id="'+c.id+'" style="text-align:left"><span class="cdotmini" style="background:'+c.color+'"></span>'+esc(c.name)+'</button>';
    }).join('');
    return '<div class="proposal"><div class="ptext">'+SPARK+' Put matching mail in which category?</div>'
      + '<div class="pacts" style="flex-wrap:wrap">'+chips
      + '<button class="btn ghost" data-act="catrulepickcancel">Cancel</button></div></div>';
  }
  var pendingMerge = null;   // messageId awaiting a merge target
  function mergeBar(){
    if(!pendingMerge) return '';
    var src = msgById(pendingMerge); if(!src) return '';
    // candidates: other delivery/purchase mail not already in the same group;
    // one entry per existing group (its representative) + each ungrouped mail
    var seen = {}, cands = [];
    (state.messages||[]).forEach(function(m){
      if(m.id===src.id) return;
      if(m.cat!=='delivery' && m.cat!=='purchase') return;
      if(src.group && m.group===src.group) return;
      if(m.group){ if(seen[m.group]) return; seen[m.group]=1; m = pickRep((state.messages||[]).filter(function(x){return x.group===m.group;})); }
      cands.push(m);
    });
    var rows = cands.slice(0,15).map(function(m){
      return '<button class="pseg" style="text-align:left" data-act="mergepick" data-id="'+m.id+'">'+esc(m.from)+' — '+esc((m.subject||'').slice(0,42))+'</button>';
    }).join('') || '<div class="ptext" style="opacity:.7">No other deliveries to merge with.</div>';
    return '<div class="proposal"><div class="ptext">'+SPARK+' Merge <b>'+esc(src.from)+' — '+esc((src.subject||'').slice(0,30))+'</b> with which delivery?</div>'
      + '<div class="pacts" style="flex-direction:column;align-items:stretch;gap:6px">'+rows
      + '<button class="btn ghost" data-act="mergecancel">Cancel</button></div></div>';
  }
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
      var filed = labelFiled(l.id).length;
      return '<button class="lblchip" style="--lc:'+l.color+'" data-nav="#/label/'+l.id+'">'+esc(l.name)+' <b>'+labelCount(l.id)+'</b>'+(filed?'<span class="lblfiled">'+filed+' filed</span>':'')+'</button>';
    }).join('');
    return '<div class="lblrow"><span class="lblrow-h">'+SPARK+' Labels</span>'+chips+'</div>';
  }

  // parse a money string in EU or US format to a number (€1.234,56 → 1234.56)
  function _parseAmt(s){
    s = s.replace(/\s/g,'');
    if(/,\d{2}$/.test(s)) s = s.replace(/\./g,'').replace(',', '.');   // EU decimal comma
    else if(/\.\d{2}$/.test(s)) s = s.replace(/,/g,'');                 // US decimal dot
    else s = s.replace(/[.,\s]/g,'');                                   // integer
    var n = parseFloat(s); return isNaN(n) ? 0 : n;
  }
  // the amount on a mail: the detector's total (top-level in demo, inside
  // `extracted` when live), else the largest € figure in the mail text
  function amountOf(m){
    if(typeof m.money === 'number' && m.money > 0) return m.money;   // vision/backend-detected
    var ex = m.extracted || {};
    var cand = m.total != null ? m.total : (ex.total != null ? ex.total : (ex.amount != null ? ex.amount : (ex.bedrag != null ? ex.bedrag : ex.price)));
    if(cand != null && cand !== ''){
      var v0 = (typeof cand === 'number') ? cand : _parseAmt(String(cand).replace(/[^\d.,]/g, ''));
      if(v0 > 0) return v0;
    }
    var t = (m.subject||'')+' '+(m.snippet||'')+' '+(m.summary||'')+' '+(m.body||'');
    // € / EUR / euro(s), currency before OR after the number (e.g. "Euro 120,03" or "120,03 EUR")
    var re = /(?:€|euros?|eur)\s*(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s*(?:€|euros?\b|eur\b)/gi, best=0, mm;
    while((mm = re.exec(t))){ var v = _parseAmt(mm[1] || mm[2]); if(v > best) best = v; }
    return best;
  }
  function catMoney(ms){ return ms.reduce(function(s,m){ return s + amountOf(m); }, 0); }
  // is this amount money you RECEIVE ('in', green) or PAY ('out', red)? Prefers the
  // backend's reading (m.moneyDir), else scans the mail text for the usual wording.
  function amountDir(m){
    if(m.moneyDir==='in' || m.moneyDir==='out') return m.moneyDir;
    var t = ((m.subject||'')+' '+(m.snippet||'')+' '+(m.summary||'')+' '+(m.body||'')).toLowerCase();
    if(/te ontvangen|ontvang|je krijgt|terug te ontvangen|terugbetaling|terugstort|tegoed|refund|credit|you (?:will )?receive|we owe you/.test(t)) return 'in';
    if(/te betalen|te voldoen|factuurbedrag|openstaand|verschuldigd|amount due|please pay|incasso|automatisch afgeschreven|te incasseren/.test(t)) return 'out';
    return '';
  }
  // for money-tiles: when a mail has no € in its text, ask the backend to read it
  // (incl. from images via vision) and cache it. Batched + capped to limit cost.
  var _amtChecked = {};
  function fetchAmounts(){
    if(!API_OK) return;
    var moneyCats = {}; (state.categories||[]).forEach(function(c){ if(wantsMoney(c)) moneyCats[c.id] = 1; });
    var todo = (state.messages||[]).filter(function(m){ return moneyCats[m.cat] && m.money==null && !_amtChecked[m.id] && amountOf(m)===0; }).slice(0,8);
    if(!todo.length) return;
    todo.forEach(function(m){ _amtChecked[m.id] = 1; });
    Promise.all(todo.map(function(m){
      return fetch('/api/messages/'+encodeURIComponent(m.id)+'/amount', { method:'POST', credentials:'same-origin' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){ if(d){ m.money = d.amount || 0; if(d.direction) m.moneyDir = d.direction; } }).catch(function(){});
    })).then(function(){ render(); });
  }
  function isMoneyCat(cat){ return /invoice|factu|rekening|\bbill|betaal|betaling|payment|te betalen/i.test(cat.name||''); }
  // a tile shows the € total when: it's Purchases, the user turned it on, or the name looks money-ish
  function wantsMoney(cat){ return !!cat && (cat.id==='purchase' || cat.showMoney || (cat.showMoney!==false && isMoneyCat(cat))); }
  function hintFor(cat){
    var ms = msgsIn(cat.id), n = ms.length, a;
    switch(cat.id){
      case 'urgent': a = ms.filter(function(m){return m.needsAction;}).length; return '<b>'+a+'</b> need action';
      case 'reply': return '<b>'+n+'</b> drafts ready';
      case 'delivery': a = ms.filter(function(m){return m.pickup;}).length; return a ? '<b>'+a+'</b> ready for pickup' : n+' in transit';
      case 'purchase': return '<b>'+n+'</b> mail'+(n===1?'':'s')+' · €'+catMoney(ms).toFixed(0);
      case 'travel': a = Math.min.apply(null, ms.map(function(m){return m.daysUntil==null?999:m.daysUntil;})); return (a<999) ? 'Trip in <b>'+a+' days</b>' : 'no trips';
      case 'newsletter': a = ms.reduce(function(s,m){return s+(m.unread||0);},0); return a+' unread';
      case 'ticket': return '<b>'+n+'</b> for Wallet';
      case 'waiting': a = ms.filter(function(m){return m.overdue;}).length; return a ? '<b>'+a+'</b> overdue' : n+' waiting';
      default:
        if(wantsMoney(cat)){ return '<b>'+n+'</b> mail'+(n===1?'':'s')+' · €'+catMoney(ms).toFixed(0); }
        return n+' mail'+(n===1?'':'s');
    }
  }

  // ---------- screen: cockpit ----------
  function viewCockpit(){
    // only count mail in categories that have a visible tile — hidden buckets
    // (Junk, FYI) shouldn't inflate the "auto-handled" number.
    var visSet = {}; visibleCats().forEach(function(c){ visSet[c.id] = true; });
    var active = state.messages.filter(function(m){ return isActive(m) && inSel(m) && visSet[m.cat]; });
    var needYou = active.filter(function(m){ return m.needsAction || m.cat==='reply' || (m.cat==='waiting'&&m.overdue); }).length;
    var autoHandled = active.length - needYou;
    var tiles = visibleCats().map(function(c){
      var ms = msgsIn(c.id), n = ms.length, unr = ms.filter(function(m){ return m.isUnread; }).length;
      return '<button class="tile" style="--tc:'+c.color+'" data-nav="#/c/'+c.id+'">'
        + '<span class="ticon">'+svg(iconFor(c),15)+'</span>'
        + (n>0?'<span class="tcount'+(unr>0?' hot':'')+'">'+unr+'<span class="ttot">'+n+'</span></span>':'')
        + '<span class="tname">'+esc(c.name)+'</span>'
        + '<span class="tsub">'+hintFor(c)+'</span></button>';
    }).join('');
    // "New" — a cross-cutting tile that gathers all unread mail so you can see what
    // just arrived without hunting each category. The mail stays in its category too.
    var newCount = active.filter(function(m){ return m.isUnread; }).length;
    var newTile = '<button class="tile newtile'+(newCount>0?' has':'')+'" style="grid-column:1/-1" data-nav="#/focus/new">'
      + '<span class="ticon">'+svg('<path d="M22 6l-10 7L2 6"/><rect x="2" y="4" width="20" height="16" rx="2"/>',15)+'</span>'
      + '<span class="newtext"><span class="tname">New</span>'
      + '<span class="tsub">'+(newCount>0?('<b>'+newCount+'</b> unread across all categories'):'all caught up')+'</span></span>'
      + (newCount>0?'<span class="newbadge">'+newCount+'</span>':'')+'</button>';
    return {
      top: '<div class="brand">'+BRANDMARK+' MailAI · Cockpit'
         + '<span class="topbtns"><button class="iconbtn" data-nav="#/search" aria-label="Search">'+svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',18)+'</button>'
         + '<button class="iconbtn" data-act="syncnow" aria-label="Sync now">'+svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',18)+'</button></span></div>'
         + '<h1>Good morning, Remco</h1><div class="sub">'+esc(todayStr())+' · '+esc(selLabel())+' · '+active.length+' active</div>',
      body: acctSwitcher() + labelsRow()
          + '<div class="hero">'
          + '<button class="hstat" data-nav="#/focus/need"><div class="big">'+needYou+'</div><div class="hl">need you today ›</div></button>'
          + '<button class="hstat soft" data-nav="#/focus/auto"><div class="big">'+autoHandled+'</div><div class="hl">auto-handled ›</div></button>'
          + '</div>'
          + '<div class="herohint">Tap a number to see those emails. <b>Need you</b> = waiting on your action (urgent, replies, overdue). <b>Auto-handled</b> = MailAI already sorted it (newsletters, receipts, deliveries…).</div>'
          + '<div class="tilegrid">'+newTile+tiles
          + '<button class="tile add" style="grid-column:1/-1" data-act="addcat">'+svg('<path d="M12 5v14M5 12h14"/>',15)+' Add a category tile</button></div>',
      nav: 'cockpit'
    };
  }

  // ---------- screen: category list ----------
  function cardHTML(m){
    var card = '<button class="card'+(m.isUnread?' unread':'')+'" data-nav="#/m/'+m.id+'"><span class="av" style="background:'+m.av+'">'+esc(m.initials)+'</span>'
      + '<span><span class="top"><span class="from">'+esc(m.from)+'</span><span class="time">'+esc((m.date?m.date+' · ':'')+(m.time||''))+'</span></span>'
      + '<span class="subj">'+esc(m.subject)+'</span><span class="snip">'+esc(m.snippet)+'</span>'
      + (m.ai ? '<span class="ai-note">'+SPARK+esc(m.ai)+'</span>' : '')
      + (function(){ var gl=groupInfoLine(m); return gl ? '<span class="grpline">'+svg('<path d="M3 7h13v10H3z"/><path d="M16 10h4l1 3v4h-5z"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',11)+' '+gl+'</span>' : ''; })()
      + '<span class="chip-wrap" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px"><span class="chip" style="--cc:'+((catById(m.cat)||{}).color||'#888')+'">'+esc((catById(m.cat)||{}).name || m.chip || m.cat)+'</span>'+acctTag(m)+labelChips(m)+'</span></span></button>';
    // trailing read/unread toggle — a sibling button (valid HTML, and it sits
    // outside .card so it never triggers the card swipe)
    return '<div class="cardwrap">' + card
      + '<button class="cardread'+(m.isUnread?' un':'')+'" data-act="toggleread" data-id="'+m.id+'" aria-label="'+(m.isUnread?'mark read':'mark unread')+'" title="'+(m.isUnread?'Mark as read':'Mark as unread')+'"></button>'
      + '<button class="cardarch" data-act="archive" data-id="'+m.id+'" aria-label="archive" title="Archive (file it)">'+svg('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',14)+'</button></div>';
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
      var rep = pickRep(members);
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
    // live-classified tickets may not carry a parsed ticket object — fall back to a
    // normal mail card so the Tickets list still renders (don't crash the view).
    if(!t || !Array.isArray(t.grid)) return cardHTML(m);
    var grid = t.grid.map(function(kv){ return '<div><div class="k">'+esc(kv[0])+'</div><div class="v">'+esc(kv[1])+'</div></div>'; }).join('');
    var acc = acctById(m.account);
    return '<button class="ticket '+esc(t.style||'generic')+'" data-nav="#/m/'+m.id+'" style="border:0;text-align:left;width:100%">'
      + '<div class="tt">'+esc(t.tt||'Ticket')+(acc?' · '+esc(acc.name):'')+'</div><div class="ev">'+esc(t.ev||m.subject||'')+'</div><div class="grid">'+grid+'</div>'
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
    var visSet = {}; visibleCats().forEach(function(c){ visSet[c.id] = true; });
    var ms = state.messages.filter(function(m){
      if(m.archived || m.snoozed || !inSel(m) || !visSet[m.cat]) return false;
      if(kind==='new') return !!m.isUnread;
      return kind==='need' ? isNeedYou(m) : !isNeedYou(m);
    });
    var title = kind==='new' ? 'New' : (kind==='need' ? 'Need you today' : 'Auto-handled');
    var desc = kind==='new'
      ? 'Everything <b>unread</b> in one place, newest first — each mail still sits in its own category too. Marking it read here clears it from New.'
      : kind==='need'
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
    parts.push('<div class="panel ai"><p class="h">'+SPARK+' AI summary</p><p>'+esc(m.summary || m.snippet)+'</p>'
      + (function(){ var gl=groupInfoLine(m); return gl ? '<p class="grpline" style="margin-top:8px">'+svg('<path d="M3 7h13v10H3z"/><path d="M16 10h4l1 3v4h-5z"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',12)+' '+gl+'</p>' : ''; })()
      + '</div>');
    // reply sits right under the summary — the main thing you came here to do
    if(m.reply){
      parts.push('<div class="panel reply" id="replypanel-'+m.id+'"><p class="h">'+SPARK+' Suggested reply · professional</p><div class="reply-body">'+esc(m.reply)+'</div>'
        + '<div class="btnrow"><button class="btn pri" data-act="send" data-id="'+m.id+'">'+svg('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',14)+' Send</button>'
        + '<button class="btn" data-act="edit">Edit</button><button class="btn ghost" data-act="discard">Discard</button></div></div>');
    }
    var bodyText = m.body || m.snippet || '';
    // Full email starts collapsed; the "show original with images" button sits at
    // the TOP so you don't scroll the whole body to reach it.
    parts.push('<details class="panel mailpanel"><summary class="h">Full email</summary>'
      + '<button class="btn wide" data-act="showhtml" data-id="'+m.id+'" style="margin:2px 0 10px;border-style:dashed;color:var(--accent-ink)">'
      + svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',13)+' Show original with images</button>'
      + '<div class="mailbody" id="mailbody-'+m.id+'">'+esc(bodyText).replace(/\n/g,'<br>')+'</div></details>');
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
    // if Gmail sync is on, show exactly which Gmail labels this mail gets —
    // collapsed, since it's just a mirror of the category/labels above.
    if(state.mirrorGmail){
      parts.push('<details class="panel gmailpanel"><summary class="h">'+svg('<path d="M3 6l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/>',13)+' In Gmail</summary><div class="lbledit" style="margin-top:10px">'
        + gmailLabelNames(m).map(function(n,i){ return '<span class="lbl gmail'+(i===0?' main':'')+'">'+esc(n)+'</span>'; }).join('')
        + '</div><div class="ai-note" style="margin-top:8px">These appear on this mail in the Gmail app too. The <b>first</b> is the main label (your category); the rest are your labels.</div></details>');
    }
    if(m.extracted){
      var kv = Object.keys(m.extracted).map(function(k){
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px">'
          + '<span style="color:var(--ink-2)">'+esc(k)+'</span><span style="font-weight:600;text-align:right">'+esc(m.extracted[k])+'</span></div>';
      }).join('');
      parts.push('<div class="panel"><p class="h">'+SPARK+' Extracted details</p>'+kv+'</div>');
    }
    // amount panel — for money categories (Purchases/Invoices/your own). Shows the
    // detected € total and lets you re-read it (incl. from banner/receipt images).
    if(wantsMoney(cat)){
      var amt = amountOf(m), dir = amt>0 ? amountDir(m) : '';
      var sign = dir==='in' ? '+ ' : (dir==='out' ? '– ' : '');
      var tag = dir==='in' ? '<span class="amttag in">to receive</span>' : (dir==='out' ? '<span class="amttag out">to pay</span>' : '');
      var valHtml = amt>0 ? '<span class="amtval '+dir+'">'+sign+'€ '+amt.toFixed(2).replace('.',',')+'</span>'+tag
                          : '<span class="amtval none">Not found yet</span>';
      parts.push('<div class="panel"><p class="h">'+svg('<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',13)+' Amount</p>'
        + '<div class="amtline">'+valHtml
        + (API_OK ? '<button class="btn" data-act="readamount" data-id="'+m.id+'">'+svg('<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',13)+' Re-read (incl. images)</button>' : '')+'</div>'
        + '<div class="ai-note" style="margin-top:8px"><span style="color:var(--pos)">Green</span> = money you receive · <span style="color:var(--neg)">red</span> = money you pay. If it stays empty, the amount may sit in an image I can’t reach.</div></div>');
    }
    if(m.tasks && m.tasks.length){
      parts.push('<div class="panel"><p class="h">Extracted tasks</p>'+m.tasks.map(function(t,ti){
        var added = (state.tasks||[]).some(function(x){ return x.msgId===m.id && x.text===t.text; });
        return '<div class="task"><span class="box"></span><div style="flex:1">'+esc(t.text)+(t.due?'<br><span class="due">Due · '+esc(t.due)+'</span>':'')+'</div>'
          + '<button class="miniadd'+(added?' done':'')+'" data-act="addtask" data-id="'+m.id+'" data-ti="'+ti+'"'+(added?' disabled':'')+'>'+(added?'✓ Added':'+ Task')+'</button></div>';
      }).join('')+'</div>');
    }
    // secondary actions tucked into a collapsible "More" so they don't bury the page
    var more = [];
    more.push('<button class="btn wide" data-act="newtask" data-id="'+m.id+'" style="border-style:dashed;color:var(--accent-ink)">+ Create task from this email</button>');
    more.push('<button class="btn wide" data-act="rulefrommail" data-id="'+m.id+'" style="border-style:dashed;color:var(--accent-ink)">'+SPARK+' Make a rule from this sender…</button>');
    if(m.cat==='delivery' || m.cat==='purchase'){
      var inManual = state.merges && state.merges[m.id]!==undefined;
      var mates = m.group ? (state.messages||[]).filter(function(x){ return x.group===m.group && x.id!==m.id; }).length : 0;
      more.push('<button class="btn wide" data-act="merge" data-id="'+m.id+'" style="border-style:dashed;color:var(--accent-ink)">'
        + svg('<path d="M7 4v6a4 4 0 0 0 4 4h6"/><path d="M17 10l4 4-4 4"/>',13)+' Merge with another delivery…</button>');
      if(inManual || mates){
        more.push('<button class="btn wide" data-act="unmerge" data-id="'+m.id+'" style="border-style:dashed">Remove this mail from its group</button>');
      }
    }
    if(looksScheduley(m)){
      more.push('<div class="ai-note" style="padding:2px 4px">'+SPARK+'Looks like scheduling — want an appointment on your agenda?</div>');
    }
    more.push('<button class="btn wide" data-act="proposemeeting" data-id="'+m.id+'" style="border-style:dashed;color:var(--accent-ink)">+ Propose meeting for agenda</button>');
    if(m.cat==='newsletter'){
      more.push('<button class="btn danger wide" data-act="unsub" data-id="'+m.id+'">Unsubscribe</button>');
    }
    more.push('<button class="btn wide" data-act="toggleread" data-id="'+m.id+'">'
      + (m.isUnread ? svg('<path d="M22 6l-10 7L2 6"/><rect x="2" y="4" width="20" height="16" rx="2"/>',14)+' Mark as read'
                  : svg('<circle cx="12" cy="12" r="8"/>',13)+' Mark as unread') + '</button>');
    parts.push('<details class="panel moreacts"><summary class="h">More actions</summary><div class="moregrid">'+more.join('')+'</div></details>');
    if(m.archived){
      parts.push('<div class="ai-note" style="padding:2px 4px">'+SPARK+'Filed — hidden from the cockpit, still kept under its labels.</div>');
    }
    // back goes where the mail actually lives: the Archive if it's filed,
    // otherwise its cockpit category.
    var backNav = m.archived ? '#/archive/'+m.cat : '#/c/'+m.cat;
    var backLabel = m.archived ? (cat.name+' · filed') : cat.name;
    var whenStr = (m.date?m.date+' · ':'')+(m.time||'');
    return {
      top: '<button class="back" data-nav="'+backNav+'">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' '+esc(backLabel)+'</button>'
         + '<h1>'+esc(m.subject)+'</h1><div class="sub"><b>'+esc(m.from)+'</b> · '+esc(whenStr)+' '+acctTag(m)+'</div>',
      withBack: true,
      body: '<div class="detail">'+parts.join('')+'</div>',
      nav: m.archived ? 'archive' : 'cockpit'
    };
  }

  // ---------- screen: archive cockpit ----------
  function archivedMsgs(){ return state.messages.filter(function(m){ return m.archived && !m.snoozed && inSel(m); }); }
  function snoozedMsgs(){ return state.messages.filter(function(m){ return m.snoozed && inSel(m); }); }
  function archiveRow(m){ return '<div class="arow">'+cardHTML(m)+'<div class="btnrow"><button class="btn" data-act="restore" data-id="'+m.id+'">Move to cockpit</button><button class="btn danger" data-act="delete" data-id="'+m.id+'">Delete</button></div></div>'; }
  // same grouping as the cockpit, but keeps each member's Move/Delete buttons
  function groupedArchiveList(ms){
    var seen = {}, out = [];
    ms.forEach(function(m){
      if(!m.group){ out.push(archiveRow(m)); return; }
      if(seen[m.group]) return;
      seen[m.group] = true;
      var members = ms.filter(function(x){ return x.group===m.group; });
      var rep = pickRep(members);
      var others = members.filter(function(x){ return x !== rep; });
      if(!others.length){ out.push(archiveRow(rep)); return; }
      var open = expandedGroups[m.group];
      out.push('<div class="grp">' + archiveRow(rep)
        + '<div class="grp-actions"><button class="grp-toggle" data-act="expandgroup" data-g="'+m.group+'">'
        +   (open ? '▴ Hide earlier' : '▾ '+others.length+' earlier update'+(others.length===1?'':'s')+' · same delivery') + '</button></div>'
        + (open ? '<div class="grp-more">'+others.map(archiveRow).join('')+'</div>' : '')
        + '</div>');
    });
    return out.join('');
  }
  function viewArchive(spec){
    if(spec) return viewArchiveCat(spec);
    var arc = archivedMsgs(), sn = snoozedMsgs();
    var cats = {}; arc.forEach(function(m){ cats[m.cat] = (cats[m.cat]||0)+1; });
    // follow the same category order as the cockpit/Settings (unknown cats last)
    var catOrder = state.categories.map(function(c){ return c.id; });
    var tiles = Object.keys(cats).sort(function(a,b){
      var ia = catOrder.indexOf(a), ib = catOrder.indexOf(b);
      return (ia<0?999:ia) - (ib<0?999:ib);
    }).map(function(cid){
      var c = catById(cid) || { name:cid, color:'var(--c-junk)', id:cid };
      var unr = arc.filter(function(m){ return m.cat===cid && m.isUnread; }).length;
      return '<button class="tile" style="--tc:'+c.color+'" data-nav="#/archive/'+cid+'"><span class="ticon">'+svg(iconFor(c),15)+'</span>'
        + (cats[cid]>0?'<span class="tcount'+(unr>0?' hot':'')+'">'+unr+'<span class="ttot">'+cats[cid]+'</span></span>':'')+'<span class="tname">'+esc(c.name)+'</span><span class="tsub">tap to review</span></button>';
    }).join('');
    var snoozeSec = sn.length ? '<div class="seghead" style="padding-left:14px">Snoozed · '+sn.length+'</div><div class="list" style="padding-top:0">'
      + '<button class="btn wide" data-act="advancetime" style="border-style:dashed;color:var(--accent-ink)">⏭ Advance demo clock (wake due snoozes)</button>'
      + sn.map(function(m){ return '<div class="arow">'+cardHTML(m)+'<button class="btn arow-del" data-act="unsnooze" data-id="'+m.id+'">Wake now'+(m.snoozeUntil?(' · '+esc(m.snoozeUntil)):'')+'</button></div>'; }).join('') + '</div>' : '';
    var body = '<div class="focusdesc">Mail you <b>file</b> leaves the cockpit but stays here (and under its labels). Delete one, a whole category, or empty it all.</div>'
      + (tiles ? '<div class="tilegrid">'+tiles+'</div>' : '<div class="empty">Archive is empty.</div>')
      + (arc.length ? '<div style="padding:12px 14px"><button class="btn danger wide" data-act="emptyarchive">Empty archive ('+arc.length+')</button></div>' : '')
      + snoozeSec;
    return { top:'<div class="brand">'+BRANDMARK+' MailAI · Archive'
        + '<span class="topbtns"><button class="iconbtn" data-nav="#/search" aria-label="Search">'+svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',18)+'</button>'
        + '<button class="iconbtn" data-act="syncnow" aria-label="Refresh">'+svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',18)+'</button></span></div>'
        + '<h1>Archive</h1><div class="sub">'+arc.length+' filed'+(sn.length?(' · '+sn.length+' snoozed'):'')+'</div>', body:body, nav:'archive' };
  }
  function viewArchiveCat(cid){
    var c = catById(cid); var ms = archivedMsgs().filter(function(m){ return m.cat===cid; });
    var body = '<div class="list">'+(ms.length ? groupedArchiveList(ms) : '<div class="empty">Empty.</div>')
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
  // ---------- screen: rule builder (the core "make a rule" flow) ----------
  var RB_KINDS = [
    ['ai', '✨ AI — describe it in your own words', 'Describe the mail this rule should catch', 'e.g. invoices, payments and subscription bills — in any language', SPARK+'Claude reads the <b>meaning</b>, so synonyms, other languages and typos all work.'],
    ['sender', 'From a specific sender', 'Sender name or email address', 'e.g. Jane Doe  ·  billing@acme.com', 'Matches mail from exactly this sender.'],
    ['domain', 'From a whole @domain', 'Domain (without the @)', 'e.g. acme.com', 'Matches every mail from any address at this domain.'],
    ['subject', 'Subject contains a word', 'Word or phrase in the subject', 'e.g. invoice', 'Matches when the subject line contains this text.']
  ];
  var rbPrefill = null;   // {kind, value} to open the builder pre-filled (from an email)
  function viewRuleBuilder(){
    var pfKind = (rbPrefill && rbPrefill.kind) || 'ai';
    var pfVal = (rbPrefill && rbPrefill.value) || '';
    rbPrefill = null;
    var k0 = RB_KINDS.filter(function(k){ return k[0]===pfKind; })[0] || RB_KINDS[0];
    var kindOpts = RB_KINDS.map(function(k){ return '<option value="'+k[0]+'"'+(k[0]===pfKind?' selected':'')+'>'+k[1]+'</option>'; }).join('');
    var labelOpts = (state.labels||[]).map(function(l){ return '<option value="label:'+l.id+'">🏷 '+esc(l.name)+'</option>'; }).join('');
    var catOpts = (state.categories||[]).map(function(c){ return '<option value="cat:'+c.id+'">📁 '+esc(c.name)+'</option>'; }).join('');
    return {
      top: '<button class="back" data-nav="#/settings">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' Settings</button><h1>New rule</h1>'
         + '<div class="sub">Auto-tag or sort mail — the heart of MailAI</div>',
      withBack: true,
      body: '<div class="view pad rb">'
        + '<div class="rb-card"><div class="rb-num">1</div><div class="rb-body">'
        +   '<div class="rb-lbl">What should this rule match?</div>'
        +   '<select class="rb-sel" id="rb-kind" data-act="rbkind">'+kindOpts+'</select>'
        + '</div></div>'
        + '<div class="rb-card"><div class="rb-num">2</div><div class="rb-body">'
        +   '<div class="rb-lbl" id="rb-vlbl">'+k0[2]+'</div>'
        +   '<textarea class="rb-txt" id="rb-val" rows="3" placeholder="'+k0[3]+'">'+esc(pfVal)+'</textarea>'
        +   '<div class="rb-hint" id="rb-hint">'+k0[4]+'</div>'
        + '</div></div>'
        + '<div class="rb-card rb-pvcard"><div class="rb-num">👁</div><div class="rb-body">'
        +   '<div class="rb-lbl">Preview — what this catches right now</div>'
        +   '<div class="rb-preview" id="rb-preview"><span class="rb-pv-empty">Type above to see matching mail…</span></div>'
        + '</div></div>'
        + '<div class="rb-card"><div class="rb-num">3</div><div class="rb-body">'
        +   '<div class="rb-lbl">Where should matching mail go?</div>'
        +   '<select class="rb-sel" id="rb-target">'
        +     '<optgroup label="🏷 Tag with a label">'+labelOpts+'<option value="newlabel">＋ New label…</option></optgroup>'
        +     '<optgroup label="📁 Put in a category">'+catOpts+'</optgroup>'
        +   '</select>'
        +   '<div class="rb-hint">Pick an existing label/category, or make a new label — no typing mistakes.</div>'
        + '</div></div>'
        + '<div class="rb-actions"><button class="btn pri wide" data-act="rbcreate">Create rule</button>'
        +   '<button class="btn ghost wide" data-nav="#/settings">Cancel</button></div>'
        + '<div class="rb-hint" style="padding:4px 2px 12px">'+SPARK+'After creating, you can edit, flip or delete it anytime under <b>Label rules</b> or <b>Category rules</b> — the <b>N mails</b> count shows its effect.</div>'
        + '</div>',
      bare: true,
      nav: 'settings'
    };
  }
  // ---------- screen: search (with AI) ----------
  function viewSearch(){
    return {
      top: '<button class="back" data-nav="#/">'+svg('<path d="M15 18l-6-6 6-6"/>',16)+' Cockpit</button><h1>Search</h1>',
      withBack: true,
      body: '<div class="view pad">'
        + '<div class="srchbar"><input id="srchq" class="srchi" type="search" placeholder="Search sender, subject, words…" autocomplete="off" autofocus value="'+esc(lastSearchQuery)+'">'
        +   '<button class="btn pri" data-act="searchai" style="white-space:nowrap">'+SPARK+' AI</button></div>'
        + '<div class="srchhint">Type to search your mail. Tap '+SPARK+'<b>AI</b> to let Claude find it by <b>meaning</b> — e.g. “mijn vakantie boeking” or “unpaid bills”, in any language.</div>'
        + '<div id="searchresults" class="list"></div>'
        + '</div>',
      bare: true, nav: 'cockpit'
    };
  }
  var srchTimer = null, lastSearchQuery = '', srchResults = [];
  // one-time actions on the current result set (a search → act once, no saved rule)
  function searchActions(n){
    if(!n) return '';
    return '<div class="srchacts"><span class="srchacts-h">Do once with these '+n+':</span>'
      + '<button class="btn" data-act="bulklabel">🏷 Tag all</button>'
      + '<button class="btn" data-act="bulkarchive">📥 Archive all</button>'
      + '<button class="btn" data-act="bulkrule">'+SPARK+' Save as rule</button></div>';
  }
  function runSearch(){
    var qi = document.getElementById('srchq'); var box = document.getElementById('searchresults'); if(!box) return;
    if(qi) lastSearchQuery = qi.value || '';
    var q = lastSearchQuery.trim().toLowerCase();
    if(!q){ srchResults = []; box.innerHTML = '<div class="empty" style="padding:16px 0">Start typing to search your mail…</div>'; return; }
    var res = (state.messages||[]).filter(function(m){ return ((m.from||'')+' '+(m.subject||'')+' '+(m.snippet||'')+' '+(m.summary||'')+' '+(m.body||'')).toLowerCase().indexOf(q)>=0; });
    srchResults = res.map(function(m){ return m.id; });
    box.innerHTML = '<div class="srchcount">'+res.length+' result'+(res.length===1?'':'s')+'</div>'
      + searchActions(res.length)
      + (res.length ? res.map(cardHTML).join('') : '<div class="empty" style="padding:16px 0">No exact matches — tap '+SPARK+'<b>AI</b> to search by meaning.</div>');
  }
  function runSearchDebounced(){ if(srchTimer) clearTimeout(srchTimer); srchTimer = setTimeout(runSearch, 250); }
  function syncNow(){
    recomputeAll(); render();      // instant: re-apply your rules to the mail we already have
    if(!API_OK){ evaluateAiRules(); toast('Re-sorted with your rules'); return; }
    var accts = (state.accounts||[]).map(function(a){ return a.id; });
    if(!accts.length){ evaluateAiRules(); toast('Re-sorted with your rules'); return; }
    toast(SPARK+'Syncing your mail…');
    Promise.all(accts.map(function(aid){
      return fetch('/api/accounts/'+encodeURIComponent(aid)+'/sync', { method:'POST', credentials:'same-origin' })
        .then(function(r){ return r.ok ? r.json() : { processed:0 }; }).catch(function(){ return { processed:0 }; });
    })).then(function(rs){
      var total = rs.reduce(function(s,r){ return s + (r.processed||0); }, 0);
      fetch('/api/inbox', { credentials:'same-origin' }).then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){ if(d) boot(d); toast(total ? ('Synced · '+total+' new mail') : 'Up to date'); })
        .catch(function(){ toast('Sync failed — try again'); });
    });
  }
  var settingsOpen = null;   // which Settings sections are expanded (persists across re-renders)
  function viewSettings(){
    var rows = state.categories.map(function(c, i){
      var first = i===0, last = i===state.categories.length-1;
      return '<div class="catrow"><span class="reorder">'
        + '<button class="rbtn" data-act="catup" data-id="'+c.id+'"'+(first?' disabled':'')+' aria-label="move '+esc(c.name)+' up">▲</button>'
        + '<button class="rbtn" data-act="catdown" data-id="'+c.id+'"'+(last?' disabled':'')+' aria-label="move '+esc(c.name)+' down">▼</button></span>'
        + '<span class="cdot" style="background:'+c.color+'">'+svg(iconFor(c),13)+'</span>'
        + '<span><span class="cnm">'+esc(c.name)+'</span>'+(c.builtin?'':' <span class="ccount">· custom</span>')+'<br>'
        + '<span class="ccount">'+msgsIn(c.id).length+' mails'+(c.visible?'':' · hidden')+'</span></span>'
        + '<button class="etog'+(wantsMoney(c)?' on':'')+'" data-act="togglemoney" data-id="'+c.id+'" aria-label="show amount on '+esc(c.name)+'" title="Show € total on this tile">€</button>'
        + '<button class="rule-x" data-act="catrenamedef" data-id="'+c.id+'" aria-label="rename '+esc(c.name)+'">✎</button>'
        + '<button class="rule-x" data-act="catdeldef" data-id="'+c.id+'" aria-label="delete '+esc(c.name)+'">✕</button>'
        + '<button class="toggle'+(c.visible?'':' off')+'" data-act="togglecat" data-id="'+c.id+'" aria-label="toggle '+esc(c.name)+'"></button></div>';
    }).join('');
    if(!settingsOpen) settingsOpen = { rules:false, catrules:false, cats:false, labels:false, accounts:false, gmail:false, lang:false, cleanup:false, version:false };
    function sec(id, title, inner){
      return '<details class="setsec" data-sec="'+id+'"'+(settingsOpen[id]?' open':'')+'>'
        + '<summary class="setsum">'+title+'</summary><div class="setbody">'+inner+'</div></details>';
    }
    var ruleInner = '<div class="rule" style="display:block;line-height:1.7;background:color-mix(in srgb,var(--accent) 7%,var(--surface));border-color:color-mix(in srgb,var(--accent) 25%,var(--line))">'
      +   '<b>'+SPARK+'What is an AI rule?</b><br>'
      +   '<span style="color:var(--ink-2)">You write, in plain words, <b>what</b> a rule should catch — e.g. <i>“facturen en betalingen”</i>. Claude then judges <b>every mail by meaning</b>, so synonyms, other languages and typos all work (no exact keywords needed). AI rules <b>re-check your mail each time you open the app</b>. Want to act just once instead? Use '+SPARK+' Search → <b>Do once</b>.</span></div>'
      + '<div class="rule" style="color:var(--ink-2);display:block;line-height:1.7">'+SPARK+'<b>Three ways to make a rule:</b><br>'
      +   '• <b>'+SPARK+'AI rule</b> — describe in plain words what to tag, e.g. <i>“facturen en betalingen”</i>. Claude reads the meaning, so synonyms, other languages and typos all work.<br>'
      +   '• <b>Sender / @domain</b> — always tag everything from one sender or a whole domain.<br>'
      +   '• <b>✨ Suggest</b> — I look at what you’ve already labelled and propose a rule you can edit before saving.<br><br>'
      +   '<b>Change any rule:</b> tap <b>✎</b> to edit what it matches, tap the <b>label ▾</b> to move it to another label (pick from a list — no typing, so no accidental duplicates), tap <b>→ tag</b> to flip it, <b>✕</b> to delete. The <b>· N mails</b> count shows how many mails each rule hits right now.</div>'
      + '<button class="btn pri wide" data-nav="#/newrule">＋ New rule</button>'
      + ((state.labelRules&&state.labelRules.length) ? state.labelRules.map(ruleRowHTML).join('') : '<div class="rule" style="color:var(--ink-3)">No rules yet — tap <b>＋ New rule</b>, or fix a label on any email and I’ll offer to make one.</div>')
      + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="suggestrule">✨ Suggest a rule from my mail</button>';
    var catRuleInner = '<div class="rule" style="color:var(--ink-2);display:block;line-height:1.7">'+SPARK+'Send mail to a category by rule. Two ways:<br>'
      +   '• <b>'+SPARK+'AI category rule</b> — describe in plain words what belongs in a category (e.g. <i>“rekeningen en betaalverzoeken”</i>); Claude reads the meaning (synonyms/languages/typos).<br>'
      +   '• <b>From a correction</b> — use “Category · tap to fix” on an email and approve the rule.<br>'
      +   'Tap <b>✎</b> to edit, <b>✕</b> to remove. The <b>· N mails</b> count shows the effect.</div>'
      + ((state.catRules&&state.catRules.length) ? state.catRules.map(function(r,i){ var c=catById(r.catId); var cn=(state.messages||[]).filter(function(m){ return catRuleMatches(r,m); }).length; return '<div class="rule rule-row'+(r.off?' isoff':'')+'"><span><button class="ruletog'+(r.off?' off':'')+'" data-act="catruletoggleoff" data-i="'+i+'" aria-label="'+(r.off?'enable':'disable')+' rule">'+(r.off?'Off':'On')+'</button> '+(r.scope==='ai'?'<span class="rbadge">'+SPARK+'AI</span> ':'')+rulePrefix(r)+'<b>'+esc(ruleWho(r))+'</b> → <b style="color:'+(c?c.color:'#888')+'">'+(c?esc(c.name):esc(r.catId))+'</b> <span class="ccount">· '+cn+' mail'+(cn===1?'':'s')+'</span></span><button class="rule-x" data-act="editcatrule" data-i="'+i+'" aria-label="edit rule">✎</button><button class="rule-x" data-act="delcatrule" data-i="'+i+'" aria-label="remove rule">✕</button></div>'; }).join('') : '<div class="rule" style="color:var(--ink-3)">No category rules yet.</div>')
      + '<button class="btn pri wide" data-nav="#/newrule">＋ New rule</button>'
      + '<div class="ai-note" style="padding:8px 2px">'+SPARK+'Tap <b>＋ New rule</b> and choose a <b>category</b> under “Put in a category”. I also learn from every correction automatically.</div>';
    var catsInner = '<div class="rule" style="color:var(--ink-2)">Reorder with ▲▼, show/hide with the toggle, ✎ rename, ✕ delete. This order drives the cockpit tiles and the Archive.</div>'
      + rows + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="addcat">+ Add a category</button>';
    var labelsInner = (state.labels||[]).map(function(l){ return '<div class="catrow"><span class="grip">#</span>'
        + '<button class="cdot" data-act="lblrecolor" data-id="'+l.id+'" style="background:'+l.color+';border:0;cursor:pointer" aria-label="recolor '+esc(l.name)+'"></button>'
        + '<span><span class="cnm">'+esc(l.name)+'</span><br><span class="ccount">'+labelCount(l.id)+' active'+(labelFiled(l.id).length?(' · '+labelFiled(l.id).length+' filed'):'')+'</span></span>'
        + '<button class="rule-x" data-act="lblrenamedef" data-id="'+l.id+'" aria-label="rename '+esc(l.name)+'">✎</button>'
        + '<button class="rule-x" data-act="lbldeldef" data-id="'+l.id+'" aria-label="delete '+esc(l.name)+'">✕</button></div>'; }).join('')
      + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="newlabeldef">+ Add a label</button>';
    var acctInner = acctRows() + '<button class="btn wide" style="border-style:dashed;color:var(--accent-ink)" data-act="addacct">+ Add a mail account</button>';
    var gmailInner = '<div class="catrow"><span class="grip"></span><span class="cdot" style="background:#EA4335">'+svg('<path d="M3 6l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/>',13)+'</span>'
      +   '<span><span class="cnm">Mirror categories &amp; labels to Gmail</span><br>'
      +   '<span class="ccount">Adds them as Gmail labels under <b>MailAI/</b></span></span>'
      +   '<button class="toggle'+(state.mirrorGmail?'':' off')+'" data-act="togglemirror" aria-label="toggle Gmail sync"></button></div>'
      + '<div class="rule" style="color:var(--ink-2)">'+SPARK+'Your <b>category</b> becomes the main label (e.g. <b>MailAI/Urgent</b>); each <b>label</b> is added too. Everything nests under one <b>MailAI/</b> parent. Off by default — nothing is written to Gmail until you turn this on.</div>';
    var langInner = '<div class="langrow">'
      +   '<button class="langseg'+(state.lang!=='nl'?' on':'')+'" data-act="setlang" data-v="en">🇬🇧 English</button>'
      +   '<button class="langseg'+(state.lang==='nl'?' on':'')+'" data-act="setlang" data-v="nl">🇳🇱 Nederlands</button></div>'
      + '<div class="rule" style="color:var(--ink-2)">'+SPARK+'Switches the whole app between English and Dutch. Your emails stay in their own language.</div>';
    var cleanupInner = '<div class="rule" style="color:var(--ink-2)">New mail lands in the cockpit. <b>File everything</b> to start clean — archived mail stays under its labels and in the Archive, movable back anytime.</div>'
      + '<button class="btn wide danger" data-act="emptycockpit" style="border-style:dashed">File everything to Archive (empty cockpit)</button>'
      + ((API_OK || (state.accounts&&state.accounts.length)) ? '<button class="btn wide" data-act="backfill" style="border-style:dashed;color:var(--accent-ink)">⤵ Import older mail to Archive (from a date)…</button>' : '');
    var versionInner = '<div class="rule" style="color:var(--ink-2)">You’re on <b>v'+BUILD+'</b>. If a change isn’t showing, tap refresh — it clears the cache and reloads the newest version.</div>'
      + '<button class="btn wide" data-act="apprefresh" style="border-style:dashed;color:var(--accent-ink)">↻ Refresh to newest version</button>'
      + CHANGELOG.map(function(c){ return '<div class="rule" style="display:block"><b>v'+esc(c.v)+'</b><ul style="margin:6px 0 0 16px;padding:0;color:var(--ink-2);font-size:12px">'+c.notes.map(function(n){ return '<li>'+esc(n)+'</li>'; }).join('')+'</ul></div>'; }).join('');
    return {
      top: '<h1>Settings</h1>',
      withBack: false,
      body: '<div class="view pad" style="padding-top:6px">'
        + sec('rules', SPARK+' Label rules', ruleInner)
        + sec('catrules', 'Category rules', catRuleInner)
        + sec('cats', 'Cockpit categories', catsInner)
        + sec('labels', 'Labels', labelsInner)
        + sec('accounts', 'Mail accounts · kept separate', acctInner)
        + sec('gmail', 'Show in Gmail', gmailInner)
        + sec('lang', 'Language', langInner)
        + sec('cleanup', 'Clean up cockpit', cleanupInner)
        + sec('version', 'Version &amp; updates', versionInner)
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

  var _lastHash = null;
  var _stripX = {};   // horizontal scroll of the tab/label strips, kept across re-renders
  var STRIPS = ['.tabs', '.lblrow', '.acctbar', '.calchips'];
  function render(){
    var h = location.hash || '#/';
    // remember scroll so an in-place re-render (toggle, reorder, rename) keeps
    // your position instead of jumping to the top; only reset on real navigation.
    var prevView = root.querySelector('.view');
    var keepScroll = (h === _lastHash) && prevView ? prevView.scrollTop : 0;
    // remember how far the category-tab / label strips are scrolled sideways, so
    // clicking through them doesn't snap back to the first item on every rebuild.
    STRIPS.forEach(function(sel){ var e = root.querySelector(sel); if(e) _stripX[sel] = e.scrollLeft; });
    // opening a mail marks it read — but only on the actual open (hash change), so a
    // deliberate "mark as unread" in the detail still sticks on later re-renders.
    if(h.indexOf('#/m/')===0 && h!==_lastHash){
      var om = msgById(h.slice(4));
      if(om && om.isUnread){ om.isUnread = false; apiPost('/api/messages/'+om.id+'/read', { unread: false }); }
    }
    var v;
    if(h.indexOf('#/c/')===0) v = viewCategory(h.slice(4));
    else if(h.indexOf('#/focus/')===0) v = viewFocus(h.slice(8));
    else if(h.indexOf('#/label/')===0) v = viewLabel(h.slice(8));
    else if(h.indexOf('#/m/')===0) v = viewDetail(h.slice(4));
    else if(h==='#/newrule') v = viewRuleBuilder();
    else if(h==='#/search') v = viewSearch();
    else if(h==='#/settings') v = viewSettings();
    else if(h.indexOf('#/archive')===0) v = viewArchive(h==='#/archive' ? '' : h.slice(10));
    else if(h==='#/tasks') v = viewTasks();
    else v = viewCockpit();
    if(!v) return; // a redirect happened
    var html = '<div class="topbar'+(v.withBack?' with-back':'')+'">'+v.top+'</div>'
      + (v.tabs||'')
      + (v.bare ? v.body : '<div class="view">'+v.body+'</div>')
      + detailBar() + proposalBar() + catProposalBar() + unsubBar() + snoozeBar() + followupBar() + meetingBar() + mergeBar() + rulePickBar() + catPickBar()
      + tabbar(v.nav);
    root.innerHTML = html;
    localize(root);   // switch UI chrome to Dutch when selected
    // remember which Settings sections the user expands, so a re-render keeps them
    if(settingsOpen){ Array.prototype.forEach.call(root.querySelectorAll('.setsec'), function(d){
      d.addEventListener('toggle', function(){ settingsOpen[d.getAttribute('data-sec')] = d.open; });
    }); }
    // keep position on in-place re-renders, top on navigation
    var view = root.querySelector('.view'); if(view) view.scrollTop = keepScroll;
    // restore the sideways scroll of the tab/label strips
    STRIPS.forEach(function(sel){ if(sel in _stripX){ var e = root.querySelector(sel); if(e) e.scrollLeft = _stripX[sel]; } });
    if(document.getElementById('rb-preview')) rbUpdatePreview();   // seed the rule preview
    if(document.getElementById('searchresults')) runSearch();      // seed search state
    if(state){ saveTasks(); saveMeetings(); }   // persist tasks & agenda across reloads
    _lastHash = h;
  }

  // ---------- toast ----------
  var toastEl;
  function toast(msg, undoFn){
    if(!toastEl){ toastEl = document.createElement('div'); toastEl.className='toast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML = '';
    var span = document.createElement('span'); span.textContent = t(msg); toastEl.appendChild(span);
    clearTimeout(toast._t);
    if(undoFn){
      var btn = document.createElement('button'); btn.className = 'toast-undo'; btn.type = 'button'; btn.textContent = t('Undo');
      btn.onclick = function(){ clearTimeout(toast._t); toastEl.classList.remove('show'); undoFn(); };
      toastEl.appendChild(btn);
      toastEl.classList.add('show');
      toast._t = setTimeout(function(){ toastEl.classList.remove('show'); }, 6000);   // longer, so Undo is reachable
    } else {
      toastEl.classList.add('show');
      toast._t = setTimeout(function(){ toastEl.classList.remove('show'); }, 1800);
    }
  }

  // ---------- actions ----------
  function archive(id, word, undoable){ var m=msgById(id); if(!m) return; m.archived=true; m.snoozed=false; apiPost('/api/messages/'+id+'/archive');
    var msg=(word||'Archived')+' · '+m.from;
    if(undoable) toast(msg, function(){ m.archived=false; render(); }); else toast(msg); }
  function snoozeMsg(id, label, key){ var m=msgById(id); if(m){ m.snoozed=true; m.snoozeUntil=label||''; m.snoozeBucket=SNOOZE_ORDER[key]||9; apiPost('/api/messages/'+id+'/snooze', { until:m.snoozeUntil, bucket:m.snoozeBucket }); toast('Snoozed'+(label?' · '+label:'')+' · '+m.from, function(){ m.snoozed=false; m.snoozeUntil=''; m.snoozeBucket=0; apiPost('/api/messages/'+id+'/restore'); render(); }); } }
  function removeMsg(id){ var idx=-1, m=null; for(var i=0;i<state.messages.length;i++){ if(state.messages[i].id===id){ idx=i; m=state.messages[i]; state.messages.splice(i,1); break; } }
    if(m){ apiPost('/api/messages/'+id+'/delete'); toast('Deleted · '+m.from, function(){ state.messages.splice(idx,0,m); render(); }); } }
  function restoreMsg(id){ var m=msgById(id); if(m){ m.archived=false; m.snoozed=false; apiPost('/api/messages/'+id+'/restore'); toast('Moved to cockpit · '+m.from); } }
  function archiveGroup(gid){ var hit=[]; state.messages.forEach(function(m){ if(m.group===gid && isActive(m) && inSel(m)){ m.archived=true; apiPost('/api/messages/'+m.id+'/archive'); hit.push(m); } });
    toast('Filed '+hit.length+' update'+(hit.length===1?'':'s'), function(){ hit.forEach(function(m){ m.archived=false; apiPost('/api/messages/'+m.id+'/restore'); }); render(); }); }
  function emptyCockpit(){ var hit=[]; state.messages.forEach(function(m){ if(isActive(m) && inSel(m)){ m.archived=true; apiPost('/api/messages/'+m.id+'/archive'); hit.push(m); } });
    toast('Filed '+hit.length+' mail to Archive · cockpit clear', function(){ hit.forEach(function(m){ m.archived=false; apiPost('/api/messages/'+m.id+'/restore'); }); render(); }); }
  function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24) || ('cat'+Date.now()); }

  function handleAct(act, el){
    var id = el.getAttribute('data-id');
    switch(act){
      case 'archive': archive(id, null, true); back(); break;
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
      case 'meetingdel': { var marr=state.meetings||[]; var mix=marr.map(function(x){return x.id;}).indexOf(id); if(mix>=0){ var mrm=marr[mix]; marr.splice(mix,1); toast('Removed', function(){ marr.splice(mix,0,mrm); render(); }); } render(); break; }
      case 'togglecal': { var cc=calById(id); if(cc){ cc.on=!cc.on; saveCalPrefs(); toast(cc.on?('Showing '+cc.name):('Hidden '+cc.name)); } render(); break; }
      case 'addcal': { var nm=window.prompt('Add a calendar to view (name):',''); if(nm&&nm.trim()){ var pal=['#D6336C','#0891B2','#059669','#B45309','#7C3AED']; state.calendars.push({ id:'cal'+Date.now(), name:nm.trim(), color:pal[state.calendars.length%pal.length], on:true }); saveCalPrefs(); toast('Calendar added'); } render(); break; }
      case 'wallet': toast('Added to Apple Wallet (demo)'); break;
      case 'replyjump': { var rp=document.getElementById('replypanel-'+id); if(rp){ rp.scrollIntoView({behavior:'smooth', block:'center'}); rp.classList.add('flash'); setTimeout(function(){ rp.classList.remove('flash'); }, 900); } break; }
      case 'readamount': {
        var am=msgById(id); if(!am) break;
        el.disabled = true; toast(SPARK+'Reading the amount…');
        _amtChecked[id] = 1;
        fetch('/api/messages/'+encodeURIComponent(id)+'/amount', { method:'POST', credentials:'same-origin' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){ var v = d && d.amount || 0; am.money = v; if(d && d.direction) am.moneyDir = d.direction; toast(v>0 ? ('Found € '+v.toFixed(2).replace('.',',')) : 'No amount found in this mail'); render(); })
          .catch(function(){ toast('Could not read the amount — try again'); render(); });
        break;
      }
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
      case 'togglecat': { var cat=catById(id); if(cat){ cat.visible=!cat.visible; apiPost('/api/categories/'+id+'/visibility',{visible:cat.visible}); saveCats(); } render(); break; }
      case 'togglemoney': { var mcat=catById(id); if(mcat){ mcat.showMoney = !wantsMoney(mcat); saveCats(); toast(mcat.showMoney?'Showing € total on '+mcat.name:'Hidden € total on '+mcat.name); if(mcat.showMoney) fetchAmounts(); } render(); break; }
      case 'catup': moveCat(id, -1); break;
      case 'catdown': moveCat(id, 1); break;
      case 'togglemirror': { state.mirrorGmail=!state.mirrorGmail; saveMirror(); apiPost('/api/settings/mirror',{enabled:state.mirrorGmail}); toast(state.mirrorGmail?'Gmail sync on · these show as labels in Gmail':'Gmail sync off'); render(); break; }
      case 'setlang': { var lv=el.getAttribute('data-v')==='nl'?'nl':'en'; state.lang=lv; saveLang(); apiPost('/api/settings/lang',{lang:lv}); render(); break; }
      case 'addcat': {
        var name = window.prompt('New category name (e.g. Finance & bills):');
        if(name && name.trim()){
          var color = CUSTOM_COLORS[state.categories.filter(function(c){return !c.builtin;}).length % CUSTOM_COLORS.length];
          state.categories.push({ id: slug(name)+'-'+(Date.now()%1000), name: name.trim(), color: color, icon: GENERIC_ICON, hint: 'mails', visible: true, builtin: false });
          saveCats();
          toast('Added “'+name.trim()+'” · it stays after refresh');
        }
        render(); break;
      }
      case 'showhtml': {
        var box = document.getElementById('mailbody-'+id);
        if(!box) break;
        el.disabled = true; el.textContent = 'Loading…';
        fetch('/api/messages/'+encodeURIComponent(id)+'/html', { credentials:'same-origin' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            if(!d || !d.html){ el.textContent = 'Could not load images'; return; }
            // render in a fully sandboxed iframe: images load, but no scripts,
            // forms, popups or same-origin access — safe for untrusted mail HTML.
            var f = document.createElement('iframe');
            f.className = 'mailframe';
            f.setAttribute('sandbox', '');
            f.setAttribute('referrerpolicy', 'no-referrer');
            f.srcdoc = d.html;
            box.innerHTML = '';
            box.appendChild(f);
            // grow the frame to its content height once loaded
            f.addEventListener('load', function(){
              try { f.style.height = Math.min(f.contentWindow.document.body.scrollHeight + 24, 4000) + 'px'; } catch(e){ f.style.height = '600px'; }
            });
            if(el.parentNode) el.parentNode.removeChild(el);
          })
          .catch(function(){ el.disabled = false; el.textContent = 'Retry — show images'; });
        break;
      }
      case 'merge': { pendingMerge = id; toast('Kies de bezorging om mee samen te voegen'); render(); break; }
      case 'mergecancel': { pendingMerge = null; render(); break; }
      case 'mergepick': { var msrc = pendingMerge; pendingMerge = null; if(msrc && id){ mergeMessages(msrc, id); } render(); break; }
      case 'unmerge': { unmergeMessage(id); render(); break; }
      case 'fixlabel': { fixLabel(id, el.getAttribute('data-label')); render(); break; }
      case 'scope': { if(pendingProposal){ var sv=el.getAttribute('data-v'); if(sv==='subject'){ var kw=window.prompt('Apply to mail whose subject contains:', pendingProposal.subjectWord||guessKeyword(pendingProposal.subject)); if(kw&&kw.trim()){ pendingProposal.scope='subject'; pendingProposal.subjectWord=kw.trim(); } } else pendingProposal.scope=sv; } render(); break; }
      case 'applyrule': {
        if(pendingProposal){ var p=pendingProposal;
          var val = p.scope==='domain'?p.domain : p.scope==='subject'?p.subjectWord : p.sender;
          var rule = { scope:p.scope, value:val, labelId:p.labelId, action:p.action };
          learnRule(rule); recomputeLabels();
          var n = state.messages.filter(function(m){ return ruleMatches(rule, m); }).length;
          apiPost('/api/messages/'+p.msgId+'/labels', { label_id: p.labelId }); // learns server-side when live
          toast('Rule saved · applied to '+n+' mail'+(n===1?'':'s')+(p.scope==='domain'?(' @'+p.domain):(' from '+p.sender)),
            function(){ state.labelRules=(state.labelRules||[]).filter(function(r){ return !(r.scope===rule.scope && r.value===rule.value && r.labelId===rule.labelId); }); saveLearned(); recomputeLabels(); render(); });
          pendingProposal = null;
        }
        render(); break;
      }
      case 'dismissrule': { pendingProposal = null; toast('Kept it to just this email'); render(); break; }
      case 'delrule': { var ri=parseInt(el.getAttribute('data-i'),10); if(state.labelRules){ var rrm=state.labelRules.splice(ri,1)[0]; saveLearned(); recomputeLabels(); toast('Rule removed', function(){ state.labelRules.splice(ri,0,rrm); saveLearned(); recomputeLabels(); render(); }); } render(); break; }
      case 'editrule': {
        var ei=parseInt(el.getAttribute('data-i'),10); var er=(state.labelRules||[])[ei]; if(!er) break;
        var promptxt = er.scope==='ai' ? 'Describe the mail this rule should tag (plain language):'
          : er.scope==='domain' ? 'Tag mail from domain (without the @):'
          : er.scope==='subject' ? 'Tag mail whose subject contains:' : 'Tag mail from sender:';
        var ev = window.prompt(promptxt, er.value); if(ev===null) break;
        if(ev.trim()){ er.value = ev.trim(); if(er.scope==='ai') delete er._aiIds; saveLearned(); recomputeLabels(); toast('Rule updated'); if(er.scope==='ai') evaluateAiRules(); }
        render(); break;
      }
      case 'rulerelabel': {   // tap a rule's label → pick a different one (no typing)
        pendingRule = { editIndex: parseInt(el.getAttribute('data-i'),10) }; render(); break;
      }
      case 'ruleflip': {
        var fi=parseInt(el.getAttribute('data-i'),10); var fr=(state.labelRules||[])[fi];
        if(fr){ fr.action = fr.action==='remove' ? 'add' : 'remove'; saveLearned(); recomputeLabels(); }
        render(); break;
      }
      case 'ruletoggleoff': {
        var ti=parseInt(el.getAttribute('data-i'),10); var tr=(state.labelRules||[])[ti];
        if(tr){ tr.off = !tr.off; saveLearned(); recomputeLabels(); toast(tr.off ? 'Rule paused' : 'Rule active'); }
        render(); break;
      }
      case 'catruletoggleoff': {
        var cti=parseInt(el.getAttribute('data-i'),10); var ctr=(state.catRules||[])[cti];
        if(ctr){ ctr.off = !ctr.off; saveCatRules(); recomputeCats(); toast(ctr.off ? 'Rule paused' : 'Rule active'); }
        render(); break;
      }
      case 'addairule': {
        var desc=window.prompt('Describe the mail to auto-label, in your own words\n(e.g. “invoices, payments or subscription bills”):');
        if(!desc || !desc.trim()) break;
        pendingRule = { scope:'ai', value:desc.trim(), action:'add' };   // then PICK the label
        render(); break;
      }
      case 'rulepick': {
        var pr = pendingRule; if(!pr){ render(); break; }
        var lid = el.getAttribute('data-id'); var lab;
        if(lid==='__new__'){
          var nn = window.prompt('New label name:'); if(!nn || !nn.trim()){ pendingRule=null; render(); break; }
          lab = { id:slug(nn)+'-'+(Date.now()%1000), name:nn.trim(), color:CUSTOM_COLORS[state.labels.length % CUSTOM_COLORS.length] };
          state.labels.push(lab); saveLabels();
        } else { lab = labelById(lid); }
        pendingRule = null;
        if(lab){
          if(pr.applyOnce){
            var oc=0; pr.applyOnce.forEach(function(mid){ var mm=msgById(mid); if(!mm) return;
              if(!mm.labels) mm.labels=[]; if(mm.labels.indexOf(lab.id)<0) mm.labels.push(lab.id);
              if(!state.originalLabels[mid]) state.originalLabels[mid]=[];
              if(state.originalLabels[mid].indexOf(lab.id)<0) state.originalLabels[mid].push(lab.id);
              apiPost('/api/messages/'+mid+'/labels', { label_id: lab.id }); oc++; });
            recomputeLabels(); toast('Tagged '+oc+' mail with “'+lab.name+'” · one-time');
          }
          else if(pr.editIndex!=null){ var rr=state.labelRules[pr.editIndex]; if(rr){ rr.labelId=lab.id; saveLearned(); recomputeLabels(); toast('Label changed to “'+lab.name+'”'); } }
          else { learnRule({ scope:pr.scope, value:pr.value, labelId:lab.id, action:pr.action }); recomputeLabels();
            var an=(state.messages||[]).filter(function(m){ return ruleMatches({scope:pr.scope,value:pr.value}, m); }).length;
            toast(pr.scope==='ai' ? 'AI rule added · checking your mail…' : ('Rule added · '+an+' mail'+(an===1?'':'s')+' tagged'));
            if(pr.scope==='ai') evaluateAiRules(); }
        }
        render(); break;
      }
      case 'rulepickcancel': { pendingRule = null; render(); break; }
      case 'rbcreate': {
        var kEl=document.getElementById('rb-kind'), vEl=document.getElementById('rb-val'), tEl=document.getElementById('rb-target');
        if(!kEl||!vEl||!tEl){ break; }
        var rbkind=kEl.value, rbval=(vEl.value||'').trim(), rbtarget=tEl.value;
        if(!rbval){ toast('Fill in step 2 — what the rule should match'); break; }
        if(rbkind==='domain' && rbval.charAt(0)==='@') rbval=rbval.slice(1);
        if(rbtarget.indexOf('cat:')===0){
          learnCatRule({ scope:rbkind, value:rbval, catId:rbtarget.slice(4) }); recomputeCats();
        } else {
          var rblabel;
          if(rbtarget==='newlabel'){ var rbnn=window.prompt('Name for the new label:'); if(!rbnn||!rbnn.trim()){ break; }
            var rblab={ id:slug(rbnn)+'-'+(Date.now()%1000), name:rbnn.trim(), color:CUSTOM_COLORS[state.labels.length % CUSTOM_COLORS.length] };
            state.labels.push(rblab); saveLabels(); rblabel=rblab.id; }
          else { rblabel=rbtarget.slice(6); }   // 'label:'
          learnRule({ scope:rbkind, value:rbval, labelId:rblabel, action:'add' }); recomputeLabels();
        }
        if(rbkind==='ai') evaluateAiRules();
        toast('Rule created'+(rbkind==='ai'?' · checking your mail…':''));
        location.hash = '#/settings'; break;
      }
      case 'suggestrule': {
        // mine your own labelled mail for the strongest sender-domain → label pattern
        var best=null;
        (state.labels||[]).forEach(function(l){
          var counts={};
          (state.messages||[]).forEach(function(m){ if((m.labels||[]).indexOf(l.id)>=0 && m.domain){ counts[m.domain]=(counts[m.domain]||0)+1; } });
          Object.keys(counts).forEach(function(dom){
            var exists=(state.labelRules||[]).some(function(r){ return r.scope==='domain' && r.value===dom && r.labelId===l.id; });
            if(!exists && counts[dom]>=2 && (!best || counts[dom]>best.n)){ best={ dom:dom, labelId:l.id, name:l.name, n:counts[dom] }; }
          });
        });
        if(!best){ toast('No clear pattern yet — tag a few more mails and I’ll spot one'); break; }
        var sv=window.prompt('Suggested: tag mail from @'+best.dom+' as “'+best.name+'” ('+best.n+' mails match).\nEdit the domain, or OK to add:', best.dom);
        if(sv===null) break;
        learnRule({ scope:'domain', value:sv.trim(), labelId:best.labelId, action:'add' });
        recomputeLabels(); toast('Rule added from suggestion'); render(); break;
      }
      // category correction
      case 'fixcat': { setCat(id, el.getAttribute('data-cat')); render(); break; }
      case 'catscope': { if(pendingCatProposal){ var cv2=el.getAttribute('data-v'); if(cv2==='subject'){ var ck=window.prompt('Apply to mail whose subject contains:', pendingCatProposal.subjectWord||guessKeyword(pendingCatProposal.subject)); if(ck&&ck.trim()){ pendingCatProposal.scope='subject'; pendingCatProposal.subjectWord=ck.trim(); } } else pendingCatProposal.scope=cv2; } render(); break; }
      case 'applycatrule': {
        if(pendingCatProposal){ var cp=pendingCatProposal;
          var cval = cp.scope==='domain'?cp.domain : cp.scope==='subject'?cp.subjectWord : cp.sender;
          var crule = { scope:cp.scope, value:cval, catId:cp.catId };
          learnCatRule(crule); recomputeCats();
          var cn = state.messages.filter(function(m){ return catRuleMatches(crule, m); }).length;
          toast('Rule saved · '+cn+' mail'+(cn===1?'':'s')+' → '+cp.catName,
            function(){ state.catRules=(state.catRules||[]).filter(function(r){ return !(r.scope===crule.scope && r.value===crule.value); }); saveCatRules(); recomputeCats(); render(); });
          pendingCatProposal = null;
        }
        render(); break;
      }
      case 'dismisscatrule': { pendingCatProposal = null; toast('Kept it to just this email'); render(); break; }
      case 'delcatrule': { var ci=parseInt(el.getAttribute('data-i'),10); if(state.catRules){ var crm=state.catRules.splice(ci,1)[0]; saveCatRules(); recomputeCats(); toast('Rule removed', function(){ state.catRules.splice(ci,0,crm); saveCatRules(); recomputeCats(); render(); }); } render(); break; }
      case 'addaicatrule': {
        var cdesc = window.prompt('Describe the mail for a category, in your own words\n(e.g. “rekeningen en betaalverzoeken”). Claude reads the meaning.');
        if(!cdesc || !cdesc.trim()) break;
        pendingCatRule = { value:cdesc.trim() };   // then PICK the category
        render(); break;
      }
      case 'catrulepick': {
        var pcr = pendingCatRule; pendingCatRule = null; if(!pcr){ render(); break; }
        var ccid = el.getAttribute('data-id'); if(catById(ccid)){
          learnCatRule({ scope:'ai', value:pcr.value, catId:ccid });
          recomputeCats(); toast('AI category rule added · checking your mail…'); evaluateAiRules();
        }
        render(); break;
      }
      case 'catrulepickcancel': { pendingCatRule = null; render(); break; }
      case 'editcatrule': {
        var cei=parseInt(el.getAttribute('data-i'),10); var cer=(state.catRules||[])[cei]; if(!cer) break;
        var cpt = cer.scope==='ai' ? 'Describe the mail for this category (plain language):'
          : cer.scope==='domain' ? 'Match mail from domain (without the @):'
          : cer.scope==='subject' ? 'Match mail whose subject contains:' : 'Match mail from sender:';
        var cev = window.prompt(cpt, cer.value); if(cev===null) break;
        if(cev.trim()){ cer.value = cev.trim(); if(cer.scope==='ai') delete cer._aiIds; }
        var names = (state.categories||[]).map(function(c){ return c.name; }).join(', ');
        var cel = window.prompt('Put matching mail in which category (leave as-is to keep)?\nChoose one of: '+names, (catById(cer.catId)||{}).name || '');
        if(cel && cel.trim()){
          var tc = (state.categories||[]).filter(function(c){ return c.name.toLowerCase()===cel.trim().toLowerCase(); })[0];
          if(tc){ cer.catId = tc.id; }
          else { toast('No category named “'+cel.trim()+'” — kept '+(catById(cer.catId)||{}).name+'. (Categories can’t be typo-created.)'); saveCatRules(); recomputeCats(); render(); break; }
        }
        saveCatRules(); recomputeCats(); toast('Rule updated'); if(cer.scope==='ai') evaluateAiRules(); render(); break;
      }
      // newsletter unsubscribe (confirm)
      case 'unsubconfirm': { var us=pendingUnsub; pendingUnsub=null; if(us){ archive(us,'Unsubscribed'); } if(location.hash==='#/m/'+us){ back(); } else render(); break; }
      case 'unsubcancel': { pendingUnsub = null; render(); break; }
      case 'newlabel': {
        var lnm = window.prompt('New label (e.g. Project X, Customer Acme, tax-2026):');
        if(lnm && lnm.trim()){
          var lid = slug(lnm)+'-'+(Date.now()%1000);
          state.labels.push({ id:lid, name:lnm.trim(), color:CUSTOM_COLORS[state.labels.length % CUSTOM_COLORS.length] });
          saveLabels(); fixLabel(id, lid);
        }
        render(); break;
      }
      case 'newlabeldef': {
        var dnm = window.prompt('New label name:');
        if(dnm && dnm.trim()){ state.labels.push({ id:slug(dnm)+'-'+(Date.now()%1000), name:dnm.trim(), color:CUSTOM_COLORS[state.labels.length % CUSTOM_COLORS.length] }); saveLabels(); toast('Label “'+dnm.trim()+'” created'); }
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
      case 'rulefrommail': { var rfm=msgById(id); if(rfm){ rbPrefill = { kind: rfm.domain?'domain':'sender', value: rfm.domain||rfm.from }; location.hash='#/newrule'; } break; }
      case 'syncnow': syncNow(); break;
      case 'toggleread': { var trm=msgById(id); if(trm){ trm.isUnread=!trm.isUnread; apiPost('/api/messages/'+id+'/read', { unread: trm.isUnread }); toast(trm.isUnread?'Marked unread':'Marked read'); } render(); break; }
      case 'bulklabel': { if(!srchResults.length){ toast('No results to tag'); break; } pendingRule = { applyOnce: srchResults.slice() }; render(); break; }
      case 'bulkarchive': {
        if(!srchResults.length){ toast('No results to archive'); break; }
        var ids2 = srchResults.slice();
        if(!window.confirm('Archive all '+ids2.length+' found mails?')) break;
        ids2.forEach(function(mid){ var mm=msgById(mid); if(mm && !mm.archived){ mm.archived=true; apiPost('/api/messages/'+mid+'/archive'); } });
        toast('Archived '+ids2.length+' mail', function(){ ids2.forEach(function(mid){ var mm=msgById(mid); if(mm){ mm.archived=false; apiPost('/api/messages/'+mid+'/restore'); } }); runSearch(); });
        runSearch(); break;
      }
      case 'bulkrule': {
        if(!lastSearchQuery.trim()){ toast('Type a search first'); break; }
        rbPrefill = { kind:'ai', value:lastSearchQuery.trim() }; location.hash='#/newrule'; break;
      }
      case 'searchai': {
        var sq=((document.getElementById('srchq')||{}).value||'').trim(); var sbox=document.getElementById('searchresults');
        if(!sq || !sbox) break;
        if(!API_OK){ toast('AI search needs the live app'); runSearch(); break; }
        sbox.innerHTML = '<div class="empty" style="padding:16px 0">'+SPARK+'Claude is reading your mail…</div>';
        var sitems=(state.messages||[]).map(function(m){ return { id:m.id, text:((m.subject||'')+' — '+(m.snippet||'')).slice(0,200) }; });
        fetch('/api/labels/ai-match', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ description:sq, items:sitems }) })
          .then(function(x){ return x.ok ? x.json() : null; })
          .then(function(d){ var ids=(d&&d.ids)||[]; var res=(state.messages||[]).filter(function(m){ return ids.indexOf(m.id)>=0; });
            srchResults = res.map(function(m){ return m.id; });
            var cur=document.getElementById('searchresults'); if(cur) cur.innerHTML = '<div class="srchcount">'+SPARK+'AI found '+res.length+' by meaning</div>'+searchActions(res.length)+(res.length?res.map(cardHTML).join(''):'<div class="empty" style="padding:16px 0">Nothing matched by meaning.</div>'); })
          .catch(function(){ toast('AI search failed'); runSearch(); });
        break;
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
      case 'backfill': {
        var since = window.prompt('Import received mail since (YYYY-MM-DD) — filed to Archive for testing:', '2026-06-01');
        if(!since || !since.trim()) break;
        var cnt = parseInt(window.prompt('How many at most? (fewer = faster)', '50'), 10) || 50;
        toast('Importing since '+since.trim()+'… this can take a minute');
        var accts = (state.accounts||[]).map(function(a){ return a.id; });
        Promise.all(accts.map(function(aid){
          return fetch('/api/accounts/'+encodeURIComponent(aid)+'/backfill', { method:'POST', credentials:'same-origin',
            headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ since: since.trim(), max_results: cnt }) })
            .then(function(r){ return r.ok ? r.json() : { processed:0 }; }).catch(function(){ return { processed:0 }; });
        })).then(function(rs){
          var total = rs.reduce(function(s,r){ return s + (r.processed||0); }, 0);
          toast('Imported '+total+' mail to Archive');
          load();
        });
        break;
      }
      // account management
      case 'acctcolor': { var ac=acctById(id); if(ac){ var ci2=ACCT_COLORS.indexOf(ac.color); ac.color=ACCT_COLORS[(ci2+1)%ACCT_COLORS.length]; } render(); break; }
      case 'acctrename': { var ar=acctById(id); if(ar){ var an=window.prompt('Rename account:', ar.name); if(an&&an.trim()) ar.name=an.trim(); } render(); break; }
      case 'acctremove': {
        var arm=acctById(id);
        if(arm && window.confirm('Remove “'+arm.name+'”? Its mail will be deleted from the app.')){
          var goneMsgs = state.messages.filter(function(m){ return m.account===id; });
          var acctIdx = state.accounts.map(function(x){return x.id;}).indexOf(id);
          var prevSel = sel;
          state.messages = state.messages.filter(function(m){ return m.account!==id; });
          state.accounts = state.accounts.filter(function(x){ return x.id!==id; });
          if(sel===id) sel='all';
          toast('Removed '+arm.name, function(){ state.accounts.splice(acctIdx,0,arm); goneMsgs.forEach(function(m){ if(!msgById(m.id)) state.messages.push(m); }); sel=prevSel; render(); });
        }
        render(); break;
      }
      // task editing
      case 'taskedit': { var te=taskById(id); if(te){ var tn=window.prompt('Edit task:', te.text); if(tn&&tn.trim()) te.text=tn.trim(); } render(); break; }
      case 'taskdue': { var td=taskById(id); if(td){ var dd=window.prompt('Due (e.g. Today 17:00, Fri, next week) — blank to clear:', td.due||''); td.due=(dd||'').trim(); } render(); break; }
      case 'taskdel': { var tarr=state.tasks||[]; var tix=tarr.map(function(x){return x.id;}).indexOf(id); if(tix>=0){ var trm=tarr[tix]; tarr.splice(tix,1); toast('Task deleted', function(){ tarr.splice(tix,0,trm); render(); }); } render(); break; }
      case 'tasknew': { var tx=window.prompt('New task:'); if(tx&&tx.trim()){ state.tasks.push({ id:'t'+Date.now(), text:tx.trim(), due:'', done:false, msgId:null }); } render(); break; }
      // timed-snooze demo clock: advance and wake anything due
      case 'advancetime': {
        state.demoNow = (state.demoNow||0) + 1;
        var woke=0; state.messages.forEach(function(m){ if(m.snoozed && (m.snoozeBucket||9) <= state.demoNow){ m.snoozed=false; m.snoozeBucket=0; m.snoozeUntil=''; woke++; } });
        toast(woke ? ('Time moved on · woke '+woke+' back to the cockpit') : 'Clock advanced · nothing due yet');
        render(); break;
      }
      case 'unsnooze': { var um=msgById(id); if(um){ um.snoozed=false; um.snoozeUntil=''; apiPost('/api/messages/'+id+'/restore'); toast('Woke · '+um.from); } render(); break; }
      case 'emptyarchive': {
        var gone = state.messages.filter(function(m){ return m.archived && !m.snoozed; });
        if(gone.length && window.confirm('Delete all '+gone.length+' filed mail? (You can Undo right after.)')){
          gone.forEach(function(m){ apiPost('/api/messages/'+m.id+'/delete'); });
          state.messages = state.messages.filter(function(m){ return !(m.archived && !m.snoozed); });
          toast('Archive emptied · '+gone.length, function(){ gone.forEach(function(m){ if(!msgById(m.id)){ state.messages.push(m); apiPost('/api/messages/'+m.id+'/restore'); } }); render(); });
        }
        render(); break;
      }
      case 'delcat': {
        var dc = el.getAttribute('data-cat'); var cat2 = catById(dc);
        var goneC = state.messages.filter(function(m){ return m.archived && !m.snoozed && m.cat===dc; });
        if(goneC.length && window.confirm('Delete all '+goneC.length+' filed '+(cat2?cat2.name:dc)+' mail?')){
          goneC.forEach(function(m){ apiPost('/api/messages/'+m.id+'/delete'); });
          state.messages = state.messages.filter(function(m){ return !(m.archived && !m.snoozed && m.cat===dc); });
          toast('Deleted '+goneC.length+' · '+(cat2?cat2.name:dc), function(){ goneC.forEach(function(m){ if(!msgById(m.id)){ state.messages.push(m); apiPost('/api/messages/'+m.id+'/restore'); } }); render(); });
        }
        location.hash = '#/archive'; break;
      }
      case 'apprefresh': {
        toast('Fetching the newest version…');
        try { if(window.caches && caches.keys){ caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); }); } } catch(e){}
        try { if(navigator.serviceWorker && navigator.serviceWorker.getRegistrations){ navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister(); }); }); } } catch(e){}
        // reload index.html with a cache-buster so it re-fetches the versioned app.js/style.css
        setTimeout(function(){ location.replace(location.pathname + '?r=' + Date.now()); }, 250);
        break;
      }
      case 'catrenamedef': {
        var rc = catById(id);
        if(rc){ var rn = window.prompt('Rename category:', rc.name); if(rn && rn.trim()){ var old=rc.name; rc.name = rn.trim(); state.messages.forEach(function(m){ if(m.cat===rc.id) m.chip = rc.name; }); saveCats(); toast('Renamed “'+old+'” → “'+rc.name+'”'); } }
        render(); break;
      }
      case 'catdeldef': {
        var xc = catById(id);
        if(xc && window.confirm('Delete category “'+xc.name+'”? Its mail moves to FYI.')){
          if(xc.builtin) rememberCatDeleted(id);   // tombstone so it doesn't reappear on reload
          state.categories = state.categories.filter(function(c){ return c.id!==id; });
          var fb = catById('fyi'); state.messages.forEach(function(m){ if(m.cat===id){ m.cat = fb?'fyi':(state.categories[0]||{}).id; m.chip=(fb||catById(m.cat)||{}).name||''; } });
          state.catRules = (state.catRules||[]).filter(function(r){ return r.catId!==id; }); saveCatRules();
          saveCats(); recomputeAll(); toast('Category “'+xc.name+'” deleted');
        }
        render(); break;
      }
      case 'lblrecolor': {
        var lc = labelById(id);
        if(lc){ var i2 = CUSTOM_COLORS.indexOf(lc.color); lc.color = CUSTOM_COLORS[(i2+1)%CUSTOM_COLORS.length]; saveLabels(); }
        render(); break;
      }
      case 'lblrenamedef': {
        var rl = labelById(id);
        if(rl){ var ln = window.prompt('Rename label:', rl.name); if(ln && ln.trim()){ rl.name = ln.trim(); saveLabels(); toast('Label renamed'); } }
        render(); break;
      }
      case 'lbldeldef': {
        var xl = labelById(id);
        if(xl && window.confirm('Delete label “'+xl.name+'”? It’s removed from all mail and its rules.')){
          state.labels = (state.labels||[]).filter(function(l){ return l.id!==id; });
          state.messages.forEach(function(m){ if(m.labels){ m.labels = m.labels.filter(function(x){ return x!==id; }); } });
          state.labelRules = (state.labelRules||[]).filter(function(r){ return r.labelId!==id; }); saveLearned();
          saveLabels(); recomputeLabels(); toast('Label “'+xl.name+'” deleted');
        }
        render(); break;
      }
      case 'addrulelabel': {
        var who = window.prompt('Auto-label mail from — a sender name, or @domain (e.g. @acme.com):');
        if(who && who.trim()){
          who = who.trim();
          var isDomain = who.charAt(0)==='@';
          pendingRule = { scope: isDomain?'domain':'sender', value: isDomain?who.slice(1):who, action:'add' };   // then PICK the label
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
  var navGuard = 0;   // timestamp of a tab-swipe, to swallow the ghost click after it
  document.addEventListener('click', function(e){
    if(swipeGuard && (Date.now()-swipeGuard.t)<700 && e.target.closest && e.target.closest('.card')===swipeGuard.card){ swipeGuard=null; e.preventDefault(); return; }
    if(navGuard && (Date.now()-navGuard)<500){ navGuard=0; e.preventDefault(); return; }   // swallow click after a tab-swipe
    var navEl = e.target.closest('[data-nav]');
    var actEl = e.target.closest('[data-act]');
    if(actEl){ e.preventDefault(); handleAct(actEl.getAttribute('data-act'), actEl); return; }
    if(navEl){ e.preventDefault(); var to = navEl.getAttribute('data-nav'); if(location.hash===to) render(); else location.hash = to; }
  });
  window.addEventListener('hashchange', render);
  // rule builder: switching the match-type updates step 2's prompt/placeholder
  // in place (no re-render) so what you've typed isn't lost
  document.addEventListener('change', function(e){
    if(e.target && e.target.id === 'rb-kind'){
      var k = RB_KINDS.filter(function(x){ return x[0]===e.target.value; })[0]; if(!k) return;
      var vl=document.getElementById('rb-vlbl'), tv=document.getElementById('rb-val'), hn=document.getElementById('rb-hint');
      if(vl) vl.textContent = k[2]; if(tv) tv.placeholder = k[3]; if(hn) hn.innerHTML = k[4];
      rbUpdatePreview();
    }
  });
  document.addEventListener('input', function(e){
    if(e.target && e.target.id === 'rb-val'){ rbDebouncedPreview(); }
    if(e.target && e.target.id === 'srchq'){ runSearchDebounced(); }
  });

  // swipe the main screens left/right (Cockpit ⇄ Tasks ⇄ Archive ⇄ Settings)
  var MAIN_TABS = ['#/', '#/tasks', '#/archive', '#/settings'];
  function curTabIndex(){ return MAIN_TABS.indexOf(location.hash || '#/'); }
  function overlayOpen(){ return !!document.querySelector('.proposal'); }   // a chooser bar is up

  // swipe: on a card → archive/snooze; on the background of a main tab → change tab
  var sw = null, nav = null;
  document.addEventListener('touchstart', function(e){
    var c = e.target.closest('.card'); var id = c && cardIdOf(c);
    sw = id ? { c:c, id:id, x:e.touches[0].clientX, y:e.touches[0].clientY, dx:0, moved:false } : null;
    nav = (!sw && curTabIndex() >= 0 && !overlayOpen())
      ? { x:e.touches[0].clientX, y:e.touches[0].clientY, dx:0, moved:false } : null;
  }, { passive:true });
  document.addEventListener('touchmove', function(e){
    if(sw){
      var dx = e.touches[0].clientX - sw.x, dy = e.touches[0].clientY - sw.y;
      if(!sw.moved && Math.abs(dx) < Math.abs(dy)){ sw = null; return; }   // vertical scroll — bail
      sw.moved = true; sw.dx = dx;
      sw.c.style.transition = 'none';
      sw.c.style.transform = 'translateX(' + dx + 'px)';
      sw.c.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 240));
      return;
    }
    if(nav){
      var ndx = e.touches[0].clientX - nav.x, ndy = e.touches[0].clientY - nav.y;
      if(!nav.moved && Math.abs(ndx) < Math.abs(ndy) + 6){ nav = null; return; }   // vertical → let it scroll
      nav.moved = true; nav.dx = ndx;
    }
  }, { passive:true });
  document.addEventListener('touchend', function(){
    if(sw){
      var s = sw; sw = null;
      if(!s.moved) return;
      swipeGuard = { card: s.c, t: Date.now() };
      if(s.dx < -70){ var sm=msgById(s.id); if(sm && sm.group){ archiveGroup(sm.group); } else { archive(s.id, 'Archived', true); } render(); }
      else if(s.dx > 70){ pendingSnooze = s.id; render(); }   // open the snooze chooser
      else { s.c.style.transition = 'transform .2s, opacity .2s'; s.c.style.transform = ''; s.c.style.opacity = ''; }
      return;
    }
    if(nav){
      var n = nav; nav = null;
      if(n.moved && Math.abs(n.dx) > 60){
        var i = curTabIndex();
        if(i >= 0){
          var ni = n.dx < 0 ? i + 1 : i - 1;
          if(ni >= 0 && ni < MAIN_TABS.length){ navGuard = Date.now(); location.hash = MAIN_TABS[ni]; }
        }
      }
    }
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
    // tasks persist across reloads; seed a couple of examples only in the demo.
    var savedTasks = loadTasks();
    // clean up demo example tasks that an earlier version may have persisted in the live app
    if(savedTasks && API_OK){ savedTasks = savedTasks.filter(function(t){ return t.id!=='seed1' && t.id!=='seed2'; }); }
    state.tasks = savedTasks || (API_OK ? [] : [
      { id:'seed1', text:'Send the revised Q3 revenue slide', due:'Today · 12:00', done:false, msgId:'m1' },
      { id:'seed2', text:'Approve the vendor invoice before month-end', due:'', done:false, msgId:'m20' }
    ]);
    // learned rules survive reloads (localStorage) and re-apply on load
    state.labelRules = loadLearned();
    state.catRules = loadCatRules();
    state.mirrorGmail = (data.settings && data.settings.mirror_gmail) || loadMirror();
    state.lang = (data.settings && data.settings.lang) || loadLang();
    state.meetings = loadMeetings() || [];
    var calPrefs = loadCalPrefs();
    state.calendars = DEMO_CALENDARS.map(function(c){
      var p = calPrefs && calPrefs.filter(function(x){ return x.id===c.id; })[0];
      return { id:c.id, name:c.name, color:c.color, on: p ? !!p.on : c.on };
    });
    state.events = DEMO_EVENTS.slice();
    state.demoNow = 0;
    state.merges = loadMerges();   // manual "merge with…" links
    applyCustomDefs(data.categories);   // re-apply saved custom categories/labels
    applyCatOrder();   // restore a saved cockpit category order
    recomputeAll();
    render();
    evaluateAiRules();   // refine AI rules with Claude's semantic match (live)
    fetchAmounts();      // detect € totals for money-tiles that have none (incl. images)
    // pull genuinely new Gmail once per session, in the background, after showing cached mail
    if(API_OK && !_autoSynced){ _autoSynced = true; setTimeout(syncNow, 800); }
  }
  var _autoSynced = false;
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
