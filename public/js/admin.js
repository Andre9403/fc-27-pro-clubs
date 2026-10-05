/* ============================================================
   MULTI-CLUB ADMIN LOGIC (admin.js)
   Scoped by URL slug: /:slug/admin/
   Locks Club ID, handles EA Live Sync, Theme Customization,
   Player Overrides (OVR, Photo, Bio), Match Clips, and Trials.
   ============================================================ */

// 1. Deteksi Slug Klub dari URL
const pathSegments = window.location.pathname.split('/').filter(Boolean);
const CURRENT_SLUG = pathSegments[0] || '654678-lamball-vfc';

let CLUB_DATA = null;
let PLAYERS = [];
let MATCHES = [];
let TRIALS = [];
let CURRENT_PIN = sessionStorage.getItem('admin_pin_' + CURRENT_SLUG) || '';

// Theme Presets
const THEME_PRESETS = {
  gold: {
    preset: 'gold',
    primary: '#F5BA31',
    light: '#FFD966',
    glow: '#FFD242',
    bgDeep: '#0A0A0E',
    bgSurface: '#12121A',
    bgCard: '#181822',
    text: '#FBF8EE'
  },
  red: {
    preset: 'red',
    primary: '#E74C3C',
    light: '#FF7675',
    glow: '#FF5252',
    bgDeep: '#0D0808',
    bgSurface: '#181010',
    bgCard: '#221515',
    text: '#FFF5F5'
  },
  blue: {
    preset: 'blue',
    primary: '#00D2D3',
    light: '#54A0FF',
    glow: '#48DBFB',
    bgDeep: '#080C14',
    bgSurface: '#0E1522',
    bgCard: '#141E30',
    text: '#F0F8FF'
  },
  green: {
    preset: 'green',
    primary: '#2ECC71',
    light: '#55EFC4',
    glow: '#20BF6B',
    bgDeep: '#08140E',
    bgSurface: '#0E1F16',
    bgCard: '#142B20',
    text: '#F0FFF4'
  },
  purple: {
    preset: 'purple',
    primary: '#9B59B6',
    light: '#D980FA',
    glow: '#8854D0',
    bgDeep: '#0F0A14',
    bgSurface: '#17101E',
    bgCard: '#22182B',
    text: '#FAF5FF'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initAuth();
  initPlayerModal();
  initSyncEa();
  initNewMatchManager();
  initThemeManager();
  initConfigForm();
});

/* ------------------------------------------------------------
   1. AUTH & PIN
   ------------------------------------------------------------ */
function initAuth() {
  const overlay = document.getElementById('loginOverlay');
  const wrapper = document.getElementById('adminWrapper');
  const loginForm = document.getElementById('loginForm');
  const pinInput = document.getElementById('adminPinInput');
  const alertBox = document.getElementById('loginAlert');
  const btnLogout = document.getElementById('btnLogout');

  if (CURRENT_PIN) {
    verifyPin(CURRENT_PIN, false);
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = pinInput.value.trim();
    await verifyPin(pin, true);
  });

  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('admin_pin_' + CURRENT_SLUG);
    CURRENT_PIN = '';
    window.location.reload();
  });

  async function verifyPin(pin, showAlert) {
    try {
      const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();

      if (data.success) {
        CURRENT_PIN = pin;
        sessionStorage.setItem('admin_pin_' + CURRENT_SLUG, pin);
        overlay.style.display = 'none';
        wrapper.style.display = 'block';
        await loadAllAdminData();
      } else {
        if (showAlert) {
          alertBox.textContent = data.message || 'PIN Salah!';
          alertBox.className = 'alert-status error';
          alertBox.style.display = 'block';
        }
      }
    } catch (err) {
      if (showAlert) {
        alertBox.textContent = 'Gagal menghubungi server.';
        alertBox.className = 'alert-status error';
        alertBox.style.display = 'block';
      }
    }
  }
}

/* ------------------------------------------------------------
   2. DATA LOADING & TABS
   ------------------------------------------------------------ */
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const target = tab.dataset.tab;
      const targetPane = document.getElementById(target);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

async function loadAllAdminData() {
  try {
    const res = await fetch(`/api/clubs/${CURRENT_SLUG}/data`);
    const json = await res.json();

    if (!json.success || !json.data) return;

    CLUB_DATA = json.data;
    PLAYERS = json.data.players || [];
    MATCHES = json.data.matches || [];

    // Update Header
    const club = CLUB_DATA.club || {};
    document.title = 'Admin Dashboard — ' + (club.name || 'Pro Club');
    document.getElementById('topbarClubName').textContent = club.name || 'Admin Dashboard';
    document.getElementById('topbarClubLogo').src = club.logo || '/images/logo.jpeg';
    document.getElementById('loginClubTitle').textContent = 'Admin ' + (club.name || '');
    document.getElementById('loginClubLogo').src = club.logo || '/images/logo.jpeg';
    document.getElementById('linkBackToClub').href = '/' + CURRENT_SLUG + '/';

    // Lock Club ID Badge
    document.getElementById('lockedClubIdBadge').textContent = club.eaClubId || 'Belum Terdaftar';
    document.getElementById('lockedPlatformBadge').textContent = club.platform || 'common-gen5';

    // Render Data
    renderPlayersTable();
    renderMatchesList();
    loadTrials();
    populateConfigForm();
    populateThemeValues(CLUB_DATA.theme);

  } catch (err) {
    console.error('Error loading admin data:', err);
  }
}

/* ------------------------------------------------------------
   3. TAB PEMAIN & MODAL EDIT
   ------------------------------------------------------------ */
function renderPlayersTable() {
  const tbody = document.getElementById('playersTableBody');

  const kpiSquad = document.getElementById('kpiSquadCount');
  if (kpiSquad) kpiSquad.textContent = `${PLAYERS.length} Pemain`;

  const kpiStarters = document.getElementById('kpiStartersCount');
  if (kpiStarters) {
    const starterCount = PLAYERS.filter(p => p.isStartingXI).length;
    kpiStarters.textContent = `${starterCount || 11} Pemain`;
  }

  const kpiDiv = document.getElementById('kpiDivisionName');
  if (kpiDiv) {
    kpiDiv.textContent = (CLUB_DATA && CLUB_DATA.club && CLUB_DATA.club.divisionName) ? CLUB_DATA.club.divisionName : 'Division 1';
  }
  if (!PLAYERS.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px;">Belum ada pemain terdaftar.</td></tr>';
    return;
  }

  tbody.innerHTML = PLAYERS.map(p => {
    const avatarHtml = p.photo
      ? `<img src="${p.photo}" alt="${p.name}" class="table-player-thumb" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="table-player-avatar-placeholder" style="display:none;"><span class="pos-tag">${p.pos}</span><span class="avatar-icon">👤</span></div>`
      : `<div class="table-player-avatar-placeholder"><span class="pos-tag">${p.pos}</span><span class="avatar-icon">👤</span></div>`;

    return `
    <tr>
      <td>${avatarHtml}</td>
      <td>
        <div style="font-weight:700; color:var(--text-main);">${p.realName || p.name}</div>
        <div style="font-size:12px; color:var(--text-muted);">EA ID: ${p.eaId || '-'}</div>
      </td>
      <td><span class="badge-pos badge-${p.pos}">${p.pos}</span></td>
      <td><b style="color:var(--gold-light); font-size:15px;">${p.ovr || 85}</b></td>
      <td><b>#${p.number || '-'}</b></td>
      <td>${p.isStartingXI ? '<span style="color:#2ECC71;">✓ Starter</span>' : '<span style="color:var(--text-dim);">-</span>'}</td>
      <td>${p.isCaptain ? '<span style="color:var(--gold-primary); font-weight:800;">(C)</span>' : '<span style="color:var(--text-dim);">-</span>'}</td>
      <td style="font-size:12px; color:var(--text-muted);">
        ${p.main || 0} Main · ${p.gol || 0} Gol · ${p.assist || 0} Ast · ${p.rating || 0} Rtg
      </td>
      <td>
        <button type="button" class="btn-edit-sm" onclick="openEditPlayerModal('${p.id}')">✏️ Edit</button>
      </td>
    </tr>
    `;
  }).join('');
}

function initPlayerModal() {
  const modal = document.getElementById('editPlayerModal');
  const btnClose = document.getElementById('btnCloseEditPlayer');
  const form = document.getElementById('editPlayerForm');
  const photoInput = document.getElementById('editPhotoInput');
  const photoPreview = document.getElementById('editPhotoPreview');
  const alertBox = document.getElementById('editPlayerAlert');

  btnClose.addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => { photoPreview.src = e.target.result; };
      reader.readAsDataURL(file);
    }
  });

  window.openEditPlayerModal = function(id) {
    const p = PLAYERS.find(x => x.id === id);
    if (!p) return;

    document.getElementById('editPlayerId').value = p.id;
    document.getElementById('editPlayerTitle').textContent = 'Edit Pemain: ' + (p.realName || p.name);
    document.getElementById('editNumber').value = p.number || '';
    document.getElementById('editOvr').value = p.ovr || 85;
    document.getElementById('editRealName').value = p.realName || p.name || '';
    document.getElementById('editRole').value = p.role || '';
    document.getElementById('editBio').value = p.bio || '';
    document.getElementById('editIsStartingXI').checked = !!p.isStartingXI;
    document.getElementById('editIsCaptain').checked = !!p.isCaptain;
    photoPreview.src = p.photo || '/images/logo.jpeg';
    photoInput.value = '';
    alertBox.style.display = 'none';

    modal.style.display = 'flex';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editPlayerId').value;
    const formData = new FormData();

    formData.append('realName', document.getElementById('editRealName').value.trim());
    formData.append('number', document.getElementById('editNumber').value);
    formData.append('ovr', document.getElementById('editOvr').value);
    formData.append('role', document.getElementById('editRole').value.trim());
    formData.append('bio', document.getElementById('editBio').value.trim());
    formData.append('isStartingXI', document.getElementById('editIsStartingXI').checked);
    formData.append('isCaptain', document.getElementById('editIsCaptain').checked);

    if (photoInput.files[0]) {
      formData.append('photo', photoInput.files[0]);
    }

    try {
      const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/player/${id}`, {
        method: 'POST',
        headers: { 'x-admin-pin': CURRENT_PIN },
        body: formData
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Respon server (${res.status}): ${text.slice(0, 100)}`);
      }

      if (json.success) {
        alertBox.className = 'alert-status success';
        alertBox.textContent = 'Data pemain berhasil disimpan!';
        alertBox.style.display = 'block';
        await loadAllAdminData();
        setTimeout(() => { modal.style.display = 'none'; }, 1000);
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      alertBox.className = 'alert-status error';
      alertBox.textContent = 'Gagal menyimpan: ' + err.message;
      alertBox.style.display = 'block';
    }
  });
}

/* ------------------------------------------------------------
   4. TAB LAGA & HIGHLIGHT
   ------------------------------------------------------------ */
function renderMatchesList() {
  const container = document.getElementById('matchesListAdmin');
  if (!container) return;

  populateMotmDropdown();

  if (!MATCHES.length) {
    container.innerHTML = '<div style="text-align:center; padding:32px; color:var(--text-muted);">Belum ada riwayat pertandingan tercatat. Klik tombol di atas untuk mencatat laga pertama!</div>';
    return;
  }

  container.innerHTML = MATCHES.map(m => {
    const isWin = (m.result || '').toLowerCase() === 'win';
    const isDraw = (m.result || '').toLowerCase() === 'draw';
    const statusBadge = isWin 
      ? '<span style="color:#2ECC71; font-weight:800;">MENANG (W)</span>' 
      : (isDraw ? '<span style="color:#F1C40F; font-weight:800;">SERI (D)</span>' : '<span style="color:#E74C3C; font-weight:800;">KALAH (L)</span>');

    const d = new Date(m.date);
    const dateFormatted = d.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) + ' WIB';

    const scorersSummary = (m.scorers || [])
      .filter(s => s.type === 'goal' || !s.type)
      .map(s => s.minute ? `${s.player} (${s.minute}')` : s.player)
      .join(', ');

    return `
      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:12px; padding:16px 20px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div style="flex:1; min-width:280px;">
          <div style="font-size:12px; color:var(--gold-light); font-weight:700;">${m.competition || 'Kompetisi'} · ${dateFormatted}</div>
          <div style="font-size:18px; font-weight:800; color:var(--text-main); margin:4px 0;">
            vs ${m.opponent || 'Lawan'} — <span style="color:var(--gold-primary);">${m.scoreHome} - ${m.scoreAway}</span> (${statusBadge})
          </div>
          <div style="font-size:12.5px; color:var(--text-muted);">
            ⚽ Gol: ${scorersSummary || 'Tidak ada'} ${m.motm ? `· ⭐ MOTM: <b>${m.motm}</b>` : ''}
          </div>
        </div>

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <div style="display:flex; gap:6px;">
            <input type="text" id="hl_${m.id}" value="${m.highlightUrl || ''}" placeholder="Link highlight YouTube..." class="admin-input" style="font-size:12px; width:220px;">
            <button type="button" class="btn-save" style="padding:8px 12px; font-size:12px;" onclick="saveMatchHighlight('${m.id}')">💾 Simpan Klip</button>
          </div>
          <button type="button" class="btn-edit-sm" style="color:#E74C3C; border-color:rgba(231,76,60,0.4); padding:8px 12px; font-size:12px;" onclick="deleteMatch('${m.id}')">🗑️ Hapus</button>
        </div>
      </div>
    `;
  }).join('');
}

function populateMotmDropdown() {
  const motmSelect = document.getElementById('mMotmSelect');
  if (!motmSelect) return;

  const currentVal = motmSelect.value;
  motmSelect.innerHTML = '<option value="">-- Pilih Pemain MOTM --</option>' + 
    PLAYERS.map(p => `<option value="${p.name}">${p.name} (${p.pos})</option>`).join('');
  if (currentVal) motmSelect.value = currentVal;
}

window.deleteMatch = async function(matchId) {
  if (!confirm('Yakin ingin menghapus catatan pertandingan ini?')) return;

  try {
    const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/matches/${matchId}`, {
      method: 'DELETE',
      headers: { 'x-admin-pin': CURRENT_PIN }
    });
    const json = await res.json();
    if (json.success) {
      await loadAllAdminData();
    } else {
      alert(json.message);
    }
  } catch (err) {
    alert('Gagal menghapus laga: ' + err.message);
  }
};

function initNewMatchManager() {
  const btnToggle = document.getElementById('btnToggleNewMatchForm');
  const card = document.getElementById('newMatchCard');
  const btnClose = document.getElementById('btnCloseNewMatchCard');
  const btnCancel = document.getElementById('btnCancelNewMatch');
  const form = document.getElementById('newMatchForm');
  const alertBox = document.getElementById('newMatchAlert');
  const btnAddScorer = document.getElementById('btnAddScorerRow');
  const scorersList = document.getElementById('scorersInputsList');

  if (btnToggle && card) {
    btnToggle.addEventListener('click', () => {
      card.style.display = card.style.display === 'none' ? 'block' : 'none';
      if (card.style.display === 'block') {
        populateMotmDropdown();
        // Set default date to now
        const now = new Date();
        const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        document.getElementById('mDate').value = localIso;
      }
    });
  }

  if (btnClose) btnClose.addEventListener('click', () => { card.style.display = 'none'; });
  if (btnCancel) btnCancel.addEventListener('click', () => { card.style.display = 'none'; });

  // Add Dynamic Scorer Row
  if (btnAddScorer && scorersList) {
    btnAddScorer.addEventListener('click', () => {
      const rowId = 'sc_' + Date.now();
      const div = document.createElement('div');
      div.id = rowId;
      div.style.cssText = 'display:flex; gap:10px; align-items:center;';

      const options = PLAYERS.map(p => `<option value="${p.name}">${p.name} (${p.pos})</option>`).join('');

      div.innerHTML = `
        <input type="number" class="admin-input sc-minute" placeholder="Menit (misal: 18)" style="width:120px;" min="1" max="120" value="18">
        <select class="admin-select sc-player" style="flex:1;">
          <option value="">-- Pencetak Gol --</option>
          ${options}
        </select>
        <select class="admin-select sc-assist" style="flex:1;">
          <option value="">-- Pemberi Assist (Opsional) --</option>
          ${options}
        </select>
        <button type="button" class="btn-edit-sm" style="color:#E74C3C;" onclick="document.getElementById('${rowId}').remove()">✕</button>
      `;

      scorersList.appendChild(div);
    });
  }

  // Submit Match
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const opponent = document.getElementById('mOpponent').value.trim();
      const competition = document.getElementById('mCompetition').value.trim();
      const scoreHome = Number(document.getElementById('mScoreHome').value) || 0;
      const scoreAway = Number(document.getElementById('mScoreAway').value) || 0;
      const date = new Date(document.getElementById('mDate').value).toISOString();
      const motm = document.getElementById('mMotmSelect').value;
      const highlightUrl = document.getElementById('mHighlightUrl').value.trim();

      const possHome = Number(document.getElementById('mPossHome').value) || 50;
      const shotsHome = Number(document.getElementById('mShotsHome').value) || 10;
      const shotsAway = Number(document.getElementById('mShotsAway').value) || 8;
      const tacklesHome = Number(document.getElementById('mTacklesHome').value) || 15;

      // Extract scorers
      const scorerRows = document.querySelectorAll('#scorersInputsList > div');
      const scorers = [];
      scorerRows.forEach(row => {
        const minute = Number(row.querySelector('.sc-minute').value) || 0;
        const player = row.querySelector('.sc-player').value;
        const assist = row.querySelector('.sc-assist').value;
        if (player) {
          scorers.push({ minute, player, assist, type: 'goal' });
        }
      });

      const payload = {
        opponent,
        competition,
        scoreHome,
        scoreAway,
        date,
        motm,
        motmRating: 9.0,
        highlightUrl,
        stats: {
          possessionHome: possHome,
          possessionAway: 100 - possHome,
          shotsHome,
          shotsAway,
          shotsOnTargetHome: Math.max(1, scoreHome + 3),
          shotsOnTargetAway: Math.max(1, scoreAway + 2),
          tacklesHome,
          tacklesAway: 14,
          passSuccessHome: 85,
          passSuccessAway: 80,
          cornersHome: 5,
          cornersAway: 3,
          foulsHome: 4,
          foulsAway: 5
        },
        scorers,
        lineup: PLAYERS.slice(0, 11).map((p, i) => ({
          name: p.name,
          pos: p.pos,
          rating: p.name === motm ? 9.2 : (7.2 + (i % 3) * 0.4),
          motm: p.name === motm
        }))
      };

      try {
        const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/matches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-pin': CURRENT_PIN
          },
          body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (json.success) {
          alertBox.style.display = 'block';
          alertBox.className = 'alert-status success';
          alertBox.textContent = 'Pertandingan berhasil dicatat ke sistem!';
          form.reset();
          scorersList.innerHTML = '';
          await loadAllAdminData();
          setTimeout(() => {
            card.style.display = 'none';
            alertBox.style.display = 'none';
          }, 1200);
        } else {
          throw new Error(json.message);
        }
      } catch (err) {
        alertBox.style.display = 'block';
        alertBox.className = 'alert-status error';
        alertBox.textContent = 'Gagal menyimpan: ' + err.message;
      }
    });
  }
}

window.saveMatchHighlight = async function(matchId) {
  const input = document.getElementById('hl_' + matchId);
  const highlightUrl = input.value.trim();

  try {
    const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/match/${matchId}/highlight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': CURRENT_PIN
      },
      body: JSON.stringify({ highlightUrl })
    });
    const json = await res.json();
    if (json.success) {
      alert('Link highlight laga berhasil disimpan!');
    }
  } catch (err) {
    alert('Gagal menyimpan link highlight: ' + err.message);
  }
};

/* ------------------------------------------------------------
   5. TAB TRIAL
   ------------------------------------------------------------ */
async function loadTrials() {
  const tbody = document.getElementById('trialsTableBody');
  try {
    const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/trials`, {
      headers: { 'x-admin-pin': CURRENT_PIN }
    });
    const json = await res.json();
    TRIALS = json.data || [];

    if (!TRIALS.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px;">Belum ada pendaftaran trial.</td></tr>';
      return;
    }

    tbody.innerHTML = TRIALS.map(t => `
      <tr>
        <td style="font-size:12px; color:var(--text-muted);">${new Date(t.appliedAt).toLocaleDateString('id-ID')}</td>
        <td><b>${t.eaId}</b></td>
        <td><code style="color:var(--gold-light);">${t.discordTag}</code></td>
        <td><span class="badge-pos badge-${t.primaryPos}">${t.primaryPos}</span></td>
        <td style="font-size:12.5px;">${t.archetype1 || '-'} (Lv.${t.level1 || '-'})</td>
        <td style="font-size:12px; color:var(--text-muted); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.experience || '-'}</td>
        <td>
          <span style="font-size:11px; font-weight:800; padding:4px 8px; border-radius:6px; background:${t.status === 'accepted' ? 'rgba(46,204,113,0.2)' : t.status === 'rejected' ? 'rgba(231,76,60,0.2)' : 'rgba(241,196,15,0.2)'}; color:${t.status === 'accepted' ? '#2ECC71' : t.status === 'rejected' ? '#E74C3C' : '#F1C40F'};">
            ${t.status.toUpperCase()}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-edit-sm" style="color:#2ECC71;" onclick="updateTrialStatus('${t.id}', 'accepted')">Terima</button>
            <button class="btn-edit-sm" style="color:#E74C3C;" onclick="updateTrialStatus('${t.id}', 'rejected')">Tolak</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading trials:', err);
  }
}

window.updateTrialStatus = async function(id, status) {
  try {
    const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/trials/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': CURRENT_PIN
      },
      body: JSON.stringify({ status })
    });
    const json = await res.json();
    if (json.success) {
      await loadTrials();
    }
  } catch (err) {
    alert('Gagal update trial: ' + err.message);
  }
};

/* ------------------------------------------------------------
   6. TAB EA SYNC (ID TERKUNCI) & RAW JSON IMPORT
   ------------------------------------------------------------ */
function initSyncEa() {
  const btnSync = document.getElementById('btnSyncEaNow');
  const alertBox = document.getElementById('eaSyncStatusAlert');
  const btnImportRaw = document.getElementById('btnImportRawJson');
  const rawInput = document.getElementById('rawJsonImportInput');
  const rawAlert = document.getElementById('rawJsonAlert');

  // Live Sync dari EA
  btnSync.addEventListener('click', async () => {
    btnSync.disabled = true;
    btnSync.innerHTML = '⏳ Menghubungi Server EA Sports FC...';
    alertBox.style.display = 'block';
    alertBox.className = 'alert-status';
    alertBox.style.background = 'rgba(245,186,49,0.1)';
    alertBox.style.color = 'var(--gold-light)';
    alertBox.textContent = 'Sedang mengambil statistik live member... Mohon tunggu.';

    try {
      const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/sync`, {
        method: 'POST',
        headers: { 'x-admin-pin': CURRENT_PIN }
      });
      const json = await res.json();

      if (json.success) {
        alertBox.className = 'alert-status success';
        alertBox.textContent = '✅ ' + json.message;
        await loadAllAdminData();
      } else {
        alertBox.className = 'alert-status error';
        alertBox.textContent = '⚠️ ' + (json.message || 'Sinkronisasi gagal.');
      }
    } catch (err) {
      alertBox.className = 'alert-status error';
      alertBox.textContent = 'Koneksi ke EA timeout/gagal: ' + err.message;
    } finally {
      btnSync.disabled = false;
      btnSync.innerHTML = '🔄 Tarik Data Sekarang (Live Sync)';
    }
  });

  // Raw JSON Fallback Import
  btnImportRaw.addEventListener('click', async () => {
    const rawJson = rawInput.value.trim();
    if (!rawJson) {
      alert('Tempelkan data JSON terlebih dahulu.');
      return;
    }

    btnImportRaw.disabled = true;
    btnImportRaw.textContent = 'Mengimpor...';

    try {
      const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/ea-import-json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': CURRENT_PIN
        },
        body: JSON.stringify({ rawJson })
      });
      const json = await res.json();

      if (json.success) {
        rawAlert.style.display = 'block';
        rawAlert.className = 'alert-status success';
        rawAlert.textContent = '✅ ' + json.message;
        rawInput.value = '';
        await loadAllAdminData();
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      rawAlert.style.display = 'block';
      rawAlert.className = 'alert-status error';
      rawAlert.textContent = 'Gagal import: ' + err.message;
    } finally {
      btnImportRaw.disabled = false;
      btnImportRaw.textContent = '📥 Impor JSON';
    }
  });
}

/* ------------------------------------------------------------
   7. TAB TEMA WARNA KLUB
   ------------------------------------------------------------ */
function initThemeManager() {
  const primaryInput = document.getElementById('themePrimaryInput');
  const lightInput = document.getElementById('themeLightInput');
  const glowInput = document.getElementById('themeGlowInput');
  const bgDeepInput = document.getElementById('themeBgDeepInput');
  const bgCardInput = document.getElementById('themeBgCardInput');
  const btnSave = document.getElementById('btnSaveTheme');
  const alertBox = document.getElementById('themeStatusAlert');

  // Preset Buttons
  const presetButtons = document.querySelectorAll('.btn-preset-select');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      const theme = THEME_PRESETS[presetKey];
      if (theme) {
        primaryInput.value = theme.primary;
        lightInput.value = theme.light;
        glowInput.value = theme.glow;
        bgDeepInput.value = theme.bgDeep;
        bgCardInput.value = theme.bgCard;
        updateLivePreview();
      }
    });
  });

  // Color Input Events -> Live Update Preview
  [primaryInput, lightInput, glowInput, bgDeepInput, bgCardInput].forEach(inp => {
    inp.addEventListener('input', updateLivePreview);
  });

  function updateLivePreview() {
    const primary = primaryInput.value;
    const light = lightInput.value;
    const glow = glowInput.value;
    const bgDeep = bgDeepInput.value;
    const bgCard = bgCardInput.value;

    const previewBox = document.getElementById('themePreviewBox');
    const previewBadge = document.getElementById('previewBadge');
    const previewCard = document.getElementById('previewCard');
    const previewOvrBadge = document.getElementById('previewOvrBadge');
    const previewPlayerPos = document.getElementById('previewPlayerPos');
    const previewButton = document.getElementById('previewButton');

    if (previewBox) {
      previewBox.style.background = bgDeep;
      previewBox.style.borderColor = primary + '55';
    }
    if (previewBadge) {
      previewBadge.style.background = primary + '25';
      previewBadge.style.color = light;
      previewBadge.style.borderColor = primary;
    }
    if (previewCard) {
      previewCard.style.background = bgCard;
      previewCard.style.borderColor = primary + '40';
    }
    if (previewOvrBadge) {
      previewOvrBadge.style.background = `linear-gradient(135deg, ${primary}, ${glow})`;
      previewOvrBadge.style.boxShadow = `0 0 16px ${glow}88`;
    }
    if (previewPlayerPos) {
      previewPlayerPos.style.color = light;
    }
    if (previewButton) {
      previewButton.style.background = `linear-gradient(135deg, ${primary}, ${light})`;
      previewButton.style.boxShadow = `0 4px 16px ${glow}55`;
    }
  }

  // Save Theme to Server
  btnSave.addEventListener('click', async () => {
    btnSave.disabled = true;
    btnSave.textContent = 'Menyimpan...';

    const theme = {
      primary: primaryInput.value,
      light: lightInput.value,
      glow: glowInput.value,
      bgDeep: bgDeepInput.value,
      bgCard: bgCardInput.value
    };

    try {
      const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/theme`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': CURRENT_PIN
        },
        body: JSON.stringify({ theme })
      });
      const json = await res.json();

      if (json.success) {
        alertBox.style.display = 'block';
        alertBox.className = 'alert-status success';
        alertBox.textContent = '✅ Tema warna berhasil disimpan dan diterapkan pada website!';
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      alertBox.style.display = 'block';
      alertBox.className = 'alert-status error';
      alertBox.textContent = 'Gagal menyimpan tema: ' + err.message;
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = '💾 Terapkan & Simpan Tema Warna';
    }
  });
}

function populateThemeValues(theme) {
  if (!theme) return;
  if (theme.primary) document.getElementById('themePrimaryInput').value = theme.primary;
  if (theme.light) document.getElementById('themeLightInput').value = theme.light;
  if (theme.glow) document.getElementById('themeGlowInput').value = theme.glow;
  if (theme.bgDeep) document.getElementById('themeBgDeepInput').value = theme.bgDeep;
  if (theme.bgCard) document.getElementById('themeBgCardInput').value = theme.bgCard;

  // Trigger preview update
  const evt = new Event('input');
  document.getElementById('themePrimaryInput').dispatchEvent(evt);
}

/* ------------------------------------------------------------
   8. TAB CONFIG & NEXT MATCH
   ------------------------------------------------------------ */
function populateConfigForm() {
  const club = CLUB_DATA?.club || {};
  const nextMatch = club.nextMatch || {};

  document.getElementById('cfgOpponent').value = nextMatch.opponent || '';
  document.getElementById('cfgTournament').value = nextMatch.tournament || '';
  if (nextMatch.date) {
    const d = new Date(nextMatch.date);
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('cfgDate').value = localIso;
  }
  document.getElementById('cfgMotto').value = club.motto || '';
}

function initConfigForm() {
  const form = document.getElementById('clubConfigForm');
  const alertBox = document.getElementById('configAlert');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const opponent = document.getElementById('cfgOpponent').value.trim();
    const tournament = document.getElementById('cfgTournament').value.trim();
    const date = new Date(document.getElementById('cfgDate').value).toISOString();
    const motto = document.getElementById('cfgMotto').value.trim();
    const newPin = document.getElementById('cfgNewAdminPin').value.trim();

    const payload = {
      nextMatch: { opponent, tournament, date },
      motto
    };
    if (newPin) {
      payload.adminPin = newPin;
    }

    try {
      const res = await fetch(`/api/clubs/${CURRENT_SLUG}/admin/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': CURRENT_PIN
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        if (newPin) {
          CURRENT_PIN = newPin;
          sessionStorage.setItem('admin_pin_' + CURRENT_SLUG, newPin);
        }
        alertBox.style.display = 'block';
        alertBox.className = 'alert-status success';
        alertBox.textContent = 'Pengaturan berhasil diperbarui!';
        await loadAllAdminData();
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      alertBox.style.display = 'block';
      alertBox.className = 'alert-status error';
      alertBox.textContent = 'Gagal menyimpan: ' + err.message;
    }
  });
}
