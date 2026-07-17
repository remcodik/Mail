/* MailAI — mock data for the Sprint 1 frontend.
   This shape is the contract the Sprint 2 backend (/api/inbox) will serve. */
(function () {
  // icon = inner SVG markup, drawn in a 24x24 stroke svg
  const I = {
    urgent: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    reply: '<path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>',
    delivery: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>',
    purchase: '<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    travel: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    news: '<rect x="3" y="4" width="13" height="16" rx="1"/><path d="M16 8h5v10a2 2 0 0 1-2 2H6"/><path d="M6 8h6M6 12h6M6 16h4"/>',
    ticket: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9 6v12"/>',
    wait: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    junk: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    fyi: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
    finance: '<path d="M12 1v22M5 8h9a3 3 0 0 1 0 6H7"/>'
  };

  // Connected mail accounts for the signed-in user, clearly separated.
  const accounts = [
    { id: 'work',    name: 'Work',    email: 'remco@northwind.co',  color: '#3E7BF0' },
    { id: 'private', name: 'Private', email: 'dik.remco@gmail.com', color: '#0FA398' }
  ];

  const categories = [
    { id: 'urgent',    name: 'Urgent',     color: 'var(--c-urgent)',   icon: I.urgent,   hint: 'need action', visible: true, builtin: true },
    { id: 'reply',     name: 'Reply',      color: 'var(--c-reply)',    icon: I.reply,    hint: 'drafts ready', visible: true, builtin: true },
    { id: 'delivery',  name: 'Deliveries', color: 'var(--c-delivery)', icon: I.delivery, hint: 'in transit',  visible: true, builtin: true },
    { id: 'purchase',  name: 'Purchases',  color: 'var(--c-purchase)', icon: I.purchase, hint: 'this week',   visible: true, builtin: true },
    { id: 'travel',    name: 'Travel',     color: 'var(--c-travel)',   icon: I.travel,   hint: 'upcoming',    visible: true, builtin: true },
    { id: 'newsletter',name: 'Newsletter', color: 'var(--c-news)',     icon: I.news,     hint: 'unread',      visible: true, builtin: true },
    { id: 'ticket',    name: 'Tickets',    color: 'var(--c-ticket)',   icon: I.ticket,   hint: 'for Wallet',  visible: true, builtin: true },
    { id: 'waiting',   name: 'Waiting',    color: 'var(--c-wait)',     icon: I.wait,     hint: 'overdue',     visible: true, builtin: true },
    { id: 'junk',      name: 'Junk',       color: 'var(--c-junk)',     icon: I.junk,     hint: 'auto-archived', visible: false, builtin: true },
    { id: 'fyi',       name: 'FYI',        color: 'var(--c-fyi)',      icon: I.fyi,      hint: 'read & filed', visible: false, builtin: true }
  ];

  const messages = [
    // ---- urgent ----
    { id: 'm1', cat: 'urgent', from: 'Sarah Bennett', initials: 'SB', av: '#E5484D', time: '08:12',
      subject: 'Re: Q3 board deck — need numbers by noon',
      snippet: 'Can you get me the revised revenue slide before the 12:00 review? The chair specifically asked for it.',
      chip: 'Urgent', ai: 'Deadline today 12:00 · 1 task extracted', needsAction: true,
      summary: 'Sarah needs the revised Q3 revenue slide before the 12:00 board review — the chair asked for it specifically. She assembles the rest once your numbers land.',
      tasks: [{ text: 'Send revised Q3 revenue slide to Sarah', due: 'Today · 12:00' }, { text: 'Confirm final figures with Finance', due: 'Today · 11:00' }],
      reply: 'Hi Sarah — sending the revised revenue slide by 11:30, ahead of the review. Confirming the figures with Finance first thing. Shout if the chair wants anything else on it.' },
    { id: 'm2', cat: 'urgent', from: "Dr. Reyes' office", initials: 'DR', av: '#B54708', time: '07:40',
      subject: 'Appointment reminder — tomorrow 09:30',
      snippet: 'This is a reminder for your appointment. Reply C to confirm or R to reschedule.',
      chip: 'Urgent', ai: 'Wants a reply · confirm suggested', needsAction: true,
      summary: 'Reminder for your appointment tomorrow at 09:30. Reply to confirm or reschedule.',
      reply: 'C — confirmed, see you at 09:30 tomorrow. Thank you.' },
    { id: 'm3', cat: 'urgent', from: 'AWS Billing', initials: 'AW', av: '#C11574', time: '06:03',
      subject: 'Budget alert: 90% of monthly limit reached',
      snippet: 'Your account has reached 90% of the $500 budget you configured for July.',
      chip: 'Urgent',
      summary: 'Your AWS account hit 90% of the $500 July budget. Review usage to avoid overage.' },

    // ---- reply ----
    { id: 'm4', cat: 'reply', from: 'Jordan Lee', initials: 'JL', av: '#E8912B', time: 'Yest',
      subject: 'Coffee next week?', snippet: 'Would love to catch up — are you around Tue or Wed afternoon?',
      chip: 'Reply needed', ai: 'Draft reply ready · proposes Tue 15:00',
      summary: 'Jordan wants to catch up over coffee next week, Tuesday or Wednesday afternoon.',
      reply: 'Tuesday at 15:00 works great for me — shall we say the usual place near your office? Looking forward to catching up.' },
    { id: 'm5', cat: 'reply', from: 'Maya Patel', initials: 'MP', av: '#0E7C86', time: 'Yest',
      subject: 'Feedback on the onboarding copy', snippet: 'Left a few comments in the doc — mainly the welcome screen. Thoughts by Friday?',
      chip: 'Reply needed',
      summary: 'Maya left comments on the onboarding copy (mainly the welcome screen) and wants your thoughts by Friday.',
      reply: 'Thanks Maya — went through your comments, the welcome-screen changes make sense. I’ll push an updated draft by Thursday so we’re clear before Friday.' },
    { id: 'm6', cat: 'reply', from: 'Tomás Krause', initials: 'TK', av: '#5B34C9', time: 'Mon',
      subject: 'Contract redlines attached', snippet: 'Please review section 4 and let me know if the payment terms work for you.',
      chip: 'Reply needed',
      summary: 'Tomás sent contract redlines; he needs you to review section 4 (payment terms) and confirm.' },

    // ---- delivery ----
    { id: 'm7', cat: 'delivery', from: 'PostNL', initials: 'PN', av: '#EA580C', time: '08:55',
      subject: 'Out for delivery — arrives 13:00–15:00',
      snippet: 'Parcel 3SABC1234567890 is on the van today. Track it live or leave delivery instructions.',
      chip: 'Delivery', ai: 'Arrives today 13:00–15:00 · track live' },
    { id: 'm8', cat: 'delivery', from: 'DHL Parcel', initials: 'DH', av: '#1E7FD6', time: 'Yest',
      subject: 'Ready for pickup — locker until 18 Jul',
      snippet: 'Collect at Albert Heijn, Overtoom 116 · locker 12. Bring ID and code 8842.',
      chip: 'Pickup ready', ai: 'Pickup by 18 Jul · code 8842', pickup: true },
    { id: 'm9', cat: 'delivery', from: 'Amazon', initials: 'AZ', av: '#0E7C86', time: '07:20',
      subject: 'Arriving today: USB-C cable + 2 items',
      snippet: 'Your order is arriving today by 9pm. No signature required.', chip: 'Delivery' },

    // ---- purchase ----
    { id: 'm10', cat: 'purchase', from: 'Apple', initials: 'AP', av: '#15202B', time: '06:40',
      subject: 'Your receipt from Apple · €12.99',
      snippet: 'Order W1234567 — iCloud+ 200GB monthly. Billed to Visa ···4471.',
      chip: 'Purchase', ai: 'Total €12.99 · order W1234567', total: 12.99 },
    { id: 'm11', cat: 'purchase', from: 'Zalando', initials: 'ZL', av: '#D6336C', time: 'Yest',
      subject: 'Order confirmed — €89,95',
      snippet: '2 items · running shoes + socks. Estimated delivery 17 Jul.',
      chip: 'Order confirmed', ai: 'Links to Deliveries when it ships', total: 89.95 },
    { id: 'm12', cat: 'purchase', from: 'Uber Receipts', initials: 'UB', av: '#276EF1', time: 'Mon',
      subject: 'Your Monday trip · €18,40',
      snippet: 'Centraal Station → Zuidas · 22 min. Receipt attached.', chip: 'Receipt', total: 18.40 },

    // ---- travel ----
    { id: 'm13', cat: 'travel', from: 'KLM', initials: 'KL', av: '#0EA5E9', time: 'Mon',
      subject: 'Your trip to New York — 22 Jul',
      snippet: 'Booking confirmed. AMS→JFK 10:05, returning 26 Jul. Online check-in opens 23 Jul.',
      chip: 'Travel · Itinerary', ai: 'Trip grouped · flight + hotel + car in 8 days', daysUntil: 8 },
    { id: 'm14', cat: 'travel', from: 'Booking.com', initials: 'BK', av: '#1E7FD6', time: 'Sun',
      subject: 'Hotel Pulitzer, Amsterdam — 2 nights',
      snippet: 'Check-in 22 Jul, check-out 24 Jul. Confirmation 4471. Free cancellation until 20 Jul.',
      chip: 'Travel · Stay', daysUntil: 8 },

    // ---- newsletter ----
    { id: 'm15', cat: 'newsletter', from: 'Stratechery', initials: 'ST', av: '#3E7BF0', time: '06:00',
      subject: 'The AI hardware question', snippet: 'Why the constraint has quietly moved from models to power, and what that means…',
      chip: 'Newsletter', ai: 'One-tap unsubscribe available', freq: 'Daily', unread: 22 },
    { id: 'm16', cat: 'newsletter', from: 'Morning Brew', initials: 'MB', av: '#B45309', time: '05:30',
      subject: 'Weekend edition · 5 stories', snippet: 'Your curated selection for the week is ready to read.',
      chip: 'Newsletter', freq: 'Daily', unread: 61 },
    { id: 'm17', cat: 'newsletter', from: 'The Long Read', initials: 'TL', av: '#2B7A3B', time: 'Fri',
      subject: 'This week’s deep dive', snippet: 'A curated long read for the weekend.', chip: 'Newsletter', freq: 'Weekly', unread: 3 },

    // ---- ticket ----
    { id: 'm18', cat: 'ticket', from: 'Ticketmaster', initials: 'TM', av: '#8257E6', time: 'Wed',
      subject: 'Your tickets: Radiohead — O2 Arena', snippet: '18 Jul, 19:30. Seat B14. Add to Wallet from the app.',
      chip: 'Event ticket',
      ticket: { style: 'evt', tt: 'Event ticket · Ticketmaster', ev: 'Radiohead — O2 Arena', grid: [['Date','18 Jul'],['Time','19:30'],['Seat','B14']], code: true } },
    { id: 'm19', cat: 'ticket', from: 'KLM', initials: 'KL', av: '#1E7FD6', time: 'Mon',
      subject: 'Boarding pass — AMS → JFK', snippet: 'KL641 · Gate D7 · boards 10:05 · seat 7A.',
      chip: 'Boarding pass',
      ticket: { style: 'board', tt: 'Boarding pass · KLM', ev: 'AMS → JFK · KL641', grid: [['Gate','D7'],['Boards','10:05'],['Seat','7A']], code: true } },

    // ---- waiting (sent, no reply) ----
    { id: 'm20', cat: 'waiting', from: 'Finance team', initials: 'FI', av: '#0FA398', time: '5d ago',
      subject: 'Approval on the vendor invoice?', snippet: 'Following up — still need sign-off to release payment before month end.',
      chip: 'Awaiting reply', to: 'Finance team', days: 5, overdue: true,
      reply: 'Hi — gentle nudge on this one. We need sign-off to release the vendor payment before month-end. Anything you need from me to move it along?' },
    { id: 'm21', cat: 'waiting', from: 'Alex (recruiter)', initials: 'AR', av: '#0E7C86', time: '2d ago',
      subject: 'Availability for next round', snippet: 'Sent my availability — let me know which slot works on your end.',
      chip: 'Awaiting reply', to: 'Alex (recruiter)', days: 2, overdue: false,
      reply: 'Hi Alex — just checking which of the slots I sent works best on your side, so I can hold the time. Thanks!' },

    // ---- junk (hidden category) ----
    { id: 'm22', cat: 'junk', from: 'Prize Draw', initials: 'PD', av: '#8A94A6', time: 'Yest',
      subject: 'You have been selected!', snippet: 'Claim your reward now — limited time only.', chip: 'Junk' }
  ];

  // Which mail account each message belongs to (Work vs Private).
  const ACCT = {
    m1:'work', m2:'private', m3:'work',
    m4:'private', m5:'work', m6:'work',
    m7:'private', m8:'private', m9:'private',
    m10:'private', m11:'private', m12:'work',
    m13:'work', m14:'work',
    m15:'private', m16:'private', m17:'private',
    m18:'private', m19:'work',
    m20:'work', m21:'private',
    m22:'private'
  };
  messages.forEach(function (m) { m.account = ACCT[m.id] || 'private'; });

  // structured data the detectors (Sprint 4) extract, shown on the detail screen
  const EXTRACTED = {
    m7:  { Carrier: 'PostNL', Tracking: '3SABC1234567890', Status: 'Out for delivery', ETA: 'Today 13:00–15:00' },
    m8:  { Carrier: 'DHL', Status: 'Ready for pickup', Location: 'Albert Heijn, Overtoom 116 · locker 12', Code: '8842', 'Collect by': '18 Jul' },
    m10: { Merchant: 'Apple', 'Order #': 'W1234567', Total: '€12.99', Item: 'iCloud+ 200GB (monthly)' },
    m11: { Merchant: 'Zalando', Total: '€89,95', Items: '2 · shoes, socks', 'Est. delivery': '17 Jul' },
    m13: { Trip: 'Amsterdam → New York', Depart: '22 Jul · 10:05', Return: '26 Jul', 'Check-in opens': '23 Jul' },
    m14: { Stay: 'Hotel Pulitzer, Amsterdam', 'Check-in': '22 Jul', 'Check-out': '24 Jul', Confirmation: '4471' }
  };
  messages.forEach(function (m) { if (EXTRACTED[m.id]) m.extracted = EXTRACTED[m.id]; });

  // Labels: cross-cutting tags the AI assigns (many per email). Users correct
  // them and the app learns. `suggested: true` marks an AI guess not yet confirmed.
  const labels = [
    { id: 'apollo',   name: 'Project Apollo', color: '#7C3AED' },
    { id: 'acme',     name: 'Acme Corp',      color: '#0891B2' },
    { id: 'invoices', name: 'Invoices',       color: '#059669' },
    { id: 'nyc',      name: 'NYC Trip',       color: '#EA580C' }
  ];
  // AI-assigned labels per message (m4's "acme" is a deliberate wrong guess to correct)
  const LABELS = {
    m1: ['apollo'], m5: ['apollo'], m6: ['acme'], m4: ['acme'],
    m10: ['invoices'], m11: ['invoices'], m20: ['acme', 'invoices'],
    m13: ['nyc'], m19: ['nyc']
  };
  messages.forEach(function (m) { m.labels = (LABELS[m.id] || []).slice(); });

  // full email bodies (what you read when you open the mail); others fall back to snippet
  const BODIES = {
    m1: "Hi,\n\nThe board review is at 12:00 and the chair has specifically asked to see the revised Q3 revenue slide. Could you get me the updated numbers before then? I'll assemble the rest of the deck once yours land.\n\nThanks,\nSarah",
    m2: "Dear patient,\n\nThis is a reminder of your appointment with Dr. Reyes tomorrow at 09:30. Please reply C to confirm or R to reschedule.\n\nKind regards,\nDr. Reyes' office",
    m3: "Your AWS account has reached 90% of the $500 monthly budget you configured for July. Review your usage in the Billing console to avoid exceeding the limit.",
    m4: "Hey!\n\nIt's been too long — would love to catch up over coffee next week. Are you around Tuesday or Wednesday afternoon? My treat.\n\nJordan",
    m5: "Hi,\n\nI left a few comments in the onboarding doc — mostly on the welcome-screen wording. Could you take a look and share your thoughts by Friday?\n\nCheers,\nMaya",
    m6: "Hi,\n\nPlease find the contract redlines attached. The main change is in section 4 (payment terms). Let me know if those terms work for you and I'll get it finalised.\n\nBest,\nTomás",
    m7: "Your parcel 3SABC1234567890 is out for delivery and will arrive today between 13:00 and 15:00. Track it live or leave delivery instructions via the link in this email.",
    m10: "Thank you for your purchase.\n\nOrder W1234567\niCloud+ 200GB (monthly) — €12.99\nBilled to Visa ···4471.\n\nApple",
    m13: "Your trip is confirmed.\n\nAMS → JFK · 22 Jul · departs 10:05\nReturn · 26 Jul\nOnline check-in opens 23 Jul.\n\nSee you on board,\nKLM",
    m20: "Hi team,\n\nFollowing up on the vendor invoice approval — we still need sign-off to release payment before month-end. Let me know if anything is blocking it.\n\nThanks"
  };
  messages.forEach(function (m) { if (BODIES[m.id]) m.body = BODIES[m.id]; });

  window.MAILAI_FIXTURES = { accounts, categories, labels, messages };
})();
