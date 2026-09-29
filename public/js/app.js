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
  await loadAllData();
  initJerseyGenerator();
  initTrialForm();
  initModals();
});

/* ============================================================
   1. DATA FETCHING
   ============================================================ */
async function loadAllData() {
  try {
    const [clubRes, playersRes, matchesRes] = await Promise.all([
      fetch('/api/club').then(r => r.json()),
      fetch('/api/players').then(r => r.json()),
      fetch('/api/matches').then(r => r.json())
    ]);

    if (clubRes.success) CLUB_DATA = clubRes.data;
    if (playersRes.success) PLAYERS = playersRes.data;
    if (matchesRes.success) MATCHES = matchesRes.data;

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

/* ============================================================
   2. NAVIGATION & TABS
   ============================================================ */
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
    document.getElementById('kpiMatches').textContent = c.stats.matches;
    document.getElementById('kpiWinRate').textContent = c.stats.winRate + '%';
    document.getElementById('kpiGoals').textContent = c.stats.goalsFor;
    document.getElementById('kpiCleanSheets').textContent = c.stats.cleanSheets;
    document.getElementById('kpiSkill').textContent = c.stats.skillRating.toLocaleString('id-ID');
  }

  // Next Match
  if (c.nextMatch) {
    document.getElementById('nextMatchComp').textContent = c.nextMatch.tournament || 'Friendly Match';
    document.getElementById('nextOpponentName').textContent = (c.nextMatch.opponent || 'OPPONENT').toUpperCase();
    document.getElementById('nextOpponentCrest').querySelector('span').textContent = (c.nextMatch.opponent || 'O').charAt(0).toUpperCase();

    const kickoff = new Date(c.nextMatch.date);
    document.getElementById('kickoffTime').textContent = '📅 ' + kickoff.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) + ' WIB';

    startCountdown(kickoff);
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

  const photoHtml = player.photo
    ? `<img src="${player.photo}" alt="${player.name}" class="card-photo-img">`
    : `<img src="/images/logo.jpeg" alt="Avatar" class="card-photo-placeholder">`;

  const flagEmoji = player.countryCode === 'br' ? '🇧🇷' : '🇮🇩';

  return `
    <div class="fut-card-wrapper" data-player-id="${player.id}">
      <div class="fut-card">
        <div class="card-header-badge">
          <div class="card-ovr">${player.ovr}</div>
          <div class="card-pos">${player.pos}</div>
          <span class="card-flag">${flagEmoji}</span>
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
  if (!layer) return;

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

  if (btnStarters && btnSubs) {
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

  const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

  let list = [...PLAYERS];
  if (query) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.realName.toLowerCase().includes(query) ||
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
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', () => renderStatsTable());
  }

  // Setup Table Header Sort
  document.querySelectorAll('#statsTable th.sortable').forEach(th => {
    if (!th.dataset.bound) {
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
function renderMatchesList() {
  const container = document.getElementById('matchesList');
  if (!container) return;

  container.innerHTML = MATCHES.map((m, idx) => {
    const isWin = m.result === 'win';
    const isDraw = m.result === 'draw';
    const resultText = isWin ? 'MENANG' : (isDraw ? 'SERI' : 'KALAH');

    const d = new Date(m.date);
    const dateFormatted = d.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) + ' WIB';

    return `
      <div class="match-item ${m.result}" id="match-${m.id}">
        <div class="match-item-bar" onclick="toggleMatchDetail('${m.id}')">
          <div class="match-result-indicator"></div>
          
          <div class="match-item-meta">
            <span class="match-item-comp">${m.competition}</span>
            <div class="match-item-teams">
              Lamball VFC <span style="color:var(--gold-primary);">${m.scoreHome} - ${m.scoreAway}</span> ${m.opponent}
            </div>
            <span class="match-item-date">📅 ${dateFormatted} · MOTM: <b>${m.motm}</b></span>
          </div>

          <div class="match-item-actions">
            ${m.highlightUrl ? `
              <button class="btn-highlight-play" onclick="event.stopPropagation(); playHighlight('${m.highlightUrl}')">
                🎥 Tonton Highlight
              </button>
            ` : ''}
            <span class="match-expand-arrow">▶</span>
          </div>
        </div>

        <!-- Detail Drawer -->
        <div class="match-detail-drawer">
          <div class="match-stats-grid">
            <div>
              <h4 style="font-size:13px; color:var(--gold-primary); margin-bottom:12px; text-transform:uppercase;">📊 Statistik Siaran Laga</h4>
              
              <div class="tv-stat-row">
                <div class="tv-stat-labels">
                  <b>${m.stats.shotsHome}</b>
                  <span>Total Tembakan</span>
                  <b>${m.stats.shotsAway}</b>
                </div>
                <div class="tv-stat-bar-track">
                  <div class="tv-bar-home" style="width: ${(m.stats.shotsHome / (m.stats.shotsHome + m.stats.shotsAway)) * 100}%;"></div>
                  <div class="tv-bar-away" style="width: ${(m.stats.shotsAway / (m.stats.shotsHome + m.stats.shotsAway)) * 100}%;"></div>
                </div>
              </div>

              <div class="tv-stat-row">
                <div class="tv-stat-labels">
                  <b>${m.stats.possessionHome}%</b>
                  <span>Penguasaan Bola</span>
                  <b>${m.stats.possessionAway}%</b>
                </div>
                <div class="tv-stat-bar-track">
                  <div class="tv-bar-home" style="width: ${m.stats.possessionHome}%;"></div>
                  <div class="tv-bar-away" style="width: ${m.stats.possessionAway}%;"></div>
                </div>
              </div>

              <div class="tv-stat-row">
                <div class="tv-stat-labels">
                  <b>${m.stats.tacklesHome}</b>
                  <span>Tekel Sukses</span>
                  <b>${m.stats.tacklesAway}</b>
                </div>
                <div class="tv-stat-bar-track">
                  <div class="tv-bar-home" style="width: ${(m.stats.tacklesHome / (m.stats.tacklesHome + m.stats.tacklesAway)) * 100}%;"></div>
                  <div class="tv-bar-away" style="width: ${(m.stats.tacklesAway / (m.stats.tacklesHome + m.stats.tacklesAway)) * 100}%;"></div>
                </div>
              </div>
            </div>

            <div>
              <h4 style="font-size:13px; color:var(--gold-primary); margin-bottom:12px; text-transform:uppercase;">⚽ Pencetak Gol Lamball</h4>
              <div class="scorers-list">
                ${(m.scorers && m.scorers.length) ? m.scorers.map(sc => `
                  <div style="margin-bottom:6px;">
                    ⏱️ ${sc.minute}' — <b>${sc.player}</b> ${sc.assist ? `<small style="color:var(--text-dim);">(Assist: ${sc.assist})</small>` : ''}
                  </div>
                `).join('') : '<div style="color:var(--text-dim);">Tidak ada catatan gol.</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleMatchDetail = function(matchId) {
  const el = document.getElementById('match-' + matchId);
  if (el) el.classList.toggle('open');
};

window.playHighlight = function(url) {
  const modal = document.getElementById('videoModal');
  const container = document.getElementById('videoContainer');
  if (!modal || !container) return;

  // Check if youtube link
  let embedUrl = url;
  if (url.includes('youtube.com/watch?v=')) {
    const videoId = url.split('v=')[1]?.split('&')[0];
    embedUrl = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
  } else if (url.includes('youtu.be/')) {
    const videoId = url.split('youtu.be/')[1];
    embedUrl = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
  }

  container.innerHTML = `<iframe src="${embedUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  modal.classList.add('open');
};

/* ============================================================
   9. JERSEY CANVAS GENERATOR
   ============================================================ */
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
      const res = await fetch('/api/trials', {
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
