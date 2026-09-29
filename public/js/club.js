/* ============================================================
   MULTI-CLUB FRONTEND ENGINE (club.js)
   Dynamically loads club data scoped by URL slug: /:slug/
   Applies dynamic theme CSS variables, FUT cards, 11v11 pitch.
   ============================================================ */

// Deteksi slug dari URL pathname (misal /438867-lamball-vfc/)
const pathSegments = window.location.pathname.split('/').filter(Boolean);
const CURRENT_SLUG = pathSegments[0] || '654678-lamball-vfc';

/* ============================================================
   LAMBALL VFC — CORE FRONTEND LOGIC (app.js)
   Interactivity: 3D Tilt Cards, Tactical Pitch, Live Match Timer,
   Leaderboard Sorting, Jersey Canvas Generator & Trial Submit.
   ============================================================ */

let CLUB_DATA = null;
let PLAYERS = [];
let MATCHES = [];

let currentFilterPos = 'ALL';
let currentSortKey = 'ovr';
let tableSortKey = 'ovr';
let tableSortAsc = false;
let currentJerseyKit = 'home';

// Initial Load
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initMatchFilters();
  await loadAllData();
  initJerseyGenerator();
  initTrialForm();
  initModals();
});

/* ============================================================
   1. DATA FETCHING
   ============================================================ */
function applyClubTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;

  if (theme.primary) {
    root.style.setProperty('--gold-primary', theme.primary);
    root.style.setProperty('--border-gold', theme.primary + '55');
  }
  if (theme.light) {
    root.style.setProperty('--gold-light', theme.light);
  }
  if (theme.glow) {
    root.style.setProperty('--gold-glow', theme.glow);
    root.style.setProperty('--border-gold-glow', theme.glow);
    root.style.setProperty('--bg-card-glow', theme.glow + '18');
  }
  if (theme.bgDeep) {
    root.style.setProperty('--bg-deep', theme.bgDeep);
  }
  if (theme.bgSurface) {
    root.style.setProperty('--bg-surface', theme.bgSurface);
  }
  if (theme.bgCard) {
    root.style.setProperty('--bg-card', theme.bgCard);
  }
}

async function loadAllData() {
  try {
    const res = await fetch('/api/clubs/' + CURRENT_SLUG + '/data');
    const json = await res.json();

    if (!json.success || !json.data) {
      console.error('Data klub gagal dimuat untuk slug:', CURRENT_SLUG);
      return;
    }

    const { club, theme, formation, socials, players, matches } = json.data;

    // Terapkan Tema Warna Klub Dinamis
    applyClubTheme(theme);

    // Set Data Global
    CLUB_DATA = {
      club,
      formation,
      socials
    };
    PLAYERS = players || [];
    MATCHES = matches || [];

    // Update Header dan Title
    document.title = (club.name || 'Pro Clubs') + ' — Official EA Sports FC Hub';
    const headerTitle = document.getElementById('pageTitle');
    if (headerTitle) headerTitle.textContent = (club.name || 'Pro Clubs') + ' — Official Hub';

    const headerName = document.getElementById('clubHeaderName');
    if (headerName) headerName.innerHTML = (club.name || 'LAMBALL VFC').toUpperCase();

    const headerLogo = document.getElementById('clubHeaderLogo');
    if (headerLogo && club.logo) headerLogo.src = club.logo;

    const adminLink = document.getElementById('clubAdminLink');
    if (adminLink) adminLink.href = '/' + CURRENT_SLUG + '/admin/';

    // Render Semua Komponen Tampilan
    renderClubHero();
    renderAwardsPodium();
    renderSquadGrid();
    renderTacticalPitch();
    renderStatsTable();
    renderMatchesList();
    renderCommunityStreamers();

  } catch (err) {
    console.error('Gagal memuat data dari API:', err);
  }
}

function initNav() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const sections = document.querySelectorAll('.page-section');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.dataset.target;
      const targetSec = document.getElementById(targetId);
      if (targetSec) {
        targetSec.classList.add('active');
        targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Filter & Sort Events
  const posFilterBtns = document.querySelectorAll('#posFilterTabs .filter-btn');
  posFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      posFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilterPos = btn.dataset.pos;
      renderSquadGrid();
    });
  });

  const sortSelect = document.getElementById('sortPlayerSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSortKey = e.target.value;
      renderSquadGrid();
    });
  }
}

/* ============================================================
   3. HERO & COUNTDOWN TIMER
   ============================================================ */
function renderClubHero() {
  if (!CLUB_DATA || !CLUB_DATA.club) return;
  const c = CLUB_DATA.club;

  // KPIs
  if (c.stats) {
    const elMatches = document.getElementById('kpiMatches'); if (elMatches) elMatches.textContent = c.stats.matches;
    const elWinRate = document.getElementById('kpiWinRate'); if (elWinRate) elWinRate.textContent = c.stats.winRate + '%';
    const elGoals = document.getElementById('kpiGoals'); if (elGoals) elGoals.textContent = c.stats.goalsFor;
    const elClean = document.getElementById('kpiCleanSheets'); if (elClean) elClean.textContent = c.stats.cleanSheets;
    const elSkill = document.getElementById('kpiSkill'); if (elSkill) elSkill.textContent = (c.stats.skillRating || 1500).toLocaleString('id-ID');
  }

  // Next Match
  if (c.nextMatch) {
    const elComp = document.getElementById('nextMatchComp'); if (elComp) elComp.textContent = c.nextMatch.tournament || 'Friendly Match';
    const elOppName = document.getElementById('nextOpponentName'); if (elOppName) elOppName.textContent = (c.nextMatch.opponent || 'OPPONENT').toUpperCase();
    const elOppCrest = document.getElementById('nextOpponentCrest');
    if (elOppCrest && typeof elOppCrest.querySelector === 'function') {
      const sp = elOppCrest.querySelector('span');
      if (sp) sp.textContent = (c.nextMatch.opponent || 'O').charAt(0).toUpperCase();
    }

    if (c.nextMatch.date) {
      const kickoff = new Date(c.nextMatch.date);
      const elKickoff = document.getElementById('kickoffTime');
      if (elKickoff) {
        elKickoff.textContent = '📅 ' + kickoff.toLocaleDateString('id-ID', {
          weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) + ' WIB';
      }
      startCountdown(kickoff);
    }
  }
}

function startCountdown(targetDate) {
  function update() {
    const now = new Date().getTime();
    const diff = targetDate.getTime() - now;

    if (diff <= 0) {
      document.getElementById('cdHours').textContent = '00';
      document.getElementById('cdMins').textContent = '00';
      document.getElementById('cdSecs').textContent = '00';
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('cdHours').textContent = String(hours).padStart(2, '0');
    document.getElementById('cdMins').textContent = String(mins).padStart(2, '0');
    document.getElementById('cdSecs').textContent = String(secs).padStart(2, '0');
  }

  update();
  setInterval(update, 1000);
}

/* ============================================================
   4. AWARDS PODIUM
   ============================================================ */
function renderAwardsPodium() {
  if (!PLAYERS.length) return;

  const outfield = PLAYERS.filter(p => p.pos !== 'GK');
  const topScorer = [...outfield].sort((a, b) => b.gol - a.gol)[0];
  const topAssist = [...outfield].sort((a, b) => b.assist - a.assist)[0];
  const pots = [...PLAYERS].sort((a, b) => (b.motmMusim * 2 + b.rating * 5) - (a.motmMusim * 2 + a.rating * 5))[0];

  if (topScorer) {
    document.getElementById('topScorerName').textContent = topScorer.name;
    document.getElementById('topScorerVal').textContent = topScorer.gol;
  }
  if (topAssist) {
    document.getElementById('topAssistName').textContent = topAssist.name;
    document.getElementById('topAssistVal').textContent = topAssist.assist;
  }
  if (pots) {
    document.getElementById('potsName').textContent = pots.name;
  }
}

/* ============================================================
   5. SQUAD GRID & 3D PARALLAX TILT FUT CARDS
   ============================================================ */
function renderSquadGrid() {
  const container = document.getElementById('squadGrid');
  if (!container) return;

  // Filter
  let filtered = [...PLAYERS];
  if (currentFilterPos === 'FWD') filtered = filtered.filter(p => ['ST', 'LW', 'RW'].includes(p.pos));
  else if (currentFilterPos === 'MID') filtered = filtered.filter(p => ['CAM', 'CM', 'CDM'].includes(p.pos));
  else if (currentFilterPos === 'DEF') filtered = filtered.filter(p => ['CB', 'LB', 'RB'].includes(p.pos));
  else if (currentFilterPos === 'GK') filtered = filtered.filter(p => p.pos === 'GK');

  // Sort
  filtered.sort((a, b) => {
    if (currentSortKey === 'ovr') return b.ovr - a.ovr;
    if (currentSortKey === 'gol') return b.gol - a.gol;
    if (currentSortKey === 'assist') return b.assist - a.assist;
    if (currentSortKey === 'main') return b.main - a.main;
    if (currentSortKey === 'rating') return b.rating - a.rating;
    return 0;
  });

  container.innerHTML = filtered.map(player => generateFutCardHtml(player)).join('');

  // Attach 3D Gyroscope Mousemove Handlers
  container.querySelectorAll('.fut-card-wrapper').forEach(wrapper => {
    const card = wrapper.querySelector('.fut-card');

    wrapper.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -14;
      const rotateY = ((x - centerX) / centerX) * 14;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.04, 1.04, 1.04)`;
    });

    wrapper.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });

    wrapper.addEventListener('click', () => {
      openPlayerModal(wrapper.dataset.playerId);
    });
  });
}

function generateFutCardHtml(player) {
  const isGK = player.pos === 'GK';

  // Stats calculation
  const s1 = isGK ? { k: 'DIV', v: Math.min(99, player.ovr + 1) } : { k: 'PAC', v: Math.min(99, player.ovr - 2) };
  const s2 = isGK ? { k: 'HAN', v: Math.min(99, player.ovr - 1) } : { k: 'SHO', v: Math.min(99, Math.round(player.tembakanAkurasi * 1.4)) };
  const s3 = isGK ? { k: 'KIC', v: Math.min(99, player.passAkurasi) } : { k: 'PAS', v: Math.min(99, player.passAkurasi) };
  const s4 = isGK ? { k: 'REF', v: Math.min(99, player.ovr + 2) } : { k: 'DRI', v: Math.min(99, player.ovr - 1) };
  const s5 = isGK ? { k: 'SPD', v: 65 } : { k: 'DEF', v: Math.min(99, player.tekelAkurasi || 40) };
  const s6 = isGK ? { k: 'POS', v: Math.min(99, player.ovr) } : { k: 'PHY', v: Math.min(99, player.ovr - 3) };

  const clubLogo = CLUB_DATA?.club?.logo || '/images/logo.jpeg';
  const silId = 'sil_' + player.id.replace(/[^a-zA-Z0-9]/g, '');
  const photoHtml = player.photo
    ? `<img src="${player.photo}" alt="${player.name}" class="card-photo-img">`
    : `<div class="card-pro-silhouette">
        <svg viewBox="0 0 100 120" class="pro-silhouette-svg">
          <circle cx="50" cy="30" r="18" fill="url(#${silId})" />
          <path d="M18,120 C18,68 30,54 50,54 C70,54 82,68 82,120 Z" fill="url(#${silId})" />
          <defs>
            <linearGradient id="${silId}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="var(--gold-primary)" stop-opacity="0.8" />
              <stop offset="100%" stop-color="var(--gold-dark, #C68E17)" stop-opacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
        <div class="silhouette-number">#${player.number || ''}</div>
      </div>`;

  const flagEmoji = player.countryCode === 'br' ? '🇧🇷' : '🇮🇩';

  return `
    <div class="fut-card-wrapper" data-player-id="${player.id}">
      <div class="fut-card">
        <div class="card-header-badge">
          <div class="card-ovr">${player.ovr}</div>
          <div class="card-pos">${player.pos}</div>
          <span class="card-flag">${flagEmoji}</span>
        </div>
        <div class="card-crest-badge">
          <img src="${clubLogo}" alt="Crest" class="card-crest-img">
        </div>

        ${player.isCaptain ? '<div class="card-captain-badge">C</div>' : ''}

        <div class="card-photo-wrap">
          ${photoHtml}
        </div>

        <div class="card-name-bar">
          <div class="card-player-name">#${player.number} ${player.name}</div>
        </div>

        <div class="card-stats-grid">
          <div class="stat-pair"><b>${s1.v}</b><span>${s1.k}</span></div>
          <div class="stat-pair"><b>${s4.v}</b><span>${s4.k}</span></div>
          <div class="stat-pair"><b>${s2.v}</b><span>${s2.k}</span></div>
          <div class="stat-pair"><b>${s5.v}</b><span>${s5.k}</span></div>
          <div class="stat-pair"><b>${s3.v}</b><span>${s3.k}</span></div>
          <div class="stat-pair"><b>${s6.v}</b><span>${s6.k}</span></div>
        </div>

        <div class="card-bottom-bar">
          <span class="card-archetype-tag">⚡ ${player.archetype || 'Pro'}</span>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   6. TACTICAL PITCH (FORMASI LAPANGAN 11 VS 11)
   ============================================================ */
function renderTacticalPitch() {
  if (!CLUB_DATA || !CLUB_DATA.formation) return;
  const f = CLUB_DATA.formation;
  const layer = document.getElementById('pitchPlayersLayer');
  const benchContainer = document.getElementById('benchChips');
  if (!layer || !Array.isArray(f.startingXI)) return;

  document.getElementById('formationNameTitle').textContent = f.name;
  document.getElementById('tacticsStyle').textContent = f.tactics;

  // Pitch Starter Tokens
  layer.innerHTML = f.startingXI.map(slot => {
    const player = PLAYERS.find(p => p.id === slot.playerId);
    if (!player) return '';

    return `
      <div class="pitch-token" style="left: ${slot.x}%; top: ${slot.y}%;" data-player-id="${player.id}">
        <div class="token-circle">
          <span class="token-num">#${player.number}</span>
          <div class="token-ovr-badge">${player.ovr}</div>
        </div>
        <div class="token-label">
          <span class="token-name">${player.name}</span>
          <span class="token-pos">${slot.slot}</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach Click on Tokens
  layer.querySelectorAll('.pitch-token').forEach(token => {
    token.addEventListener('click', () => openPlayerModal(token.dataset.playerId));
  });

  // Render Bench Chips
  const subs = PLAYERS.filter(p => !p.isStartingXI);
  if (benchContainer) {
    benchContainer.innerHTML = subs.map(sub => `
      <div class="bench-chip-item" data-player-id="${sub.id}">
        <div class="bench-chip-left">
          <span class="pos-tag">${sub.pos}</span>
          <b>#${sub.number} ${sub.name}</b>
        </div>
        <span class="bench-chip-ovr">${sub.ovr} OVR</span>
      </div>
    `).join('');

    benchContainer.querySelectorAll('.bench-chip-item').forEach(item => {
      item.addEventListener('click', () => openPlayerModal(item.dataset.playerId));
    });
  }

  // Toggle Mode Button Handlers
  const btnStarters = document.getElementById('btnPitchStarters');
  const btnSubs = document.getElementById('btnPitchSubs');

  if (btnStarters && btnSubs && typeof btnStarters.addEventListener === 'function') {
    btnStarters.addEventListener('click', () => {
      btnStarters.classList.add('active');
      btnSubs.classList.remove('active');
      layer.style.opacity = '1';
    });

    btnSubs.addEventListener('click', () => {
      btnSubs.classList.add('active');
      btnStarters.classList.remove('active');
      layer.style.opacity = '0.35';
    });
  }
}

/* ============================================================
   7. LEADERBOARD & STATISTIK TABLE
   ============================================================ */
function renderStatsTable() {
  const tbody = document.getElementById('statsTableBody');
  const searchInput = document.getElementById('statSearchInput');
  if (!tbody) return;

  const query = ((searchInput && searchInput.value) ? searchInput.value : '').toLowerCase().trim();

  let list = [...PLAYERS];
  if (query) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.realName || '').toLowerCase().includes(query) ||
      String(p.number).includes(query) ||
      p.pos.toLowerCase().includes(query)
    );
  }

  list.sort((a, b) => {
    let valA = a[tableSortKey] ?? 0;
    let valB = b[tableSortKey] ?? 0;
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return tableSortAsc ? -1 : 1;
    if (valA > valB) return tableSortAsc ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = list.map(p => `
    <tr style="cursor:pointer;" onclick="openPlayerModal('${p.id}')">
      <td><b>#${p.number}</b></td>
      <td>
        <div class="player-cell">
          <img src="${p.photo || '/images/logo.jpeg'}" class="player-cell-avatar" alt="">
          <div>
            <div>${p.name} ${p.isCaptain ? '<small style="color:var(--gold-primary); font-weight:800;">(C)</small>' : ''}</div>
            <small style="color:var(--text-dim);">${p.realName}</small>
          </div>
        </div>
      </td>
      <td><span class="pos-tag">${p.pos}</span></td>
      <td><b class="rating-badge">${p.ovr}</b></td>
      <td>${p.main}</td>
      <td><b style="color:${p.gol > 0 ? '#fff' : 'var(--text-dim)'};">${p.gol}</b></td>
      <td>${p.assist}</td>
      <td>${p.rating}</td>
      <td>${p.winRate}%</td>
      <td>${p.passAkurasi}%</td>
      <td>${p.tekelAkurasi}%</td>
      <td>${p.motmMusim}x</td>
      <td><span style="color:var(--gold-light); font-size:12px;">${p.archetype}</span></td>
    </tr>
  `).join('');

  // Setup Search Event
  if (searchInput && searchInput.dataset && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', () => renderStatsTable());
  }

  // Setup Table Header Sort
  document.querySelectorAll('#statsTable th.sortable').forEach(th => {
    if (th && th.dataset && !th.dataset.bound) {
      th.dataset.bound = 'true';
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (tableSortKey === key) {
          tableSortAsc = !tableSortAsc;
        } else {
          tableSortKey = key;
          tableSortAsc = false;
        }

        document.querySelectorAll('#statsTable th.sortable').forEach(h => {
          h.classList.remove('active-sort');
          h.querySelector('.sort-arrow').textContent = '';
        });
        th.classList.add('active-sort');
        th.querySelector('.sort-arrow').textContent = tableSortAsc ? '▲' : '▼';

        renderStatsTable();
      });
    }
  });
}

/* ============================================================
   8. MATCH CENTER & HIGHLIGHTS
   ============================================================ */
let currentMatchFilter = 'all';

/* ============================================================
   MATCH CENTER & BROADCAST DETAIL LOGIC
   ============================================================ */
function initMatchFilters() {
  const filterBtns = document.querySelectorAll('.match-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMatchFilter = btn.dataset.filter;
      renderMatchesList();
    });
  });

  const closeBtn = document.getElementById('btnCloseMatchModal');
  const modal = document.getElementById('matchDetailModal');
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }
}

function renderFormGuide() {
  const container = document.getElementById('formGuidePills');
  if (!container || !MATCHES.length) return;

  const last5 = MATCHES.slice(0, 5).reverse();
  container.innerHTML = last5.map(m => {
    const res = (m.result || 'win').toLowerCase();
    const letter = res === 'win' ? 'W' : (res === 'draw' ? 'D' : 'L');
    const label = res === 'win' ? 'Menang' : (res === 'draw' ? 'Seri' : 'Kalah');
    return `<div class="form-pill ${res}" title="vs ${m.opponent}: ${label} (${m.scoreHome}-${m.scoreAway})">${letter}</div>`;
  }).join('');
}

function renderMatchesList() {
  const container = document.getElementById('matchesList');
  if (!container) return;

  renderFormGuide();

  let filtered = [...MATCHES];
  if (currentMatchFilter !== 'all') {
    filtered = filtered.filter(m => (m.result || '').toLowerCase() === currentMatchFilter);
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--text-muted); background:var(--bg-surface); border-radius:14px; border:1px solid var(--border-subtle);">
        <p style="font-size:15px;">Belum ada data pertandingan untuk filter ini.</p>
      </div>
    `;
    return;
  }

  const clubName = CLUB_DATA?.club?.name || 'Lamball VFC';
  const clubLogo = CLUB_DATA?.club?.logo || '/images/logo.jpeg';

  container.innerHTML = filtered.map(m => {
    const isWin = (m.result || '').toLowerCase() === 'win';
    const isDraw = (m.result || '').toLowerCase() === 'draw';
    const resultText = isWin ? 'MENANG' : (isDraw ? 'SERI' : 'KALAH');
    const resultClass = isWin ? 'win' : (isDraw ? 'draw' : 'loss');

    const d = new Date(m.date);
    const dateFormatted = d.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) + ' WIB';

    // Format scorers preview
    const scorersText = (m.scorers || [])
      .filter(s => s.type === 'goal' || !s.type)
      .map(s => s.minute ? `${s.player} (${s.minute}')` : s.player)
      .join(', ');

    return `
      <div class="broadcast-match-card" id="match-${m.id}">
        <!-- Top Bar -->
        <div class="match-card-topbar">
          <div class="comp-badge">
            <span>🏆</span> ${m.competition || 'Elite Division'}
          </div>
          <div class="match-time-tag">
            📅 ${dateFormatted} · <b style="color:var(--gold-primary);">FT - SELESAI</b>
          </div>
        </div>

        <!-- Scoreboard Body -->
        <div class="match-card-scoreboard" onclick="openMatchDetailModal('${m.id}')" style="cursor:pointer;">
          <!-- Home Team (Our Club) -->
          <div class="team-block home">
            <span class="team-name-text">${clubName}</span>
            <img src="${clubLogo}" alt="${clubName}" class="team-badge-img" onerror="this.src='/images/logo.jpeg'">
          </div>

          <!-- Score Center -->
          <div class="score-center-block">
            <div class="score-digits">${m.scoreHome} - ${m.scoreAway}</div>
            <span class="result-badge ${resultClass}">${resultText}</span>
          </div>

          <!-- Away Team (Opponent) -->
          <div class="team-block away">
            <div class="team-badge-placeholder">${(m.opponent || 'OPP').slice(0, 3).toUpperCase()}</div>
            <span class="team-name-text">${m.opponent || 'Lawan'}</span>
          </div>
        </div>

        <!-- Footer Strip -->
        <div class="match-card-footer">
          <div class="match-scorers-preview">
            <span>⚽ <b>Gol:</b> ${scorersText || 'Tidak ada catatan gol'}</span>
            ${m.motm ? `<span class="match-motm-pill">★ MOTM: ${m.motm}</span>` : ''}
          </div>

          <div class="match-card-actions">
            ${m.highlightUrl ? `
              <button type="button" class="btn-match-video" onclick="event.stopPropagation(); playHighlight('${m.highlightUrl}')">
                🎥 Tonton Highlight
              </button>
            ` : ''}
            <button type="button" class="btn-match-detail" onclick="openMatchDetailModal('${m.id}')">
              📊 Rapor & Analisis Laga
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   MATCH DETAIL MODAL RENDERER
   ============================================================ */
window.openMatchDetailModal = function(matchId) {
  const m = MATCHES.find(x => x.id === matchId);
  if (!m) return;

  const modal = document.getElementById('matchDetailModal');
  const body = document.getElementById('matchModalBody');
  if (!modal || !body) return;

  const clubName = CLUB_DATA?.club?.name || 'Lamball VFC';
  const clubLogo = CLUB_DATA?.club?.logo || '/images/logo.jpeg';

  const isWin = (m.result || '').toLowerCase() === 'win';
  const isDraw = (m.result || '').toLowerCase() === 'draw';
  const resultText = isWin ? 'VICTORY 🏆' : (isDraw ? 'DRAW 🤝' : 'DEFEAT');
  const resultClass = isWin ? 'win' : (isDraw ? 'draw' : 'loss');

  const d = new Date(m.date);
  const dateFormatted = d.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) + ' WIB';

  const stats = m.stats || {
    shotsHome: 10, shotsAway: 8,
    shotsOnTargetHome: 5, shotsOnTargetAway: 4,
    possessionHome: 50, possessionAway: 50,
    tacklesHome: 15, tacklesAway: 15,
    passSuccessHome: 80, passSuccessAway: 80,
    cornersHome: 4, cornersAway: 4,
    foulsHome: 5, foulsAway: 5
  };

  const totalShots = (stats.shotsHome + stats.shotsAway) || 1;
  const shotsHomePct = Math.round((stats.shotsHome / totalShots) * 100);
  const shotsAwayPct = 100 - shotsHomePct;

  const totalTackles = (stats.tacklesHome + stats.tacklesAway) || 1;
  const tacklesHomePct = Math.round((stats.tacklesHome / totalTackles) * 100);
  const tacklesAwayPct = 100 - tacklesHomePct;

  // Render Timeline
  const events = (m.scorers || []).sort((a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0));
  const timelineHtml = events.length ? events.map(e => {
    const isGoal = e.type === 'goal' || !e.type;
    const isOppGoal = e.type === 'opponent_goal';
    const isCard = e.type === 'yellow_card' || e.type === 'red_card';
    const icon = isGoal ? '⚽' : (isOppGoal ? '🥅' : (e.type === 'red_card' ? '🟥' : '🟨'));
    const title = isGoal ? `Gol: ${e.player}` : (isOppGoal ? `Gol Lawan: ${e.player}` : `Kartu: ${e.player}`);
    const sub = e.assist ? `Assist: ${e.assist}` : '';

    return `
      <div class="timeline-event-item">
        <div class="event-minute-badge">${e.minute ? e.minute + "'" : (isGoal ? '⚽' : 'FT')}</div>
        <div class="event-icon">${icon}</div>
        <div class="event-info">
          <div class="event-title">${title}</div>
          ${sub ? `<div class="event-sub">${sub}</div>` : ''}
        </div>
      </div>
    `;
  }).join('') : '<div style="color:var(--text-muted); text-align:center; padding:20px;">Tidak ada catatan kejadian penting pada laga ini.</div>';

  // Render Lineup Ratings
  const lineup = m.lineup || [];
  const lineupHtml = lineup.length ? `
    <table class="modal-lineup-table">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Pemain</th>
          <th>Rapor Performa</th>
          <th>Rating Laga</th>
        </tr>
      </thead>
      <tbody>
        ${lineup.map(p => {
          const r = Number(p.rating) || 7.0;
          const rClass = r >= 8.5 ? 'excellent' : (r >= 7.5 ? 'good' : 'average');
          return `
            <tr>
              <td><span class="badge-pos badge-${p.pos}">${p.pos}</span></td>
              <td style="font-weight:700; color:var(--text-main);">
                ${p.name} ${p.motm ? '<span style="color:var(--gold-primary); margin-left:6px;">★ MOTM</span>' : ''}
                ${(p.goals > 0 || p.assists > 0) ? `<div style="font-size:11px; color:var(--gold-light); font-weight:normal; margin-top:2px;">${p.goals > 0 ? '⚽ ' + p.goals + ' Gol ' : ''}${p.assists > 0 ? '🎯 ' + p.assists + ' Assist' : ''}</div>` : ''}
              </td>
              <td style="color:var(--text-muted); font-size:12px;">${r >= 9.0 ? 'Luar Biasa · MVP Laga' : (r >= 8.0 ? 'Performa Solid' : 'Bermain Disiplin')}</td>
              <td><span class="rating-badge-cell ${rClass}">${r.toFixed(1)}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  ` : `
    <div style="color:var(--text-muted); text-align:center; padding:20px;">
      Lineup rapor laga belum dikonfigurasi untuk pertandingan ini.
    </div>
  `;

  body.innerHTML = `
    <!-- Header Scoreboard Banner -->
    <div class="match-modal-header">
      <span class="match-modal-comp">🏆 ${m.competition || 'Elite League'} · ${dateFormatted}</span>
      
      <div class="match-modal-scoreboard">
        <div class="modal-team-col">
          <img src="${clubLogo}" alt="${clubName}" class="modal-team-crest" onerror="this.src='/images/logo.jpeg'">
          <span class="modal-team-name">${clubName}</span>
        </div>

        <div class="modal-score-center">
          ${m.scoreHome} - ${m.scoreAway}
          <div><span class="result-badge ${resultClass}">${resultText}</span></div>
        </div>

        <div class="modal-team-col">
          <div class="team-badge-placeholder" style="width:64px; height:64px; font-size:22px;">${(m.opponent || 'OPP').slice(0, 3).toUpperCase()}</div>
          <span class="modal-team-name">${m.opponent || 'Lawan'}</span>
        </div>
      </div>

      <!-- MOTM Spotlight Card -->
      ${m.motm ? `
        <div class="modal-motm-card">
          <div class="modal-motm-left">
            <span class="motm-badge-icon">👑</span>
            <div>
              <div style="font-size:10px; font-weight:800; color:var(--gold-light); letter-spacing:1px; text-transform:uppercase;">MAN OF THE MATCH</div>
              <div class="motm-name">${m.motm}</div>
            </div>
          </div>
          <div class="motm-rating-tag">${(m.motmRating || 9.0).toFixed(1)} ★</div>
        </div>
      ` : ''}
    </div>

    <!-- Modal Navigation Tabs -->
    <div class="match-modal-nav">
      <button type="button" class="modal-tab-btn active" onclick="switchMatchModalTab('tabTimeline')">⏱️ Kronologi & Gol</button>
      <button type="button" class="modal-tab-btn" onclick="switchMatchModalTab('tabStats')">📊 Statistik Siaran TV</button>
      <button type="button" class="modal-tab-btn" onclick="switchMatchModalTab('tabLineup')">👥 Rapor Pemain (${lineup.length || 0})</button>
      ${m.highlightUrl ? `<button type="button" class="modal-tab-btn" onclick="switchMatchModalTab('tabVideo')">🎥 Cuplikan Video</button>` : ''}
    </div>

    <!-- Tab 1: Timeline -->
    <div id="tabTimeline" class="match-modal-tab-content">
      <h4 style="font-size:14px; color:var(--gold-primary); margin-bottom:14px;">⏱️ Kronologi Kejadian di Lapangan</h4>
      <div class="match-timeline-list">${timelineHtml}</div>
    </div>

    <!-- Tab 2: Broadcast TV Stats -->
    <div id="tabStats" class="match-modal-tab-content" style="display:none;">
      <h4 style="font-size:14px; color:var(--gold-primary); margin-bottom:18px;">📊 Analisis Statistik Pertandingan</h4>
      
      <!-- Possession -->
      <div class="tv-stat-row">
        <div class="tv-stat-labels">
          <b style="color:var(--gold-light);">${stats.possessionHome}%</b>
          <span>Penguasaan Bola</span>
          <b style="color:#60A5FA;">${stats.possessionAway}%</b>
        </div>
        <div class="tv-stat-bar-track">
          <div class="tv-bar-home" style="width: ${stats.possessionHome}%;"></div>
          <div class="tv-bar-away" style="width: ${stats.possessionAway}%;"></div>
        </div>
      </div>

      <!-- Total Shots -->
      <div class="tv-stat-row">
        <div class="tv-stat-labels">
          <b style="color:var(--gold-light);">${stats.shotsHome}</b>
          <span>Total Tembakan</span>
          <b style="color:#60A5FA;">${stats.shotsAway}</b>
        </div>
        <div class="tv-stat-bar-track">
          <div class="tv-bar-home" style="width: ${shotsHomePct}%;"></div>
          <div class="tv-bar-away" style="width: ${shotsAwayPct}%;"></div>
        </div>
      </div>

      <!-- Shots on Target -->
      <div class="tv-stat-row">
        <div class="tv-stat-labels">
          <b style="color:var(--gold-light);">${stats.shotsOnTargetHome || stats.shotsHome}</b>
          <span>Tembakan Tepat Sasaran</span>
          <b style="color:#60A5FA;">${stats.shotsOnTargetAway || stats.shotsAway}</b>
        </div>
        <div class="tv-stat-bar-track">
          <div class="tv-bar-home" style="width: ${shotsHomePct}%;"></div>
          <div class="tv-bar-away" style="width: ${shotsAwayPct}%;"></div>
        </div>
      </div>

      <!-- Pass Accuracy -->
      <div class="tv-stat-row">
        <div class="tv-stat-labels">
          <b style="color:var(--gold-light);">${stats.passSuccessHome}%</b>
          <span>Akurasi Umpan</span>
          <b style="color:#60A5FA;">${stats.passSuccessAway}%</b>
        </div>
        <div class="tv-stat-bar-track">
          <div class="tv-bar-home" style="width: ${stats.passSuccessHome}%;"></div>
          <div class="tv-bar-away" style="width: ${stats.passSuccessAway}%;"></div>
        </div>
      </div>

      <!-- Tackles -->
      <div class="tv-stat-row">
        <div class="tv-stat-labels">
          <b style="color:var(--gold-light);">${stats.tacklesHome}</b>
          <span>Tekel Sukses</span>
          <b style="color:#60A5FA;">${stats.tacklesAway}</b>
        </div>
        <div class="tv-stat-bar-track">
          <div class="tv-bar-home" style="width: ${tacklesHomePct}%;"></div>
          <div class="tv-bar-away" style="width: ${tacklesAwayPct}%;"></div>
        </div>
      </div>

      <!-- Corners & Fouls -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-top:20px;">
        <div style="background:var(--bg-surface); padding:12px; border-radius:10px; border:1px solid var(--border-subtle); text-align:center;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Sepak Pojok (Corners)</div>
          <div style="font-family:var(--font-heading); font-size:18px; font-weight:800; margin-top:4px;">
            ${stats.cornersHome || 0} — ${stats.cornersAway || 0}
          </div>
        </div>
        <div style="background:var(--bg-surface); padding:12px; border-radius:10px; border:1px solid var(--border-subtle); text-align:center;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Pelanggaran (Fouls)</div>
          <div style="font-family:var(--font-heading); font-size:18px; font-weight:800; margin-top:4px;">
            ${stats.foulsHome || 0} — ${stats.foulsAway || 0}
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 3: Lineup -->
    <div id="tabLineup" class="match-modal-tab-content" style="display:none;">
      <h4 style="font-size:14px; color:var(--gold-primary); margin-bottom:14px;">👥 Rapor Performa Pemain di Laga Ini</h4>
      ${lineupHtml}
    </div>

    <!-- Tab 4: Video Highlight -->
    ${m.highlightUrl ? `
      <div id="tabVideo" class="match-modal-tab-content" style="display:none;">
        <h4 style="font-size:14px; color:var(--gold-primary); margin-bottom:14px;">🎥 Cuplikan Highlight Pertandingan</h4>
        <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; background:#000;">
          ${getEmbedIframeHtml(m.highlightUrl)}
        </div>
      </div>
    ` : ''}
  `;

  modal.style.display = 'flex';
};

window.switchMatchModalTab = function(tabId) {
  const tabs = document.querySelectorAll('.match-modal-tab-content');
  const btns = document.querySelectorAll('.modal-tab-btn');

  tabs.forEach(t => t.style.display = 'none');
  btns.forEach(b => b.classList.remove('active'));

  const activeTab = document.getElementById(tabId);
  if (activeTab) activeTab.style.display = 'block';

  // Set active button
  const clickedBtn = Array.from(btns).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (clickedBtn) clickedBtn.classList.add('active');
};

function getEmbedIframeHtml(url) {
  if (!url) return '';
  let videoId = '';

  if (url.includes('youtube.com/watch?v=')) {
    videoId = url.split('v=')[1]?.split('&')[0];
  } else if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1]?.split('?')[0];
  }

  if (videoId) {
    return `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  }

  return `<div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-muted);"><a href="${url}" target="_blank" style="color:var(--gold-primary); font-weight:700;">Buka Tautan Video Highlight di Tab Baru ↗</a></div>`;
}

window.playHighlight = function(url) {
  const modal = document.getElementById('videoModal');
  const container = document.getElementById('videoContainer');
  if (!modal || !container) return;

  container.innerHTML = getEmbedIframeHtml(url);
  modal.style.display = 'flex';
};

function initJerseyGenerator() {
  const canvas = document.getElementById('jerseyCanvas');
  const nameInput = document.getElementById('customJerseyName');
  const numInput = document.getElementById('customJerseyNumber');
  const kitBtns = document.querySelectorAll('.kit-btn');
  const btnDownload = document.getElementById('btnDownloadJersey');

  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function drawJersey() {
    const name = (nameInput.value || 'LAMBALL').toUpperCase().slice(0, 12);
    const num = String(numInput.value || '10').slice(0, 2);
    const isHome = currentJerseyKit === 'home';

    // Background Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Card Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#161620');
    bgGrad.addColorStop(1, '#0C0C10');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 20);
    ctx.fill();

    // Card Border
    ctx.strokeStyle = '#F5BA31';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Stadium Lights overlay
    const radial = ctx.createRadialGradient(canvas.width / 2, 80, 10, canvas.width / 2, 80, 240);
    radial.addColorStop(0, 'rgba(245, 186, 49, 0.2)');
    radial.addColorStop(1, 'transparent');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Jersey Body Silhouette
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(140, 120); // neck left
    ctx.quadraticCurveTo(240, 150, 340, 120); // neck dip
    ctx.lineTo(430, 210); // right sleeve end
    ctx.lineTo(390, 260); // right sleeve under
    ctx.lineTo(360, 240); // right armpit
    ctx.lineTo(360, 520); // bottom right
    ctx.quadraticCurveTo(240, 535, 120, 520); // bottom curve
    ctx.lineTo(120, 240); // left armpit
    ctx.lineTo(90, 260);  // left sleeve under
    ctx.lineTo(50, 210);  // left sleeve end
    ctx.closePath();

    ctx.fillStyle = isHome ? '#101015' : '#FBF8EE';
    ctx.fill();
    ctx.strokeStyle = '#F5BA31';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Jersey Shoulder Stripes
    ctx.strokeStyle = '#F5BA31';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(150, 126); ctx.lineTo(60, 216);
    ctx.moveTo(160, 128); ctx.lineTo(70, 218);
    ctx.moveTo(330, 126); ctx.lineTo(420, 216);
    ctx.moveTo(320, 128); ctx.lineTo(410, 218);
    ctx.stroke();

    // Collar Trim
    ctx.beginPath();
    ctx.moveTo(140, 120);
    ctx.quadraticCurveTo(240, 150, 340, 120);
    ctx.strokeStyle = '#F5BA31';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Player Name Text (Arching)
    ctx.fillStyle = isHome ? '#FBF8EE' : '#101015';
    ctx.font = '900 32px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, canvas.width / 2, 230);

    // Jersey Big Number
    ctx.fillStyle = '#F5BA31';
    ctx.font = '900 150px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(num, canvas.width / 2, 380);

    // Club Text on lower back
    ctx.fillStyle = isHome ? 'rgba(251, 248, 238, 0.4)' : 'rgba(16, 16, 21, 0.4)';
    ctx.font = '800 14px Outfit, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('LAMBALL VFC', canvas.width / 2, 470);

    ctx.restore();
  }

  // Draw once font is ready
  setTimeout(drawJersey, 200);

  nameInput.addEventListener('input', drawJersey);
  numInput.addEventListener('input', drawJersey);

  kitBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      kitBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentJerseyKit = btn.dataset.kit;
      drawJersey();
    });
  });

  btnDownload.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `lamball_vfc_jersey_${nameInput.value || 'fans'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

/* ============================================================
   10. TRIAL FORM SUBMISSION
   ============================================================ */
function initTrialForm() {
  const form = document.getElementById('trialForm');
  const alertBox = document.getElementById('trialFormAlert');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitTrial');
    btn.disabled = true;
    btn.textContent = '⏳ Mengirim...';
    alertBox.style.display = 'none';

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch('/api/clubs/' + CURRENT_SLUG + '/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        alertBox.className = 'form-alert success';
        alertBox.textContent = '✅ Pendaftaran berhasil! Tim kami akan menghubungi kamu lewat Discord.';
        form.reset();
      } else {
        alertBox.className = 'form-alert error';
        alertBox.textContent = '❌ ' + (data.message || 'Gagal mengirim pendaftaran.');
      }
    } catch (err) {
      alertBox.className = 'form-alert error';
      alertBox.textContent = '❌ Terjadi kesalahan jaringan. Coba lagi.';
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Kirim Formulir Pendaftaran Trial';
    }
  });
}

/* ============================================================
   11. COMMUNITY STREAMERS
   ============================================================ */
function renderCommunityStreamers() {
  if (!CLUB_DATA || !CLUB_DATA.socials || !CLUB_DATA.socials.streamers) return;
  const container = document.getElementById('streamersGrid');
  if (!container) return;

  container.innerHTML = CLUB_DATA.socials.streamers.map(s => `
    <div class="streamer-card">
      <div class="streamer-info">
        <b>${s.name}</b>
        <span>${s.platform}: ${s.handle}</span>
      </div>
      <a href="${s.url}" target="_blank" rel="noopener" class="streamer-link">Tonton</a>
    </div>
  `).join('');
}

/* ============================================================
   12. MODAL SYSTEM
   ============================================================ */
function initModals() {
  const playerModal = document.getElementById('playerModal');
  const videoModal = document.getElementById('videoModal');

  document.getElementById('btnClosePlayerModal')?.addEventListener('click', () => playerModal.classList.remove('open'));
  document.getElementById('btnCloseVideoModal')?.addEventListener('click', () => {
    videoModal.classList.remove('open');
    document.getElementById('videoContainer').innerHTML = '';
  });

  window.addEventListener('click', (e) => {
    if (e.target === playerModal) playerModal.classList.remove('open');
    if (e.target === videoModal) {
      videoModal.classList.remove('open');
      document.getElementById('videoContainer').innerHTML = '';
    }
  });
}

window.openPlayerModal = function(playerId) {
  const player = PLAYERS.find(p => p.id === playerId);
  if (!player) return;

  const modal = document.getElementById('playerModal');
  const body = document.getElementById('playerModalBody');

  body.innerHTML = `
    <div class="player-modal-layout">
      <div>
        ${generateFutCardHtml(player)}
      </div>

      <div>
        <div class="modal-player-header">
          <h2>#${player.number} ${player.name} ${player.isCaptain ? '<span style="color:var(--gold-primary);">(Captain)</span>' : ''}</h2>
          <div class="modal-player-realname">Nama Lengkap: <b>${player.realName}</b> · ${player.countryName}</div>
        </div>

        <p class="modal-bio">${player.bio}</p>

        <div class="modal-stats-grid">
          <div class="modal-stat-box">
            <b>${player.main}</b>
            <span>Laga Main</span>
          </div>
          <div class="modal-stat-box">
            <b>${player.gol}</b>
            <span>Total Gol</span>
          </div>
          <div class="modal-stat-box">
            <b>${player.assist}</b>
            <span>Total Assist</span>
          </div>
          <div class="modal-stat-box">
            <b>${player.rating}</b>
            <span>Rating EA</span>
          </div>
          <div class="modal-stat-box">
            <b>${player.winRate}%</b>
            <span>Win Rate</span>
          </div>
          <div class="modal-stat-box">
            <b>${player.motmMusim}x</b>
            <span>Man of the Match</span>
          </div>
        </div>

        <div style="background:var(--bg-card); padding:14px; border-radius:10px; border:1px solid var(--border-subtle); margin-bottom:14px;">
          <h4 style="font-size:12px; color:var(--gold-primary); text-transform:uppercase; margin-bottom:8px;">Akurasi & Permainan</h4>
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span>Akurasi Passing:</span> <b>${player.passAkurasi}%</b>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span>Akurasi Tekel:</span> <b>${player.tekelAkurasi}%</b>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:13px;">
            <span>Akurasi Tembakan:</span> <b>${player.tembakanAkurasi}%</b>
          </div>
        </div>

        ${player.pos === 'GK' && player.saveRinci ? `
          <div style="background:var(--bg-card); padding:14px; border-radius:10px; border:1px solid var(--border-subtle);">
            <h4 style="font-size:12px; color:var(--gold-primary); text-transform:uppercase; margin-bottom:8px;">Rincian Penyelamatan Kiper (Saves: ${player.saves})</h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12.5px;">
              <div>Refleks: <b>${player.saveRinci.reflex}</b></div>
              <div>Diving: <b>${player.saveRinci.diving}</b></div>
              <div>Parry: <b>${player.saveRinci.parry}</b></div>
              <div>Punch: <b>${player.saveRinci.punch}</b></div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  modal.classList.add('open');
};
