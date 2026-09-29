/* ============================================================
   PORTAL JAVASCRIPT — DISCOVERY, SEARCH & CLUB REGISTRATION
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadRegisteredClubs();
  initSearch();
  initRegisterModal();
  initThemeRadioStyling();
});

/* ------------------------------------------------------------
   1. LOAD REGISTERED CLUBS
   ------------------------------------------------------------ */
async function loadRegisteredClubs() {
  const grid = document.getElementById('clubsGrid');
  const countBadge = document.getElementById('clubsCountBadge');

  try {
    const res = await fetch('/api/portal/clubs');
    const json = await res.json();

    if (!json.success || !json.data || json.data.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>Belum ada klub yang terdaftar di platform.</p>
          <button class="btn-primary" style="margin-top:14px;" onclick="openRegisterModal()">Daftarkan Klub Pertama</button>
        </div>
      `;
      countBadge.textContent = '0 Klub';
      return;
    }

    countBadge.textContent = json.data.length + ' Klub Terdaftar';

    grid.innerHTML = json.data.map(club => {
      const stats = club.stats || {};
      const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;

      return `
        <div class="club-card">
          <div class="club-card-banner"></div>
          <div class="club-card-body">
            <div class="club-avatar-wrap">
              <img src="${club.logo}" alt="${club.name}" class="club-card-logo" onerror="this.src='/images/logo.jpeg'">
              <span class="club-platform-badge">${club.platform || 'common-gen5'}</span>
            </div>

            <h4 class="club-card-name">${club.name}</h4>
            <p class="club-card-motto">"${club.motto || 'Champions Never Quit'}"</p>

            <div class="club-card-stats">
              <div class="stat-item">
                <div class="val">${club.memberCount || 0}</div>
                <div class="lbl">Pemain</div>
              </div>
              <div class="stat-item">
                <div class="val">${stats.wins || 0}W - ${stats.losses || 0}L</div>
                <div class="lbl">Rekor</div>
              </div>
              <div class="stat-item">
                <div class="val">${winRate}%</div>
                <div class="lbl">Win Rate</div>
              </div>
            </div>

            <div class="club-card-actions">
              <a href="/${club.slug}/" class="btn-open-web">🌐 Buka Web</a>
              <a href="/${club.slug}/admin/" class="btn-open-admin">⚙️ Admin</a>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <p style="color:#FF7675;">Gagal memuat data klub terdaftar: ${err.message}</p>
      </div>
    `;
  }
}

/* ------------------------------------------------------------
   2. SEARCH EA CLUBS
   ------------------------------------------------------------ */
function initSearch() {
  const btn = document.getElementById('btnSearchEa');
  const input = document.getElementById('eaSearchInput');
  const platformSelect = document.getElementById('eaSearchPlatform');

  btn.addEventListener('click', () => performSearch());
  input.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  async function performSearch() {
    const q = input.value.trim();
    const platform = platformSelect.value;
    const statusBox = document.getElementById('searchStatus');
    const resultsGrid = document.getElementById('searchResultsList');

    if (!q) {
      statusBox.style.display = 'block';
      statusBox.className = 'search-status info';
      statusBox.textContent = 'Silakan ketik nama klub yang ingin dicari di in-game.';
      resultsGrid.innerHTML = '';
      return;
    }

    statusBox.style.display = 'block';
    statusBox.className = 'search-status loading';
    statusBox.textContent = `🔍 Mencari "${q}" di server EA Sports FC (${platform})...`;
    resultsGrid.innerHTML = '';

    try {
      const res = await fetch(`/api/ea/search?name=${encodeURIComponent(q)}&platform=${platform}`);
      const json = await res.json();

      if (!json.success || !json.data || json.data.length === 0) {
        statusBox.className = 'search-status info';
        statusBox.innerHTML = `Tidak ditemukan klub dengan nama "<b>${q}</b>" di server EA. Anda tetap bisa mendaftar secara manual.`;
        return;
      }

      statusBox.className = 'search-status loading';
      statusBox.style.background = 'rgba(46, 204, 113, 0.1)';
      statusBox.style.borderColor = 'rgba(46, 204, 113, 0.4)';
      statusBox.style.color = '#2ECC71';
      statusBox.textContent = `Ditemukan ${json.data.length} klub di server EA Sports FC:`;

      resultsGrid.innerHTML = json.data.map(c => {
        const clubName = c.clubInfo?.name || c.name || 'Klub EA';
        const clubId = c.clubId || c.clubInfo?.clubId || '';
        const wins = c.wins || 0;
        const losses = c.losses || 0;
        const ties = c.ties || 0;

        return `
          <div class="ea-result-card">
            <div class="ea-card-info">
              <h4>${clubName}</h4>
              <div class="ea-card-meta">
                <div>ID: <span>${clubId}</span></div>
                <div>Rekor: <span>${wins}W - ${ties}D - ${losses}L</span></div>
              </div>
            </div>
            <button type="button" class="btn-claim-club" onclick="prefillAndOpenRegister('${clubName}', '${clubId}', '${platform}')">
              ⚡ Daftarkan Klub
            </button>
          </div>
        `;
      }).join('');

    } catch (err) {
      statusBox.className = 'search-status error';
      statusBox.innerHTML = `Gagal terhubung ke API EA: ${err.message}. Server EA mungkin sedang sibuk, Anda tetap bisa mendaftar mandiri.`;
    }
  }
}

/* ------------------------------------------------------------
   3. REGISTER MODAL & SUBMIT
   ------------------------------------------------------------ */
window.openRegisterModal = function() {
  document.getElementById('registerModal').style.display = 'flex';
  document.getElementById('regClubName').focus();
};

window.prefillAndOpenRegister = function(name, id, platform) {
  document.getElementById('regClubName').value = name;
  document.getElementById('regClubId').value = id;
  if (platform) document.getElementById('regPlatform').value = platform;
  window.openRegisterModal();
};

function initRegisterModal() {
  const modal = document.getElementById('registerModal');
  const btnOpen = document.getElementById('btnOpenRegisterModal');
  const btnClose = document.getElementById('btnCloseRegisterModal');
  const btnCancel = document.getElementById('btnCancelRegister');
  const form = document.getElementById('registerClubForm');
  const alertBox = document.getElementById('registerAlert');
  const submitBtn = document.getElementById('btnSubmitRegister');

  btnOpen.addEventListener('click', () => window.openRegisterModal());
  btnClose.addEventListener('click', () => modal.style.display = 'none');
  btnCancel.addEventListener('click', () => modal.style.display = 'none');

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const clubName = document.getElementById('regClubName').value.trim();
    const clubId = document.getElementById('regClubId').value.trim();
    const platform = document.getElementById('regPlatform').value;
    const adminPin = document.getElementById('regAdminPin').value.trim();
    const motto = document.getElementById('regMotto').value.trim();
    const themePreset = document.querySelector('input[name="themePreset"]:checked')?.value || 'gold';

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> Membuat website klub...';
    alertBox.style.display = 'none';

    try {
      const res = await fetch('/api/portal/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubName, clubId, platform, adminPin, motto, themePreset })
      });

      const json = await res.json();

      if (json.success) {
        alertBox.style.display = 'block';
        alertBox.className = 'alert-box success';
        alertBox.innerHTML = `✅ Sukses! Folder klub <code>/${json.slug}/</code> berhasil dibuat. Mengalihkan ke website klub...`;

        setTimeout(() => {
          window.location.href = json.redirectUrl || ('/' + json.slug + '/');
        }, 1200);
      } else {
        throw new Error(json.message || 'Registrasi gagal.');
      }
    } catch (err) {
      alertBox.style.display = 'block';
      alertBox.className = 'alert-box error';
      alertBox.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🚀</span> Buat Website Klub Sekarang';
    }
  });
}

function initThemeRadioStyling() {
  const options = document.querySelectorAll('.theme-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });
}
