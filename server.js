import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listAllClubs,
  registerNewClub,
  readClubJson,
  writeClubJson,
  clubExists,
  getClubPath
} from './services/clubManager.js';
import { searchClub, syncLiveEaData } from './services/eaService.js';
import { connectToDatabase } from './services/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Assets
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/clubs', express.static(path.join(__dirname, 'clubs')));

// Multer Storage dinamis per klub
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const slug = req.params.slug;
    const uploadDir = path.join(getClubPath(slug), 'images', 'players');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safePlayerId = (req.params.id || 'player').replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, safePlayerId + '_' + Date.now() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar (JPG, PNG, WebP) yang diizinkan!'));
    }
  }
});

// Auth Middleware per klub
const requireClubAdmin = async (req, res, next) => {
  const { slug } = req.params;
  const pin = req.headers['x-admin-pin'] || req.query.pin;

  const exists = await clubExists(slug);
  if (!exists) {
    return res.status(404).json({ success: false, message: 'Klub tidak ditemukan.' });
  }

  const config = await readClubJson(slug, 'club-config.json');
  const validPin = config?.club?.adminPin || '1234';

  if (pin && pin === validPin) {
    req.clubConfig = config;
    next();
  } else {
    res.status(401).json({ success: false, message: 'PIN Admin untuk klub ini salah!' });
  }
};

/* ══════════════════════════════════════════════════════
   PORTAL / LANDING API (DISCOVERY & REGISTRASI)
   ══════════════════════════════════════════════════════ */

// 1. List semua klub yang terdaftar
app.get('/api/portal/clubs', async (req, res) => {
  const clubs = await listAllClubs();
  res.json({ success: true, data: clubs });
});

// 2. Registrasi klub baru
app.post('/api/portal/register', async (req, res) => {
  try {
    const { clubId, clubName, platform, adminPin, motto, themePreset } = req.body;
    const result = await registerNewClub({ clubId, clubName, platform, adminPin, motto, themePreset });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 3. Pencarian klub di server EA
app.get('/api/ea/search', async (req, res) => {
  const { name, platform } = req.query;
  if (!name) return res.status(400).json({ success: false, message: 'Nama klub harus diisi.' });

  try {
    const results = await searchClub(name, platform || 'common-gen5');
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(502).json({
      success: false,
      message: 'Server EA sedang tidak dapat dijangkau: ' + err.message
    });
  }
});

/* ══════════════════════════════════════════════════════
   CLUB PUBLIC API (SCOPED BY SLUG)
   ══════════════════════════════════════════════════════ */

// 1. Data lengkap klub (config, players, matches)
app.get('/api/clubs/:slug/data', async (req, res) => {
  const { slug } = req.params;
  if (!clubExists(slug)) {
    return res.status(404).json({ success: false, message: 'Klub tidak ditemukan.' });
  }

  const [config, players, matches] = await Promise.all([
    readClubJson(slug, 'club-config.json', {}),
    readClubJson(slug, 'players.json', []),
    readClubJson(slug, 'matches.json', [])
  ]);

  res.json({
    success: true,
    data: {
      club: config.club,
      theme: config.theme,
      formation: config.formation,
      socials: config.socials,
      players,
      matches
    }
  });
});

// 2. Submit Trial untuk klub tertentu
app.post('/api/clubs/:slug/trials', async (req, res) => {
  const { slug } = req.params;
  if (!clubExists(slug)) {
    return res.status(404).json({ success: false, message: 'Klub tidak ditemukan.' });
  }

  try {
    const { eaId, discordTag, platform, primaryPos, secondaryPos, archetype1, level1, archetype2, level2, experience } = req.body;
    
    if (!eaId || !discordTag || !primaryPos) {
      return res.status(400).json({ success: false, message: 'Mohon lengkapi ID EA, Discord, dan Posisi!' });
    }

    const trials = await readClubJson(slug, 'trials.json', []);
    const newTrial = {
      id: 'tr-' + Date.now(),
      eaId: eaId.trim(),
      discordTag: discordTag.trim(),
      platform: platform || 'PC',
      primaryPos,
      secondaryPos: secondaryPos || '–',
      archetype1: archetype1 || '',
      level1: Number(level1) || null,
      archetype2: archetype2 || '',
      level2: Number(level2) || null,
      experience: experience ? experience.trim() : '',
      status: 'pending',
      appliedAt: new Date().toISOString(),
      adminNotes: ''
    };

    trials.unshift(newTrial);
    await writeClubJson(slug, 'trials.json', trials);

    res.json({ success: true, message: 'Pendaftaran trial berhasil dikirim!', data: newTrial });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memproses pendaftaran trial.' });
  }
});

/* ══════════════════════════════════════════════════════
   CLUB ADMIN API (SCOPED BY SLUG & AUTHENTICATED)
   ══════════════════════════════════════════════════════ */

// 1. Login Admin Klub
app.post('/api/clubs/:slug/admin/login', async (req, res) => {
  const { slug } = req.params;
  const { pin } = req.body;

  if (!clubExists(slug)) {
    return res.status(404).json({ success: false, message: 'Klub tidak ditemukan.' });
  }

  const config = await readClubJson(slug, 'club-config.json');
  const validPin = config?.club?.adminPin || '1234';

  if (pin && pin === validPin) {
    res.json({ success: true, message: 'Login Admin Berhasil!' });
  } else {
    res.status(401).json({ success: false, message: 'PIN Salah! Coba lagi.' });
  }
});

// 2. List Trial untuk Klub ini
app.get('/api/clubs/:slug/admin/trials', requireClubAdmin, async (req, res) => {
  const trials = await readClubJson(req.params.slug, 'trials.json', []);
  res.json({ success: true, data: trials });
});

// 3. Update Status Trial
app.patch('/api/clubs/:slug/admin/trials/:id', requireClubAdmin, async (req, res) => {
  const { slug, id } = req.params;
  const { status, adminNotes } = req.body;

  const trials = await readClubJson(slug, 'trials.json', []);
  const idx = trials.findIndex(t => t.id === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Data trial tidak ditemukan.' });
  }

  if (status) trials[idx].status = status;
  if (adminNotes !== undefined) trials[idx].adminNotes = adminNotes;

  await writeClubJson(slug, 'trials.json', trials);
  res.json({ success: true, message: 'Status trial berhasil diupdate!', data: trials[idx] });
});

// 4. Update Pemain & Upload Foto
app.post('/api/clubs/:slug/admin/player/:id', requireClubAdmin, upload.single('photo'), async (req, res) => {
  const { slug, id } = req.params;
  const { realName, number, bio, role, isStartingXI, isCaptain, ovr } = req.body;

  const players = await readClubJson(slug, 'players.json', []);
  const idx = players.findIndex(p => p.id === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Pemain tidak ditemukan!' });
  }

  if (realName !== undefined) players[idx].realName = realName;
  if (number !== undefined && number !== '') players[idx].number = Number(number);
  if (ovr !== undefined && ovr !== '') players[idx].ovr = Number(ovr);
  if (bio !== undefined) players[idx].bio = bio;
  if (role !== undefined) players[idx].role = role;
  if (isStartingXI !== undefined) players[idx].isStartingXI = (isStartingXI === 'true' || isStartingXI === true);
  if (isCaptain !== undefined) players[idx].isCaptain = (isCaptain === 'true' || isCaptain === true);

  if (req.file) {
    players[idx].photo = `/clubs/${slug}/images/players/${req.file.filename}`;
  }

  await writeClubJson(slug, 'players.json', players);
  res.json({ success: true, message: 'Data pemain berhasil diperbarui!', data: players[idx] });
});

// 5. Update Link Highlight Laga
app.post('/api/clubs/:slug/admin/match/:id/highlight', requireClubAdmin, async (req, res) => {
  const { slug, id } = req.params;
  const { highlightUrl } = req.body;

  const matches = await readClubJson(slug, 'matches.json', []);
  const idx = matches.findIndex(m => m.id === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Laga tidak ditemukan!' });
  }

  matches[idx].highlightUrl = (highlightUrl || '').trim();
  await writeClubJson(slug, 'matches.json', matches);
  res.json({ success: true, message: 'Link highlight laga berhasil disimpan!', data: matches[idx] });
});

// 5a. Catat Pertandingan Baru
app.post('/api/clubs/:slug/admin/matches', requireClubAdmin, async (req, res) => {
  const { slug } = req.params;
  const { date, competition, opponent, scoreHome, scoreAway, result, motm, motmRating, highlightUrl, stats, scorers, lineup } = req.body;

  if (!opponent) {
    return res.status(400).json({ success: false, message: 'Nama tim lawan wajib diisi!' });
  }

  const sH = Number(scoreHome) || 0;
  const sA = Number(scoreAway) || 0;
  const determinedResult = result || (sH > sA ? 'win' : (sH === sA ? 'draw' : 'loss'));

  const matches = await readClubJson(slug, 'matches.json', []);
  const newMatch = {
    id: 'm_' + Date.now(),
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    competition: competition ? competition.trim() : 'Elite Division',
    opponent: opponent.trim(),
    scoreHome: sH,
    scoreAway: sA,
    result: determinedResult,
    motm: motm ? motm.trim() : '–',
    motmRating: Number(motmRating) || 8.5,
    highlightUrl: highlightUrl ? highlightUrl.trim() : '',
    stats: stats || {
      shotsHome: sH * 3 + 2,
      shotsAway: sA * 3 + 1,
      shotsOnTargetHome: sH + 3,
      shotsOnTargetAway: sA + 2,
      possessionHome: 52,
      possessionAway: 48,
      tacklesHome: 15,
      tacklesAway: 14,
      passSuccessHome: 84,
      passSuccessAway: 80,
      cornersHome: 4,
      cornersAway: 3,
      foulsHome: 4,
      foulsAway: 5
    },
    scorers: scorers || [],
    lineup: lineup || []
  };

  matches.unshift(newMatch);
  await writeClubJson(slug, 'matches.json', matches);

  // Update statistik klub secara otomatis
  const config = await readClubJson(slug, 'club-config.json');
  if (config && config.club && config.club.stats) {
    config.club.stats.matches += 1;
    if (determinedResult === 'win') config.club.stats.wins += 1;
    else if (determinedResult === 'draw') config.club.stats.draws += 1;
    else if (determinedResult === 'loss') config.club.stats.losses += 1;
    config.club.stats.goalsFor += sH;
    config.club.stats.goalsAgainst += sA;
    if (sA === 0) config.club.stats.cleanSheets += 1;
    config.club.stats.winRate = Math.round((config.club.stats.wins / config.club.stats.matches) * 100);
    await writeClubJson(slug, 'club-config.json', config);
  }

  res.json({ success: true, message: 'Pertandingan berhasil dicatat!', data: newMatch });
});

// 5b. Hapus Laga
app.delete('/api/clubs/:slug/admin/matches/:id', requireClubAdmin, async (req, res) => {
  const { slug, id } = req.params;
  const matches = await readClubJson(slug, 'matches.json', []);
  const filtered = matches.filter(m => m.id !== id);

  if (matches.length === filtered.length) {
    return res.status(404).json({ success: false, message: 'Laga tidak ditemukan!' });
  }

  await writeClubJson(slug, 'matches.json', filtered);
  res.json({ success: true, message: 'Pertandingan berhasil dihapus!' });
});

// 6. Update Tema Warna Klub
app.post('/api/clubs/:slug/admin/theme', requireClubAdmin, async (req, res) => {
  const { slug } = req.params;
  const { theme } = req.body;

  if (!theme) return res.status(400).json({ success: false, message: 'Data tema harus diisi.' });

  const config = await readClubJson(slug, 'club-config.json');
  config.theme = { ...config.theme, ...theme };

  await writeClubJson(slug, 'club-config.json', config);
  res.json({ success: true, message: 'Warna tema klub berhasil diperbarui!', data: config.theme });
});

// 7. Update Pengaturan Klub (Jadwal & Info - ID Club dikunci!)
app.post('/api/clubs/:slug/admin/settings', requireClubAdmin, async (req, res) => {
  const { slug } = req.params;
  const { nextMatch, motto, adminPin, tactics } = req.body;

  const config = await readClubJson(slug, 'club-config.json');

  if (nextMatch) config.club.nextMatch = { ...config.club.nextMatch, ...nextMatch };
  if (motto !== undefined) config.club.motto = motto;
  if (adminPin) config.club.adminPin = String(adminPin).trim();
  if (tactics && config.formation) config.formation.tactics = tactics;

  await writeClubJson(slug, 'club-config.json', config);
  res.json({ success: true, message: 'Pengaturan berhasil diperbarui!', data: config });
});

// 8. Live Sync EA (Menggunakan ID Klub yang sudah terkunci di config)
app.post('/api/clubs/:slug/admin/sync', requireClubAdmin, async (req, res) => {
  const { slug } = req.params;

  try {
    const config = await readClubJson(slug, 'club-config.json');
    const players = await readClubJson(slug, 'players.json', []);
    const matches = await readClubJson(slug, 'matches.json', []);

    const clubId = config.club.eaClubId;
    const platform = config.club.platform || 'common-gen5';

    if (!clubId) {
      return res.status(400).json({ success: false, message: 'Club ID EA belum dikonfigurasi untuk klub ini.' });
    }

    const syncResult = await syncLiveEaData(clubId, platform, players, config, matches);

    if (syncResult.success) {
      await writeClubJson(slug, 'club-config.json', syncResult.updatedConfig);
      await writeClubJson(slug, 'players.json', syncResult.updatedPlayers);
      if (syncResult.updatedMatches) {
        await writeClubJson(slug, 'matches.json', syncResult.updatedMatches);
      }

      res.json({
        success: true,
        message: syncResult.message,
        data: {
          playersCount: syncResult.updatedPlayers.length,
          matchesCount: syncResult.updatedMatches?.length || 0
        }
      });
    }
  } catch (err) {
    res.status(502).json({
      success: false,
      message: 'Server EA sedang mengalami kendala/timeout. Data lokal tetap dipertahankan.',
      errorDetail: err.message
    });
  }
});

// 9. Manual Raw EA JSON Import (Pruning pemain yang tidak ada)
app.post('/api/clubs/:slug/admin/ea-import-json', requireClubAdmin, async (req, res) => {
  const { slug } = req.params;
  const { rawJson } = req.body;

  try {
    if (!rawJson) return res.status(400).json({ success: false, message: 'JSON tidak boleh kosong.' });

    const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    const members = Array.isArray(parsed) ? parsed : (parsed.members || Object.values(parsed)[0]?.members || []);

    if (!members.length) {
      return res.status(400).json({ success: false, message: 'Tidak ditemukan data array members pada JSON yang dimasukkan.' });
    }

    const existingPlayers = await readClubJson(slug, 'players.json', []);
    const config = await readClubJson(slug, 'club-config.json', {});
    const POS_MAP = { goalkeeper: 'GK', defender: 'CB', midfielder: 'CM', forward: 'ST' };

    const syncedPlayers = members.map((m, idx) => {
      const eaName = (m.name || m.proName || ('Pemain ' + (idx + 1))).trim();
      const favPos = POS_MAP[m.favoritePosition] || 'CM';
      const isGK = favPos === 'GK';

      const existing = existingPlayers.find(p =>
        (p.eaId && p.eaId.toLowerCase().trim() === eaName.toLowerCase()) ||
        (p.name && p.name.toLowerCase().trim() === eaName.toLowerCase())
      );

      const games = Number(m.gamesPlayed) || 0;
      const goals = Number(m.goals) || 0;
      const assists = Number(m.assists) || 0;
      const ratingAve = Math.round((Number(m.ratingAve) || 6.0) * 10) / 10;
      const passAcc = Number(m.passSuccessRate) || 80;
      const tackleAcc = Number(m.tackleSuccessRate) || 40;
      const shotAcc = Number(m.shotSuccessRate) || 35;
      const cleanSheets = isGK ? (Number(m.cleanSheetsGK) || 0) : (Number(m.cleanSheetsDef) || 0);

      const eaOfficialOvr = parseInt(m.proOverall || m.proOvr || m.overall || m.ovr) || 0;
      const finalOvr = eaOfficialOvr > 0 ? eaOfficialOvr : (existing?.ovr || 85);
      const motmCount = parseInt(m.manOfTheMatch || m.motm) || (existing?.motmMusim || 0);

      if (existing) {
        return {
          ...existing,
          eaId: eaName,
          pos: favPos,
          ovr: finalOvr,
          main: games,
          gol: goals,
          assist: assists,
          rating: ratingAve,
          passAkurasi: passAcc,
          tekelAkurasi: tackleAcc,
          tembakanAkurasi: shotAcc,
          cleanSheets: cleanSheets,
          motmMusim: motmCount
        };
      } else {
        return {
          id: 'p-' + Date.now() + '-' + idx,
          eaId: eaName,
          name: eaName,
          realName: eaName,
          number: idx + 1,
          pos: favPos,
          role: favPos + ' Player',
          isCaptain: false,
          isStartingXI: idx < 11,
          ovr: finalOvr,
          main: games,
          gol: goals,
          assist: assists,
          rating: ratingAve,
          winRate: 50,
          passAkurasi: passAcc,
          tekelAkurasi: tackleAcc,
          tembakanAkurasi: shotAcc,
          cleanSheets: cleanSheets,
          motmMusim: motmCount,
          archetype: m.proStyle || 'Pro',
          levelArchetype: 20,
          countryCode: 'id',
          countryName: 'Indonesia',
          photo: '',
          bio: 'Pemain aktif terdaftar di skuad in-game EA Sports FC Pro Clubs.'
        };
      }
    });

    syncedPlayers.sort((a, b) => b.main - a.main || b.ovr - a.ovr);
    await writeClubJson(slug, 'players.json', syncedPlayers);

    const removedCount = existingPlayers.filter(p => !syncedPlayers.some(s => s.id === p.id)).length;
    res.json({
      success: true,
      message: `Berhasil mengimpor ${syncedPlayers.length} pemain aktif! (${removedCount} pemain lama yang tidak ada di klub dihapus).`
    });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Format JSON tidak valid: ' + err.message });
  }
});

// Redirect old slug 438867 to real ID 654678
app.use((req, res, next) => {
  if (req.url.startsWith('/438867-lamball-vfc')) {
    return res.redirect(301, req.url.replace('/438867-lamball-vfc', '/654678-lamball-vfc'));
  }
  next();
});

// Backward compatibility legacy routes (fallback to Lamball VFC)
app.get('/api/club', async (req, res) => {
  const config = await readClubJson('654678-lamball-vfc', 'club-config.json', {});
  res.json({ success: true, data: config });
});
app.get('/api/players', async (req, res) => {
  const players = await readClubJson('654678-lamball-vfc', 'players.json', []);
  res.json({ success: true, data: players });
});
app.get('/api/matches', async (req, res) => {
  const matches = await readClubJson('654678-lamball-vfc', 'matches.json', []);
  res.json({ success: true, data: matches });
});

/* ══════════════════════════════════════════════════════
   DYNAMIC HTML PAGE ROUTING
   ══════════════════════════════════════════════════════ */

// 1. Root: Landing Portal (Discovery & Register)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

// 2. Club Admin: /:slug/admin or /:slug/admin/
app.get('/:slug/admin*', (req, res) => {
  const { slug } = req.params;
  if (!clubExists(slug)) {
    return res.status(404).send('<h1>404 — Klub Tidak Ditemukan</h1><p>Klub dengan URL ini belum terdaftar. <a href="/">Daftarkan di sini</a>.</p>');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 3. Club Website: /:slug or /:slug/
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const exists = await clubExists(slug);
  if (!exists) {
    return res.status(404).send('<h1>404 — Klub Tidak Ditemukan</h1><p>Klub dengan URL ini belum terdaftar. <a href="/">Daftarkan di sini</a>.</p>');
  }
  return res.sendFile(path.join(__dirname, 'public', 'club.html'));
});



// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log('⚡ Multi-Club Pro Clubs Hub berjalan di http://localhost:' + PORT);
  console.log('🌐 Landing Portal: http://localhost:' + PORT + '/');
  console.log('👑 Lamball VFC: http://localhost:' + PORT + '/654678-lamball-vfc/');
  console.log('🔒 Lamball Admin: http://localhost:' + PORT + '/654678-lamball-vfc/admin/');
});


// Connect to MongoDB Atlas on start
connectToDatabase().catch(err => console.warn("MongoDB initial connect:", err.message));

export default app;
