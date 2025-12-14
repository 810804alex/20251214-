// services/DistanceService.js
// 說明：
// - 提供 ETA 矩陣與相鄰路段時間/距離計算
// - 優先使用 Google Distance Matrix API；失敗或無金鑰時，改用本地 haversine + 速度估算
// - 支援 mode: 'driving' | 'walking' | 'transit'
// - 依賴：expo-constants（從 app.json / app.config.js 的 expo.extra 讀取 API Key）

import Constants from 'expo-constants';

const G_API_KEY =
  Constants?.expoConfig?.extra?.GOOGLE_MAPS_API_KEY ||
  Constants?.manifest?.extra?.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

/* ============================ 對外 API ============================ */

/**
 * 依序點位的相鄰路段時間/距離（分鐘、公里）
 * @param {Array<{latitude:number, longitude:number, lat?:number, lng?:number}>} places - 按遊程順序排列的點
 * @param {Object} options
 * @param {'driving'|'walking'|'transit'} options.mode
 * @returns {Promise<Array<{from:number,to:number,minutes:number,km:number}>>}
 */
export async function getLegTimes(places = [], { mode = 'driving' } = {}) {
  if (!Array.isArray(places) || places.length < 2) return [];

  // 盡量用 Distance Matrix 批次計算，再從矩陣提取相鄰段
  try {
    const M = await getEtaMatrix(places, { mode, withDistance: true });
    const legs = [];
    for (let i = 0; i < places.length - 1; i++) {
      const minutes = safeNum(M.minutes[i][i + 1], estimateTwoPoints(places[i], places[i + 1], mode).minutes);
      const km = safeNum(M.km?.[i]?.[i + 1], estimateTwoPoints(places[i], places[i + 1], mode).km);
      legs.push({ from: i, to: i + 1, minutes, km });
    }
    return legs;
  } catch (err) {
    console.warn('[getLegTimes] matrix failed, fallback pairwise:', err?.message || err);
    // 逐段 fallback
    const legs = [];
    for (let i = 0; i < places.length - 1; i++) {
      const est = estimateTwoPoints(places[i], places[i + 1], mode);
      legs.push({ from: i, to: i + 1, minutes: est.minutes, km: est.km });
    }
    return legs;
  }
}

/**
 * 取得 ETA 矩陣（分鐘）與距離（公里）
 * @param {Array} places
 * @param {Object} options
 * @param {'driving'|'walking'|'transit'} options.mode
 * @param {boolean} options.withDistance - 是否同時回傳距離
 * @returns {Promise<{ minutes: number[][], km?: number[][] }>}
 */
export async function getEtaMatrix(places = [], { mode = 'driving', withDistance = false } = {}) {
  if (!Array.isArray(places) || places.length === 0) {
    return { minutes: [[]], km: withDistance ? [[]] : undefined };
  }

  // 無金鑰或客製限制 → 直接本地估算
  if (!G_API_KEY) {
    return estimateMatrixLocally(places, mode, withDistance);
  }

  try {
    const coords = places.map(toLatLngString);
    const N = coords.length;

    // Google Distance Matrix 上限：origins ≤ 25、destinations ≤ 25
    const MAX = 25;
    const rowChunks = chunk(coords, MAX);
    const colChunks = chunk(coords, MAX);

    const minutes = fillMatrix(N, N, 0);
    const km = withDistance ? fillMatrix(N, N, 0) : undefined;

    for (let ri = 0; ri < rowChunks.length; ri++) {
      const origins = rowChunks[ri].join('|');

      for (let ci = 0; ci < colChunks.length; ci++) {
        const destinations = colChunks[ci].join('|');

        const url = buildDMUrl({ origins, destinations, mode, key: G_API_KEY });
        const json = await fetchJson(url);

        // 若 API 異常 → 直接 fallback 全矩陣
        if (!json?.rows?.length) {
          console.warn('[getEtaMatrix] empty rows from Google, fallback local');
          return estimateMatrixLocally(places, mode, withDistance);
        }

        const startRow = ri * MAX;
        const startCol = ci * MAX;

        json.rows.forEach((row, rIdx) => {
          const globalR = startRow + rIdx;
          (row.elements || []).forEach((el, cIdx) => {
            const globalC = startCol + cIdx;

            const sec = el?.duration?.value;   // 秒
            const meters = el?.distance?.value; // 公尺

            minutes[globalR][globalC] = typeof sec === 'number'
              ? Math.max(1, Math.round(sec / 60))
              : estimateTwoPoints(places[globalR], places[globalC], mode).minutes;

            if (withDistance && km) {
              km[globalR][globalC] = typeof meters === 'number'
                ? +(meters / 1000).toFixed(2)
                : estimateTwoPoints(places[globalR], places[globalC], mode).km;
            }
          });
        });
      }
    }

    return { minutes, ...(withDistance ? { km } : {}) };
  } catch (err) {
    console.warn('[getEtaMatrix] error, fallback local:', err?.message || err);
    return estimateMatrixLocally(places, mode, withDistance);
  }
}

/* ============================ 內部工具 ============================ */

function toLatLngString(p) {
  const lat = p.latitude ?? p.lat;
  const lng = p.longitude ?? p.lng;
  return `${lat},${lng}`;
}

function buildDMUrl({ origins, destinations, mode, key }) {
  const base = 'https://maps.googleapis.com/maps/api/distancematrix/json';
  const params = new URLSearchParams({
    origins,
    destinations,
    key,
    mode: mode === 'walking' ? 'walking' : mode === 'transit' ? 'transit' : 'driving',
    // 你可視需要加上 departure_time、traffic_model 等參數
  });
  return `${base}?${params.toString()}`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    // 常見：OVER_QUERY_LIMIT / REQUEST_DENIED 等
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text?.slice?.(0, 200)}`);
  }
  return res.json();
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fillMatrix(r, c, val = 0) {
  return Array(r).fill(0).map(() => Array(c).fill(val));
}

function safeNum(a, fallback) {
  return Number.isFinite(a) ? a : fallback;
}

/* ====================== 本地估算（無金鑰&備援） ====================== */

function estimateMatrixLocally(places = [], mode = 'driving', withDistance = false) {
  const N = places.length;
  const minutes = fillMatrix(N, N, 0);
  const km = withDistance ? fillMatrix(N, N, 0) : undefined;

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) {
        minutes[i][j] = 0;
        if (withDistance && km) km[i][j] = 0;
        continue;
      }
      const est = estimateTwoPoints(places[i], places[j], mode);
      minutes[i][j] = est.minutes;
      if (withDistance && km) km[i][j] = est.km;
    }
  }
  return { minutes, ...(withDistance ? { km } : {}) };
}

/**
 * 兩點本地估算（haversine + 市區速度假設）
 * 速度（km/h）：walk 4、transit 18、drive 28（保守估）
 * @returns {{ minutes:number, km:number }}
 */
function estimateTwoPoints(a, b, mode = 'driving') {
  if (!a || !b) return { minutes: 12, km: 3.0 };
  const lat1 = a.latitude ?? a.lat, lon1 = a.longitude ?? a.lng;
  const lat2 = b.latitude ?? b.lat, lon2 = b.longitude ?? b.lng;

  const km = +haversine(lat1, lon1, lat2, lon2).toFixed(2);
  const speedKmh =
    mode === 'walking' ? 4 :
    mode === 'transit' ? 18 :
    28;
  const minutes = Math.max(1, Math.round((km / Math.max(speedKmh, 1)) * 60));
  return { minutes, km };
}

/** Haversine great-circle 距離（公里） */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半徑 km
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default {
  getEtaMatrix,
  getLegTimes,
};
