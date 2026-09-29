/* ============================================================
   LAMBALL VFC — MULTI-CLUB TENANT MANAGER SERVICE (clubManager.js)
   Manages isolated club directories in /clubs/[clubId]-[clubName]/
   ============================================================ */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncLiveEaData } from './eaService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.resolve(__dirname, '..');
const clubsRootDir = path.join(baseDir, 'clubs');

// Helper Slug Generator
export function generateClubSlug(clubId, clubName) {
  const cleanId = String(clubId || '').replace(/[^0-9]/g, '') || String(Date.now()).slice(-6);
  const cleanName = String(clubName || 'club')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'team';
  return cleanId + '-' + cleanName;
}

export function getClubPath(slug) {
  const safeSlug = path.basename(slug).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(clubsRootDir, safeSlug);
}

export function clubExists(slug) {
  if (!slug) return false;
  return fsSync.existsSync(getClubPath(slug));
}

export async function readClubJson(slug, filename, fallback = null) {
  try {
    const filePath = path.join(getClubPath(slug), filename);
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

export async function writeClubJson(slug, filename, data) {
  const clubDir = getClubPath(slug);
  await fs.mkdir(clubDir, { recursive: true });
  const filePath = path.join(clubDir, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * List all registered clubs for landing portal discovery
 */
export async function listAllClubs() {
  try {
    if (!fsSync.existsSync(clubsRootDir)) return [];
    const entries = await fs.readdir(clubsRootDir, { withFileTypes: true });
    const clubs = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const slug = entry.name;
        const config = await readClubJson(slug, 'club-config.json');
        const players = await readClubJson(slug, 'players.json', []);
        if (config && config.club) {
          clubs.push({
            slug,
            name: config.club.name || slug,
            shortName: config.club.shortName || 'FC',
            motto: config.club.motto || '',
            division: config.club.division || 1,
            divisionName: config.club.divisionName || 'Division 1',
            eaClubId: config.club.eaClubId || '',
            platform: config.club.platform || 'common-gen5',
            stats: config.club.stats || {},
            theme: config.theme || { primary: '#F5BA31', bgDeep: '#0A0A0E' },
            logo: config.club.logo || ('/clubs/' + slug + '/images/logo.jpeg'),
            memberCount: players.length
          });
        }
      }
    }

    return clubs;
  } catch (err) {
    console.error('Error listing clubs:', err);
    return [];
  }
}

/**
 * Create a new isolated club folder and initialize data
 */
export async function registerNewClub({ clubId, clubName, platform, adminPin, motto, themePreset }) {
  if (!clubName) {
    throw new Error('Nama klub wajib diisi.');
  }

  const slug = generateClubSlug(clubId, clubName);
  const clubDir = getClubPath(slug);

  if (fsSync.existsSync(clubDir)) {
    throw new Error('Klub dengan URL /' + slug + '/ sudah terdaftar! Gunakan nama lain atau kelola di admin.');
  }

  // Buat struktur direktori terisolasi
  await fs.mkdir(path.join(clubDir, 'images', 'players'), { recursive: true });

  // Siapkan tema warna
  const themes = {
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

  const selectedTheme = themes[themePreset] || themes.gold;

  const initialConfig = {
    club: {
      slug,
      name: clubName.trim(),
      shortName: clubName.slice(0, 3).toUpperCase(),
      motto: motto ? motto.trim() : 'Champions never quit!',
      division: 1,
      divisionName: 'Elite Division',
      platform: platform || 'common-gen5',
      eaClubId: String(clubId || '').trim(),
      adminPin: String(adminPin || '1234').trim(),
      eaAutoSync: true,
      logo: '/clubs/' + slug + '/images/logo.jpeg',
      stats: {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        skillRating: 1500,
        cleanSheets: 0,
        winRate: 0
      },
      nextMatch: {
        opponent: 'Friendly Opponent',
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        tournament: 'Weekly Scrimmage',
        isLive: false
      }
    },
    theme: selectedTheme,
    formation: {
      name: "4-2-3-1",
      tactics: "Balanced Possession",
      startingXI: [
        { slot: "GK", playerId: "p1", x: 50, y: 88 },
        { slot: "LB", playerId: "p2", x: 16, y: 72 },
        { slot: "CB1", playerId: "p3", x: 38, y: 74 },
        { slot: "CB2", playerId: "p4", x: 62, y: 74 },
        { slot: "RB", playerId: "p5", x: 84, y: 72 },
        { slot: "LDM", playerId: "p6", x: 35, y: 55 },
        { slot: "RDM", playerId: "p7", x: 65, y: 55 },
        { slot: "LAM", playerId: "p8", x: 20, y: 35 },
        { slot: "CAM", playerId: "p9", x: 50, y: 32 },
        { slot: "RAM", playerId: "p10", x: 80, y: 35 },
        { slot: "ST", playerId: "p11", x: 50, y: 14 }
      ]
    },
    socials: {
      discord: "",
      instagram: "",
      tiktok: "",
      streamers: []
    }
  };

  // Coba salin default logo jika ada
  const defaultLogo = path.join(baseDir, 'public', 'images', 'logo.jpeg');
  if (fsSync.existsSync(defaultLogo)) {
    await fs.copyFile(defaultLogo, path.join(clubDir, 'images', 'logo.jpeg'));
  }

  let initialPlayers = [];
  let initialMatches = [];

  // Coba tarik data live dari EA jika clubId diberikan
  if (clubId) {
    try {
      const syncResult = await syncLiveEaData(clubId, platform || 'common-gen5', [], initialConfig, []);
      if (syncResult.success && syncResult.updatedPlayers?.length) {
        initialPlayers = syncResult.updatedPlayers;
        Object.assign(initialConfig.club, syncResult.updatedConfig.club);
      }
      if (syncResult.success && syncResult.updatedMatches?.length) {
        initialMatches = syncResult.updatedMatches;
      }
    } catch (err) {
      console.warn('Initial EA sync warning for new club:', err.message);
    }
  }

  // Jika belum ada pemain dari EA, buat starter squad default
  if (!initialPlayers.length) {
    initialPlayers = [
      { id: 'p1', eaId: 'Player_GK', name: 'Starter GK', realName: 'Kiper Utama', number: 1, pos: 'GK', ovr: 85, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 75, tekelAkurasi: 0, cleanSheets: 0, motmMusim: 0, archetype: 'Shot Stopper', isStartingXI: true },
      { id: 'p2', eaId: 'Player_LB', name: 'Starter LB', realName: 'Bek Kiri', number: 3, pos: 'LB', ovr: 84, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 80, tekelAkurasi: 65, cleanSheets: 0, motmMusim: 0, archetype: 'Marauder', isStartingXI: true },
      { id: 'p3', eaId: 'Player_CB1', name: 'Starter CB1', realName: 'Bek Tengah 1', number: 4, pos: 'CB', ovr: 86, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 78, tekelAkurasi: 75, cleanSheets: 0, motmMusim: 0, archetype: 'Boss', isStartingXI: true },
      { id: 'p4', eaId: 'Player_CB2', name: 'Starter CB2', realName: 'Bek Tengah 2', number: 5, pos: 'CB', ovr: 85, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 78, tekelAkurasi: 74, cleanSheets: 0, motmMusim: 0, archetype: 'Progressor', isStartingXI: true },
      { id: 'p5', eaId: 'Player_RB', name: 'Starter RB', realName: 'Bek Kanan', number: 2, pos: 'RB', ovr: 84, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 80, tekelAkurasi: 66, cleanSheets: 0, motmMusim: 0, archetype: 'Marauder', isStartingXI: true },
      { id: 'p6', eaId: 'Player_CDM', name: 'Starter CDM', realName: 'Gelandang Bertahan', number: 6, pos: 'CDM', ovr: 86, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 84, tekelAkurasi: 70, cleanSheets: 0, motmMusim: 0, archetype: 'Disruptor', isStartingXI: true },
      { id: 'p7', eaId: 'Player_CM', name: 'Starter CM', realName: 'Gelandang Tengah', number: 8, pos: 'CM', ovr: 85, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 85, tekelAkurasi: 60, cleanSheets: 0, motmMusim: 0, archetype: 'Recycler', isStartingXI: true },
      { id: 'p8', eaId: 'Player_LW', name: 'Starter LW', realName: 'Sayap Kiri', number: 7, pos: 'LW', ovr: 87, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 82, tekelAkurasi: 35, cleanSheets: 0, motmMusim: 0, archetype: 'Spark', isStartingXI: true },
      { id: 'p9', eaId: 'Player_CAM', name: 'Starter CAM', realName: 'Playmaker', number: 10, pos: 'CAM', ovr: 88, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 88, tekelAkurasi: 40, cleanSheets: 0, motmMusim: 0, archetype: 'Maestro', isStartingXI: true },
      { id: 'p10', eaId: 'Player_RW', name: 'Starter RW', realName: 'Sayap Kanan', number: 11, pos: 'RW', ovr: 86, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 81, tekelAkurasi: 36, cleanSheets: 0, motmMusim: 0, archetype: 'Magician', isStartingXI: true },
      { id: 'p11', eaId: 'Player_ST', name: 'Starter ST', realName: 'Penyerang', number: 9, pos: 'ST', ovr: 89, main: 0, gol: 0, assist: 0, rating: 6.5, winRate: 0, passAkurasi: 80, tekelAkurasi: 30, cleanSheets: 0, motmMusim: 0, archetype: 'Finisher', isCaptain: true, isStartingXI: true }
    ];
  }

  // Tulis semua file klub
  await writeClubJson(slug, 'club-config.json', initialConfig);
  await writeClubJson(slug, 'players.json', initialPlayers);
  await writeClubJson(slug, 'matches.json', initialMatches);
  await writeClubJson(slug, 'trials.json', []);

  return {
    success: true,
    slug,
    redirectUrl: '/' + slug + '/',
    adminUrl: '/' + slug + '/admin/'
  };
}
