'use strict';

/* =========================================================================
   El club clandestino — fiestas secretas, sospecha y chivatos
   Seis semanas. Cada semana el club organiza una fiesta y cada socio, en
   secreto, aporta cartas de su mano (alegría para él), se queda en casa o
   va a la policía a dar un soplo. Una fiesta solo sale bien si llega al
   mínimo, y cuanto más grande es, más ruido hace: la sospecha sube. Cada
   soplo la sube mucho más y le da puntos secretos al chivato.

   Si el club aguanta las seis semanas, gana quien tenga más alegría (los
   soplos no valen nada). Si la sospecha llega al límite, hay redada: el
   club cae y gana el chivato con más soplos. Se puede acusar a alguien:
   si había dado algún soplo, lo pierde todo y queda expulsado.

   Un único motor para «Mismo móvil» (mesa.js) y «Con código de sala».
   ========================================================================= */

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const WEEKS = 6;
const HAND = 5;
const RAID = 15;
const TIMER_OPTIONS = [0, 1, 2, 3, 4, 5];
const TIMER_STEP = 30;
const SETTINGS_KEY = 'club-clandestino-settings-v1';

const SUITS = [
  { name: 'Música', emoji: '🎻' },
  { name: 'Vino', emoji: '🍷' },
  { name: 'Disfraces', emoji: '🎭' },
  { name: 'Baile', emoji: '💃' }
];
const suitOf = (c) => Math.floor(c / 10);
const valOf = (c) => c % 10;

let settings = { playerCount: 5, timerMinutes: 2, secretVote: false };

function loadSettings() {
  const p = Kit.load(SETTINGS_KEY, {}) || {};
  if (typeof p.playerCount === 'number') settings.playerCount = Kit.clamp(Math.round(p.playerCount), MIN_PLAYERS, MAX_PLAYERS);
  if (typeof p.secretVote === 'boolean') settings.secretVote = p.secretVote;
  if (TIMER_OPTIONS.includes(p.timerMinutes)) settings.timerMinutes = p.timerMinutes;
}
function saveSettings() { Kit.save(SETTINGS_KEY, salaBackup ? Object.assign({}, settings, salaBackup) : settings); }

/* ---------------------------------- Motor ----------------------------------- */
// p: [{ h: mano, j: alegría, s: soplos, out: expulsado, ever: dio algún soplo }]
// Fases: plan → party → (day → vote → verdict) → plan… y end.

function newDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let v = 1; v <= 6; v++) d.push(s * 10 + v, s * 10 + v);
  return Kit.shuffled(d);
}

function newGame(n, cfg, local) {
  const g = {
    cfg: { seconds: cfg.timerMinutes * 60, local: Boolean(local), open: Boolean(local && !cfg.secretVote) },
    p: Array.from({ length: n }, () => ({ h: [], j: 0, s: 0, out: false })),
    deck: newDeck(), week: 1, theme: 0, sus: 0, phase: 'plan', plays: {}, party: null,
    votes: {}, verdict: null, end: null, winners: []
  };
  g.p.forEach((x) => draw(g, x));
  g.theme = Math.floor(Math.random() * 4);
  return g;
}

function draw(g, x) {
  while (x.h.length < HAND) {
    if (!g.deck.length) g.deck = newDeck();
    x.h.push(g.deck.pop());
  }
  x.h.sort((a, b) => a - b);
}

const all = (g) => g.p.map((_, i) => i);
const active = (g) => all(g).filter((i) => !g.p[i].out);
const minimum = (g) => 3 * active(g).length + 2 * g.week;
const worth = (g, cards) => cards.reduce((t, c) => t + valOf(c) * (suitOf(c) === g.theme ? 2 : 1), 0);

function resolveParty(g) {
  const act = active(g);
  let total = 0;
  let cards = 0;
  let snitches = 0;
  const gain = {};
  act.forEach((i) => {
    const pl = g.plays[i] || { c: [] };
    if (pl.soplo) { snitches += 1; g.p[i].s += 3; g.p[i].ever = true; return; }
    const v = worth(g, pl.c);
    gain[i] = v;
    total += v;
    cards += pl.c.length;
    g.p[i].h = g.p[i].h.filter((c) => !pl.c.includes(c));
  });
  const min = minimum(g);
  const ok = total >= min && cards > 0;
  if (ok) Object.keys(gain).forEach((i) => { g.p[i].j += gain[i]; });
  const noise = Math.floor(total / (3 * act.length));
  g.sus += noise + 2 * snitches;
  act.forEach((i) => draw(g, g.p[i]));
  g.party = { total, min, ok, noise, snitches, cards, theme: g.theme, gain: ok ? gain : {} };
  g.phase = 'party';
  if (g.sus >= RAID) finish(g, 'raid');
}

function finish(g, why) {
  g.end = why;
  g.phase = 'end';
  if (why === 'raid') {
    const best = Math.max(0, ...all(g).map((i) => g.p[i].s));
    g.winners = best > 0 ? all(g).filter((i) => g.p[i].s === best) : [];
  } else {
    const act = active(g);
    const best = Math.max(...act.map((i) => g.p[i].j));
    g.winners = act.filter((i) => g.p[i].j === best);
  }
}

function nextWeek(g) {
  if (g.week >= WEEKS) { finish(g, 'survive'); return; }
  g.week += 1;
  g.theme = Math.floor(Math.random() * 4);
  g.phase = 'plan';
  g.plays = {};
  g.votes = {};
  g.verdict = null;
  g.party = null;
}

function resolveCounts(g, counts, none) {
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((k) => counts[k] === max).map(Number);
  let out = null;
  let reason = 'novote';
  if (none > 0 && none >= max) reason = 'none';
  else if (top.length > 1) reason = 'tie';
  else if (top.length === 1) { out = top[0]; reason = 'out'; }
  let guilty = false;
  if (out != null) {
    const x = g.p[out];
    guilty = x.s > 0;
    if (guilty) { x.s = 0; x.out = true; g.sus = Math.max(0, g.sus - 3); }
    else { x.j += 3; g.sus += 1; }
  }
  g.verdict = { out, reason, counts, none, guilty };
  g.phase = 'verdict';
  if (g.sus >= RAID) finish(g, 'raid');
  else if (active(g).length < 2) finish(g, 'survive');
}
function resolveVote(g) {
  const counts = {};
  let none = 0;
  Object.keys(g.votes).forEach((k) => { const t = g.votes[k]; if (t === 'none') none += 1; else counts[t] = (counts[t] || 0) + 1; });
  resolveCounts(g, counts, none);
}

function act(g, i, a, host) {
  const me = g.p[i];
  switch (a.t) {
    case 'play': {
      if (g.phase !== 'plan' || !me || me.out || g.plays[i]) return null;
      if (a.soplo) { g.plays[i] = { c: [], soplo: true }; return {}; }
      const cards = Array.isArray(a.cards) ? a.cards.map(Number) : [];
      const hand = me.h.slice();
      for (const c of cards) { const k = hand.indexOf(c); if (k === -1) return null; hand.splice(k, 1); }
      g.plays[i] = { c: cards };
      return {};
    }
    case 'party':
      if (!host || g.phase !== 'plan') return null;
      resolveParty(g);
      return {};
    case 'meet':
      if (!host || g.phase !== 'party') return null;
      g.phase = 'day';
      return { timer: g.cfg.seconds || null };
    case 'skip':
      if (!host || !['party', 'day', 'verdict'].includes(g.phase)) return null;
      nextWeek(g);
      return { timer: null };
    case 'to-vote':
      if (!host || g.phase !== 'day') return null;
      g.phase = 'vote';
      g.votes = {};
      return { timer: null };
    case 'vote':
      if (g.phase !== 'vote' || !me || me.out) return null;
      if (a.target !== 'none' && (!(a.target >= 0 && a.target < g.p.length) || g.p[a.target].out || a.target === i)) return null;
      g.votes[i] = a.target;
      return {};
    case 'tally':
      if (!host || g.phase !== 'vote') return null;
      resolveVote(g);
      return {};
    default:
      return null;
  }
}

function privateTurn(g) {
  if (g.phase === 'plan') return { key: `plan-${g.week}`, order: active(g), done: (gg, k) => Boolean(gg.plays[k]), lastLabel: 'Ver la fiesta', intro: `🎭 Semana ${g.week}. Cada uno decide en secreto qué hace.` };
  if (g.phase === 'vote' && !g.cfg.open) return { key: `vote-${g.week}`, order: active(g), done: (gg, k) => gg.votes[k] != null, lastLabel: 'Ver el recuento', intro: '🗳️ Votación secreta.' };
  return null;
}
function advance(g) {
  if (g.phase === 'plan') { resolveParty(g); return {}; }
  if (g.phase === 'vote') { resolveVote(g); return {}; }
  return null;
}

/* ------------------------------ Lo que se pinta ------------------------------ */

const esc = Kit.esc;
const actAttr = (a) => `data-act="${esc(JSON.stringify(a))}"`;
const hostBtn = (a, label, cls) => `<button type="button" class="btn ${cls || 'btn-primary'} btn-large" ${actAttr(a)}>${label}</button>`;
const waitHost = (ctx, text) => `<p class="setup-hint sala-center">⏳ ${esc(text || `Esperando a ${ctx.hostName}`)}</p>`;
const cardHtml = (g, c, attrs) => `<button type="button" class="club-card s${suitOf(c)}${suitOf(c) === g.theme ? ' is-theme' : ''}" ${attrs || 'disabled'}><span>${SUITS[suitOf(c)].emoji}</span><strong>${valOf(c)}</strong></button>`;

// Cartas elegidas en este móvil antes de confirmar (no viajan por la red)
let pick = { key: '', cards: [] };
function pickFor(g, i) {
  const key = `${g.week}-${i}`;
  if (pick.key !== key) pick = { key, cards: [] };
  return pick.cards;
}
function playAttr(cards) {
  return actAttr({ t: 'play', cards });
}

function statusBar(g) {
  const pct = Math.min(100, Math.round((g.sus / RAID) * 100));
  return `<div class="club-status"><div><span>Semana</span><strong>${g.week}/${WEEKS}</strong></div>` +
    `<div><span>Tema</span><strong>${SUITS[g.theme].emoji} ${SUITS[g.theme].name}</strong></div>` +
    `<div><span>Mínimo</span><strong>${minimum(g)}</strong></div>` +
    `<div class="sus"><span>🚨 Sospecha</span><strong>${g.sus}/${RAID}</strong><i style="--w:${pct}%"></i></div></div>`;
}

function planPanel(g, i) {
  const me = g.p[i];
  const mine = `<p class="club-mine">Tu alegría <strong>${me.j}</strong> · tus soplos <strong>${me.s}</strong> <small>solo lo ves tú</small></p>`;
  const pl = g.plays[i];
  if (pl) {
    if (pl.soplo) return mine + '<p class="screen-help">🚨 Esta semana has ido a hablar con la policía. Que no se note.</p>';
    if (!pl.c.length) return mine + '<p class="screen-help">🏠 Esta semana te quedas en casa.</p>';
    return mine + `<p class="screen-help">Aportas ${pl.c.length} carta${pl.c.length > 1 ? 's' : ''} que valen <strong>${worth(g, pl.c)}</strong> si la fiesta sale bien.</p><div class="club-hand">${pl.c.map((c) => cardHtml(g, c)).join('')}</div>`;
  }
  const sel = pickFor(g, i);
  return mine + `<p class="screen-help">Toca las cartas que aportas a la fiesta. Las de ${SUITS[g.theme].emoji} ${SUITS[g.theme].name} valen el doble.</p>` +
    `<div class="club-hand" data-club-hand="${g.week}-${i}" data-theme="${g.theme}">${me.h.map((c, k) => `<button type="button" class="club-card s${suitOf(c)}${suitOf(c) === g.theme ? ' is-theme' : ''}${sel.includes(k) ? ' is-selected' : ''}" data-club-card="${k}" data-c="${c}"><span>${SUITS[suitOf(c)].emoji}</span><strong>${valOf(c)}</strong></button>`).join('')}</div>` +
    `<button type="button" class="btn btn-primary btn-large" id="club-play" ${playAttr(sel.map((k) => me.h[k]))}>${playLabel(g, sel.map((k) => me.h[k]))}</button>` +
    `<details class="fold club-snitch"><summary>🚨 Ir a la policía</summary><p class="setup-hint">No vas a la fiesta: ganas 3 soplos secretos y la sospecha sube 2. Los soplos solo valen si hay redada.</p>${hostBtn({ t: 'play', soplo: true }, 'Dar un soplo', 'btn-secondary')}</details>`;
}
function playLabel(g, cards) {
  return cards.length ? `Aportar ${cards.length} · vale ${worth(g, cards)}` : 'Quedarme en casa';
}

function partyHtml(g, names) {
  const f = g.party;
  const head = f.ok
    ? `<div class="verdict is-win"><span class="verdict-emoji" aria-hidden="true">🎉</span><h2 class="verdict-title">¡Fiestón!</h2><p class="verdict-text">La fiesta suma <strong>${f.total}</strong> y el mínimo era ${f.min}. Quien aportó gana su alegría.</p></div>`
    : `<div class="verdict is-lose"><span class="verdict-emoji" aria-hidden="true">🥀</span><h2 class="verdict-title">Fiesta aguada</h2><p class="verdict-text">Solo suma <strong>${f.total}</strong> y hacía falta ${f.min}. Nadie gana alegría y las cartas se pierden.</p></div>`;
  return head + `<ul class="club-news"><li>🃏 ${f.cards} carta${f.cards === 1 ? '' : 's'} sobre la mesa</li><li>🔊 Ruido: sospecha +${f.noise}</li>` +
    (f.snitches ? `<li class="is-alarm">🚨 ¡${f.snitches === 1 ? 'Alguien ha hablado' : `${f.snitches} socios han hablado`} con la policía! Sospecha +${2 * f.snitches}</li>` : '<li>🤐 Nadie ha hablado con la policía… esta vez</li>') + '</ul>';
}

function chips(g, names) {
  return `<ul class="town-chips">${g.p.map((x, k) => `<li class="${x.out ? 'is-dead' : ''}">${x.out ? '🚫 ' : ''}${esc(names[k])}</li>`).join('')}</ul>`;
}

function verdictHtml(g, names) {
  const v = g.verdict;
  if (v.out != null) {
    return v.guilty
      ? `<div class="verdict is-win"><span class="verdict-emoji" aria-hidden="true">🐀</span><h2 class="verdict-title">¡${esc(names[v.out])} era un chivato!</h2><p class="verdict-text">Pierde todos sus soplos y queda expulsado del club. La sospecha baja 3.</p></div>`
      : `<div class="verdict is-lose"><span class="verdict-emoji" aria-hidden="true">😇</span><h2 class="verdict-title">${esc(names[v.out])} es inocente</h2><p class="verdict-text">Nunca ha dado un soplo. Se le compensa con 3 de alegría y la sospecha sube 1 por el jaleo.</p></div>`;
  }
  const text = v.reason === 'tie' ? 'Empate: no se acusa a nadie.' : v.reason === 'none' ? 'El club decide no acusar a nadie.' : 'Nadie votó.';
  return `<div class="verdict"><span class="verdict-emoji" aria-hidden="true">🤝</span><h2 class="verdict-title">Nadie es investigado</h2><p class="verdict-text">${text}</p></div>`;
}

function voteSummary(g, names) {
  const v = g.verdict;
  const rows = Object.keys(v.counts).map(Number).sort((a, b) => v.counts[b] - v.counts[a]).map((k) => `${esc(names[k])} ${v.counts[k]}`);
  if (v.none) rows.push(`Nadie ${v.none}`);
  return rows.length ? `<p class="vote-summary">Votos: ${rows.join(' · ')}</p>` : '';
}

function endHtml(g, names) {
  const raid = g.end === 'raid';
  const win = g.winners.length ? g.winners.map((k) => `<strong>${esc(names[k])}</strong>`).join(' y ') : '';
  const text = raid
    ? (win ? `La policía entra por la puerta. Gana ${win}, el chivato con más soplos.` : 'La policía entra por la puerta y nadie había dado un soplo: perdéis todos.')
    : `El club aguanta las seis semanas. Gana ${win}, con más alegría que nadie.`;
  const rows = all(g).slice().sort((a, b) => (raid ? g.p[b].s - g.p[a].s : g.p[b].j - g.p[a].j));
  return `<div class="verdict ${raid ? 'is-lose' : 'is-win'}"><span class="verdict-emoji" aria-hidden="true">${raid ? '🚔' : '🥂'}</span><h2 class="verdict-title">${raid ? '¡Redada!' : '¡El club sobrevive!'}</h2><p class="verdict-text">${text}</p></div>` +
    '<div class="card reveal-box"><p class="results-label">Cuentas finales</p><ul class="town-list">' +
    rows.map((k) => { const x = g.p[k]; return `<li class="${x.s || x.ever ? 'is-wolf' : ''}${x.out ? ' is-dead' : ''}"><span>${g.winners.includes(k) ? '👑' : x.out ? '🚫' : '🎭'}</span><strong>${esc(names[k])}</strong><small>alegría ${x.j} · soplos ${x.s}${x.ever ? ' · fue chivato' : ''}${x.out ? ' · expulsado' : ''}</small></li>`; }).join('') +
    '</ul></div>';
}

function voteButtons(g, i, names) {
  const mine = g.votes[i];
  return '<div class="sala-votes">' + active(g).filter((k) => k !== i).map((k) =>
    `<button type="button" class="sala-vote${mine === k ? ' is-selected' : ''}" ${actAttr({ t: 'vote', target: k })}>${esc(names[k])}</button>`).join('') +
    `<button type="button" class="sala-vote is-none${mine === 'none' ? ' is-selected' : ''}" ${actAttr({ t: 'vote', target: 'none' })}>🙅 Nadie</button></div>`;
}

function render(ctx) {
  const { g, me, host, names } = ctx;
  const inGame = me >= 0 && me < g.p.length;
  const x = inGame ? g.p[me] : null;
  const spectator = '<p class="screen-help">👀 Has entrado con la partida empezada: mira y espera a la siguiente.</p>';
  const outMsg = x && x.out ? '<p class="setup-hint sala-center">🚫 Te han expulsado del club: solo puedes mirar.</p>' : '';
  const next = g.week >= WEEKS ? 'Cerrar el club' : 'Siguiente semana';
  const mine = x && !x.out && !ctx.local ? `<p class="club-mine">Tu alegría <strong>${x.j}</strong> · tus soplos <strong>${x.s}</strong> <small>solo lo ves tú</small></p>` : '';

  switch (g.phase) {
    case 'plan': {
      const done = active(g).filter((k) => g.plays[k]).length;
      return `<h2 class="screen-title">🎭 Semana ${g.week}</h2>` + statusBar(g) +
        (inGame ? (x.out ? outMsg : planPanel(g, me)) : (ctx.local ? '' : spectator)) +
        (ctx.local ? '' : `<p class="sala-count">Han decidido <strong>${done}</strong> de ${active(g).length}</p>` +
          (host ? `<button type="button" class="btn btn-text" ${actAttr({ t: 'party' })}>Empezar la fiesta ya</button>` : ''));
    }
    case 'party':
      return `<h2 class="screen-title">🥂 La fiesta de la semana ${g.week}</h2>` + partyHtml(g, names) + statusBar(g) + mine + outMsg +
        (host ? hostBtn({ t: 'meet' }, 'Reunión 🗣️') + hostBtn({ t: 'skip' }, next, 'btn-secondary') : waitHost(ctx));
    case 'day':
      return `<h2 class="screen-title">🗣️ Reunión del club</h2><p class="screen-help">¿Quién ha estado hablando con la policía? Si acusáis a un inocente, la sospecha sube.</p>` +
        mine + outMsg + chips(g, names) + ctx.timer +
        (host ? hostBtn({ t: 'to-vote' }, 'Acusar 🗳️') + hostBtn({ t: 'skip' }, `Sin acusar · ${next.toLowerCase()}`, 'btn-secondary') : waitHost(ctx, `${ctx.hostName} decidirá si se vota`));
    case 'vote':
      if (ctx.openVote) return '<h2 class="screen-title">¿A quién investigáis?</h2><p class="screen-help">Si había dado algún soplo, queda expulsado y los pierde todos.</p>';
      return '<h2 class="screen-title">¿A quién investigáis?</h2>' +
        (x && !x.out ? '<p class="screen-help">Vota desde tu móvil.</p>' + voteButtons(g, me, names) : outMsg || spectator) +
        (ctx.local ? '' : `<p class="sala-count">🗳️ Han votado <strong>${active(g).filter((k) => g.votes[k] != null).length}</strong> de ${active(g).length}</p>` +
          (host ? `<button type="button" class="btn btn-text" ${actAttr({ t: 'tally' })}>Hacer el recuento ya</button>` : ''));
    case 'verdict':
      return verdictHtml(g, names) + voteSummary(g, names) + statusBar(g) +
        (host ? hostBtn({ t: 'skip' }, `${next} ▶`) : waitHost(ctx));
    case 'end':
      return endHtml(g, names) + (host
        ? '<div class="results-actions"><button type="button" class="btn btn-primary btn-large" data-sala="again">Otra partida ▶</button>' +
          '<button type="button" class="btn btn-secondary btn-large" data-sala="lobby">Cambiar ajustes</button></div>'
        : waitHost(ctx, `Esperando a que ${ctx.hostName} empiece otra partida`));
    default:
      return '';
  }
}

const engine = {
  act, advance, privateTurn, render,
  card: () => null,
  title: (g) => (g.phase === 'end' ? 'Final' : `Semana ${g.week} de ${WEEKS}`),
  phaseKey: (g) => `${g.phase}-${g.week}`,
  fx: (g) => (g.phase === 'end' ? (g.end === 'raid' ? 'lose' : 'win') : null),
  openVote: (g) => (g.phase === 'vote' && g.cfg.open ? {
    targets: active(g), allowNone: true,
    onDone: ({ counts, none }) => resolveCounts(g, counts, none)
  } : null)
};

/* ---------------------- Elegir cartas (sin pasar por la red) ---------------------- */

function bindCards() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-club-card]');
    if (!b) return;
    const hand = b.closest('[data-club-hand]');
    if (!hand || pick.key !== hand.dataset.clubHand) return;
    const k = Number(b.dataset.clubCard);
    const at = pick.cards.indexOf(k);
    if (at === -1) pick.cards.push(k); else pick.cards.splice(at, 1);
    b.classList.toggle('is-selected', at === -1);
    Kit.sfx.tap();
    const play = document.getElementById('club-play');
    const cards = Array.from(hand.querySelectorAll('[data-club-card]')).filter((n) => pick.cards.includes(Number(n.dataset.clubCard))).map((n) => Number(n.dataset.c));
    if (play) {
      const theme = Number(hand.dataset.theme);
      play.dataset.act = JSON.stringify({ t: 'play', cards });
      const v = cards.reduce((t, c) => t + valOf(c) * (suitOf(c) === theme ? 2 : 1), 0);
      play.textContent = cards.length ? `Aportar ${cards.length} · vale ${v}` : 'Quedarme en casa';
    }
  });
}

/* ------------------------------- Ajustes (DOM) ------------------------------- */

const el = {};
let game = null;

function cacheDom() {
  ['player-count-value', 'btn-player-minus', 'btn-player-plus', 'names-grid', 'btn-shuffle-names',
    'time-value', 'timer-hint', 'btn-time-minus', 'btn-time-plus', 'opt-secret-vote', 'opt-sound', 'opt-vibrate',
    'btn-start-game', 'game-bar-title', 'btn-exit', 'play-root'
  ].forEach((id) => { el[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id); });
}

function renderSetup() {
  const n = settings.playerCount;
  el.playerCountValue.textContent = String(n);
  el.btnPlayerMinus.disabled = n <= MIN_PLAYERS;
  el.btnPlayerPlus.disabled = n >= MAX_PLAYERS;
  Kit.renderNameInputs(el.namesGrid, n);
  el.optSecretVote.checked = settings.secretVote;
  const idx = TIMER_OPTIONS.indexOf(settings.timerMinutes);
  el.timeValue.textContent = settings.timerMinutes ? `${settings.timerMinutes}′` : '—';
  el.timerHint.textContent = settings.timerMinutes ? 'Con cronómetro' : 'Sin cronómetro';
  el.btnTimeMinus.disabled = idx <= 0;
  el.btnTimePlus.disabled = idx >= TIMER_OPTIONS.length - 1;
}

function startLocalGame() {
  game = newGame(settings.playerCount, settings, true);
  Kit.keepAwake(true);
  Kit.showScreen('play');
  Mesa.start({
    root: el.playRoot, titleEl: el.gameBarTitle, engine, game, names: Kit.playerNames(settings.playerCount),
    secretVote: settings.secretVote, timerStep: TIMER_STEP, onAgain: startLocalGame, onSetup: backToSetup
  });
}

function backToSetup() {
  Mesa.stop();
  game = null;
  Kit.keepAwake(false);
  renderSetup();
  Kit.showScreen('setup');
}

/* --------------------------- Con código de sala ------------------------------ */

let salaBackup = null;

function salaHosting(on, players) {
  if (on) {
    if (!salaBackup) salaBackup = { playerCount: settings.playerCount };
    settings.playerCount = Kit.clamp(players, MIN_PLAYERS, MAX_PLAYERS);
  } else if (salaBackup) {
    settings.playerCount = salaBackup.playerCount;
    salaBackup = null;
  }
  renderSetup();
}

Sala.configure({
  id: 'club',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  timerStep: TIMER_STEP,
  holdPrompt: 'Mantén pulsado',
  who: { one: 'chivato', many: 'chivatos', One: 'Chivato', Many: 'Chivatos', the: 'el chivato', The: 'El chivato' },
  hosting: salaHosting,
  custom: {
    start: (n) => newGame(n, settings, false),
    act: Mesa.autoAct(engine),
    render,
    card: () => null,
    phaseKey: engine.phaseKey,
    phaseFx: (g, me) => (g.phase === 'end' ? (g.winners.includes(me) ? 'win' : 'lose') : null)
  }
});

/* --------------------------------- Eventos ----------------------------------- */

function bindEvents() {
  const change = (d) => { settings.playerCount = Kit.clamp(settings.playerCount + d, MIN_PLAYERS, MAX_PLAYERS); saveSettings(); renderSetup(); };
  el.btnPlayerMinus.addEventListener('click', () => change(-1));
  el.btnPlayerPlus.addEventListener('click', () => change(1));
  el.btnTimeMinus.addEventListener('click', () => { settings.timerMinutes = TIMER_OPTIONS[Math.max(0, TIMER_OPTIONS.indexOf(settings.timerMinutes) - 1)]; saveSettings(); renderSetup(); });
  el.btnTimePlus.addEventListener('click', () => { settings.timerMinutes = TIMER_OPTIONS[Math.min(TIMER_OPTIONS.length - 1, TIMER_OPTIONS.indexOf(settings.timerMinutes) + 1)]; saveSettings(); renderSetup(); });
  el.btnShuffleNames.addEventListener('click', () => { Kit.shuffleNames(el.namesGrid, settings.playerCount); Kit.toast('Orden mezclado 🔀'); });
  el.optSecretVote.addEventListener('change', () => { settings.secretVote = el.optSecretVote.checked; saveSettings(); });
  Kit.bindPrefToggle(el.optSound, 'sound');
  Kit.bindPrefToggle(el.optVibrate, 'vibrate');
  el.btnStartGame.addEventListener('click', () => {
    saveSettings();
    try { history.pushState({ inGame: true }, ''); } catch (err) { /* sin historial */ }
    startLocalGame();
  });
  el.btnExit.addEventListener('click', () => {
    if (!game || window.confirm('¿Salir de la partida? Se perderá la partida en curso.')) backToSetup();
  });
  window.addEventListener('popstate', () => {
    if (!game) return;
    if (window.confirm('¿Salir de la partida? Se perderá la partida en curso.')) backToSetup();
    else { try { history.pushState({ inGame: true }, ''); } catch (err) { /* sin historial */ } }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  loadSettings();
  bindEvents();
  bindCards();
  renderSetup();
  Kit.showScreen('setup');
});
