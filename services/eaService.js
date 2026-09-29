/* ============================================================
   LAMBALL VFC — EA SPORTS FC PRO CLUBS INTEGRATION SERVICE
   Handles direct EA API calls, fallback gateways, CORS bypass,
   and merging EA live stats with Lamball VFC player profiles and matches.
   ============================================================ */

const EA_BASE_URL = 'https://proclubs.ea.com/api/fc';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.ea.com/',
  'Origin': 'https://www.ea.com'
};

export const POS_MAP = {
  0: 'GK', 1: 'SW', 2: 'RWB', 3: 'RB', 4: 'RCB', 5: 'CB', 6: 'LCB', 7: 'LB', 8: 'LWB',
  9: 'RDM', 10: 'CDM', 11: 'LDM', 12: 'RM', 13: 'RCM', 14: 'CM', 15: 'LCM', 16: 'LM',
  17: 'RAM', 18: 'CAM', 19: 'LAM', 20: 'RF', 21: 'CF', 22: 'LF', 23: 'RW', 24: 'RS',
  25: 'ST', 26: 'LS', 27: 'LW',
  goalkeeper: 'GK',
  defender: 'CB',
  midfielder: 'CM',
  forward: 'ST'
};

export function mapPosition(posRaw) {
  if (posRaw === undefined || posRaw === null || posRaw === '') return 'CM';
  const str = String(posRaw).trim().toLowerCase();
  if (POS_MAP[posRaw] || POS_MAP[str]) return POS_MAP[posRaw] || POS_MAP[str];
  if (str.includes('forward') || str.includes('striker')) return 'ST';
  if (str.includes('midfielder')) return 'CM';
  if (str.includes('defender')) return 'CB';
  if (str.includes('goalkeeper')) return 'GK';
  return String(posRaw).slice(0, 3).toUpperCase();
}

/**
 * Fetch from EA Sports FC API with multi-gateway fallbacks and strict timeouts.
 */
export async function fetchEA(endpoint, timeoutMs = 8000) {
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const directUrl = `${EA_BASE_URL}/${cleanEndpoint}`;

  const gateways = [
    // 1. Direct fetch (fastest and cleanest from Node backend)
    { name: 'Direct EA', url: directUrl, headers: BROWSER_HEADERS },
    // 2. AllOrigins raw proxy
    { name: 'AllOrigins Gateway', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`, headers: {} },
    // 3. CodeTabs proxy
    { name: 'CodeTabs Gateway', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(directUrl)}`, headers: {} }
  ];

  let lastError = null;

  for (const gw of gateways) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(gw.url, {
        headers: gw.headers,
        signal: controller.signal
      });

      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
          return JSON.parse(text);
        } else {
          throw new Error('EA mengembalikan proteksi bot/Cloudflare HTML.');
        }
      } else {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Semua gateway EA gagal dijangkau: ${lastError ? lastError.message : 'Timeout'}`);
}

/**
 * Search club by name
 */
export async function searchClub(clubName, platform = 'common-gen5') {
  const endpoint = `allTimeLeaderboard/search?platform=${encodeURIComponent(platform)}&clubName=${encodeURIComponent(clubName)}`;
  const data = await fetchEA(endpoint);

  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

/**
 * Fetch overall club record (Wins, Ties, Losses, Division)
 */
export async function getClubOverallStats(clubId, platform = 'common-gen5') {
  const endpoint = `clubs/overallStats?platform=${encodeURIComponent(platform)}&clubIds=${encodeURIComponent(clubId)}`;
  const res = await fetchEA(endpoint);
  if (Array.isArray(res) && res.length > 0) return res[0];
  if (res && res[clubId]) return res[clubId];
  return null;
}

/**
 * Fetch club members stats
 */
export async function getMemberStats(clubId, platform = 'common-gen5') {
  const endpoint = `members/stats?platform=${encodeURIComponent(platform)}&clubId=${encodeURIComponent(clubId)}`;
  const res = await fetchEA(endpoint);
  return Array.isArray(res) ? res : (res?.members || res?.[clubId]?.members || []);
}

/**
 * Fetch recent club matches
 * Queries leagueMatch and playoffMatch to retrieve authentic match history
 */
export async function getRecentMatches(clubId, platform = 'common-gen5', limit = 10) {
  let matches = [];
  try {
    const leagueEndpoint = `clubs/matches?platform=${encodeURIComponent(platform)}&clubIds=${encodeURIComponent(clubId)}&matchType=leagueMatch&maxResultCount=${limit}`;
    const res = await fetchEA(leagueEndpoint);
    if (Array.isArray(res) && res.length > 0) {
      matches = res;
    }
  } catch (err) {
    console.warn('League matches fetch notice:', err.message);
  }

  if (matches.length < limit) {
    try {
      const playoffEndpoint = `clubs/matches?platform=${encodeURIComponent(platform)}&clubIds=${encodeURIComponent(clubId)}&matchType=playoffMatch&maxResultCount=${limit}`;
      const playoffRes = await fetchEA(playoffEndpoint);
      if (Array.isArray(playoffRes) && playoffRes.length > 0) {
        matches = [...matches, ...playoffRes];
      }
    } catch (err) {
      // ignore
    }
  }

  matches.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  return matches.slice(0, limit);
}

/**
 * Format raw EA match objects into project's rich matches.json structure
 */
export function formatEaMatches(rawMatches, clubId, existingMatches = []) {
  if (!Array.isArray(rawMatches)) return existingMatches || [];

  const existingMap = new Map();
  (existingMatches || []).forEach(m => {
    if (m.eaMatchId) existingMap.set(String(m.eaMatchId), m);
    if (m.id) existingMap.set(String(m.id), m);
  });

  const parsedList = rawMatches.map((m, idx) => {
    const clubs = m.clubs || {};
    const myClub = clubs[clubId] || {};
    const oppClubId = Object.keys(clubs).find(id => id !== String(clubId));
    const oppClub = oppClubId ? (clubs[oppClubId] || {}) : {};

    const myGoals = parseInt(myClub.goals ?? myClub.score ?? 0);
    const oppGoals = parseInt(oppClub.goals ?? oppClub.score ?? 0);
    const oppClubName = oppClub.details?.name || (oppClubId ? `Club #${oppClubId}` : 'Tim Lawan');

    const result = myGoals > oppGoals ? 'win' : (myGoals < oppGoals ? 'loss' : 'draw');
    const matchDate = m.timestamp ? new Date(m.timestamp * 1000).toISOString() : new Date().toISOString();

    // Aggregates
    const agg = m.aggregate || {};
    const aggMy = agg[clubId] || {};
    const aggOpp = (oppClubId && agg[oppClubId]) || {};

    const shotsHome = parseInt(aggMy.shots || 0);
    const shotsAway = parseInt(aggOpp.shots || 0);
    const passesHome = parseInt(aggMy.passesmade || 0);
    const passesAway = parseInt(aggOpp.passesmade || 0);
    const passAttemptsHome = parseInt(aggMy.passattempts || 0);
    const passAttemptsAway = parseInt(aggOpp.passattempts || 0);
    const passSuccessHome = passAttemptsHome > 0 ? Math.round((passesHome / passAttemptsHome) * 100) : 80;
    const passSuccessAway = passAttemptsAway > 0 ? Math.round((passesAway / passAttemptsAway) * 100) : 80;

    const totalPasses = passesHome + passesAway;
    const possessionHome = totalPasses > 0 ? Math.round((passesHome / totalPasses) * 100) : 50;
    const possessionAway = 100 - possessionHome;

    const tacklesHome = parseInt(aggMy.tacklesmade || 0);
    const tacklesAway = parseInt(aggOpp.tacklesmade || 0);
    const savesHome = parseInt(aggMy.saves || 0);
    const savesAway = parseInt(aggOpp.saves || 0);
    const redCardsHome = parseInt(aggMy.redcards || 0);
    const redCardsAway = parseInt(aggOpp.redcards || 0);

    const shotsOnTargetHome = myGoals + savesAway;
    const shotsOnTargetAway = oppGoals + savesHome;

    // Players & Lineup
    const playersMap = (m.players && m.players[clubId]) || {};
    const lineup = [];
    const scorers = [];
    let motm = '-';
    let motmRating = 0;

    Object.entries(playersMap).forEach(([pId, p]) => {
      const pName = p.playername || 'Unknown';
      const posCode = mapPosition(p.pos);
      const rating = parseFloat(p.rating || 6.0);
      const goals = parseInt(p.goals || 0);
      const assists = parseInt(p.assists || 0);
      const isMom = p.mom === '1' || p.mom === 1;

      if (isMom || rating > motmRating) {
        motm = pName;
        motmRating = rating;
      }

      for (let i = 0; i < goals; i++) {
        scorers.push({
          player: pName,
          minute: '',
          type: 'goal'
        });
      }

      lineup.push({
        id: pId,
        name: pName,
        pos: posCode,
        rating: Math.round(rating * 10) / 10,
        motm: isMom,
        goals,
        assists,
        passes: parseInt(p.passesmade || 0),
        tackles: parseInt(p.tacklesmade || 0)
      });
    });

    // Sort lineup by rating desc
    lineup.sort((a, b) => b.rating - a.rating);

    // Opponent goals
    for (let i = 0; i < oppGoals; i++) {
      scorers.push({
        player: oppClubName,
        minute: '',
        type: 'opponent_goal'
      });
    }

    const matchIdKey = String(m.matchId);
    const existing = existingMap.get(matchIdKey) || existingMap.get('ea-' + matchIdKey) || existingMap.get('m' + (idx + 1));

    return {
      id: 'ea-' + matchIdKey,
      eaMatchId: matchIdKey,
      date: matchDate,
      competition: m.matchType === '1' ? 'EA FC Pro Clubs League' : 'EA FC Playoff Match',
      opponent: oppClubName,
      opponentClubId: oppClubId,
      scoreHome: myGoals,
      scoreAway: oppGoals,
      result,
      motm: motm || '-',
      motmRating: Math.round(motmRating * 10) / 10,
      highlightUrl: existing?.highlightUrl || '',
      stats: {
        shotsHome,
        shotsAway,
        shotsOnTargetHome,
        shotsOnTargetAway,
        possessionHome,
        possessionAway,
        tacklesHome,
        tacklesAway,
        passSuccessHome,
        passSuccessAway,
        cornersHome: 0,
        cornersAway: 0,
        foulsHome: 0,
        foulsAway: 0,
        savesHome,
        savesAway,
        redCardsHome,
        redCardsAway
      },
      scorers,
      lineup,
      raw: m
    };
  });

  // Preserve manual matches added by admin
  const rawMatchIds = new Set(parsedList.map(p => p.id));
  const manualMatches = (existingMatches || []).filter(em => !rawMatchIds.has(em.id) && !rawMatchIds.has('ea-' + em.eaMatchId) && em.isManual);

  return [...parsedList, ...manualMatches];
}

/**
 * Synchronize live EA data into Club database files.
 * Synchronizes: Overall Club Stats, Active Squad Members, and Live Match History.
 */
export async function syncLiveEaData(clubId, platform, existingPlayers = [], existingConfig = {}, existingMatches = []) {
  if (!clubId) {
    throw new Error('Club ID EA tidak boleh kosong.');
  }

  // 1. Fetch live data from EA
  const [overallStats, membersRaw, matchesRaw] = await Promise.all([
    getClubOverallStats(clubId, platform).catch(() => null),
    getMemberStats(clubId, platform).catch(() => []),
    getRecentMatches(clubId, platform, 10).catch(() => [])
  ]);

  if (!membersRaw || membersRaw.length === 0) {
    throw new Error('Tidak ditemukan data skuad/pemain dari EA untuk Club ID ' + clubId + '. Data lokal dipertahankan.');
  }

  // 2. Update Club Overall Stats
  const updatedConfig = { ...existingConfig };
  if (overallStats) {
    const w = Number(overallStats.wins) || 0;
    const d = Number(overallStats.ties) || 0;
    const l = Number(overallStats.losses) || 0;
    const totalMatches = Number(overallStats.gamesPlayed) || (w + d + l);
    const winRate = totalMatches > 0 ? Math.round((w / totalMatches) * 100) : 0;

    updatedConfig.club = {
      ...updatedConfig.club,
      eaClubId: clubId,
      platform: platform,
      eaAutoSync: true,
      division: Number(overallStats.bestDivision) || updatedConfig.club?.division || 1,
      stats: {
        matches: totalMatches,
        wins: w,
        draws: d,
        losses: l,
        goalsFor: Number(overallStats.goals) || 0,
        goalsAgainst: Number(overallStats.goalsAgainst) || 0,
        skillRating: Number(overallStats.skillRating) || updatedConfig.club?.stats?.skillRating || 1500,
        cleanSheets: Number(overallStats.cleanSheets) || updatedConfig.club?.stats?.cleanSheets || 0,
        winRate: winRate
      }
    };
  }

  // 3. Update Players Roster (prune inactive members)
  const syncedPlayers = membersRaw.map((m, idx) => {
    const eaName = (m.name || m.proName || `Pemain ${idx + 1}`).trim();
    const favPos = mapPosition(m.proPos || m.favoritePosition);
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
    const motmCount = parseInt(m.manOfTheMatch || m.motm) || (existing?.motmMusim || 0);
    const finalOvr = eaOfficialOvr > 0 ? eaOfficialOvr : (existing?.ovr || 85);

    if (existing) {
      return {
        ...existing,
        eaId: eaName,
        proName: m.proName || existing.proName || eaName,
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
        proName: m.proName || eaName,
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

  if (updatedConfig.formation && updatedConfig.formation.startingXI) {
    const starters = syncedPlayers.slice(0, 11);
    updatedConfig.formation.startingXI.forEach((slot, i) => {
      if (starters[i]) {
        slot.playerId = starters[i].id;
        starters[i].isStartingXI = true;
      }
    });
  }

  // 4. Format and save Live Matches
  const updatedMatches = formatEaMatches(matchesRaw, clubId, existingMatches);

  const removedCount = existingPlayers.filter(p => !syncedPlayers.some(s => s.id === p.id)).length;

  return {
    success: true,
    message: `Sinkronisasi sukses! ${syncedPlayers.length} pemain aktif dan ${updatedMatches.length} riwayat pertandingan dari EA Sports FC berhasil diperbarui (${removedCount} pemain lama yang tidak ada di klub dihapus).`,
    updatedConfig,
    updatedPlayers: syncedPlayers,
    updatedMatches
  };
}
