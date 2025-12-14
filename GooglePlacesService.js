// services/GooglePlacesService.js
import Constants from 'expo-constants';

const G_API_KEY =
  Constants?.expoConfig?.extra?.GOOGLE_MAPS_API_KEY ||
  Constants?.manifest?.extra?.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

/** 常用地區中心點（可依需求擴充） */
const REGION_CENTERS = {
  北部: { lat: 25.0418, lng: 121.5360, radius: 14000 }, // 台北市心
  中部: { lat: 24.1477, lng: 120.6736, radius: 14000 }, // 台中市心
  南部: { lat: 22.6273, lng: 120.3014, radius: 14000 }, // 高雄市心
};

/** 標籤 → Google Places 類型對照 */
export const TAG_TO_TYPES = {
  '美食吃爆': ['restaurant', 'food'],
  '甜點控': ['bakery', 'cafe', 'dessert'],
  '咖啡廳巡禮': ['cafe', 'bakery', 'restaurant'],
  '在地小吃': ['restaurant', 'meal_takeaway', 'food'],
  '早午餐': ['cafe', 'restaurant'],

  // 🌳 自然系
  '自然景點': ['tourist_attraction', 'park', 'natural_feature'],
  '海邊放空': ['beach', 'natural_feature', 'tourist_attraction'],
  '登山健行': ['park', 'natural_feature', 'campground'],
  '賞花賞景': ['park', 'tourist_attraction', 'natural_feature'],

  // 🎌 文化系
  '文青散步': ['cafe', 'art_gallery', 'book_store'],
  '歷史文化': ['museum', 'church', 'hindu_temple', 'mosque', 'synagogue'],
  '藝術展覽': ['art_gallery', 'museum'],
  '宗教建築': ['church', 'hindu_temple', 'mosque', 'synagogue'],

  // 🛍 逛街系
  '商圈購物': ['shopping_mall', 'department_store', 'clothing_store'],
  '文創小店': ['book_store', 'art_gallery', 'shopping_mall'],
  'Outlet購物': ['shopping_mall', 'department_store'],
  '夜市文化': ['shopping_mall', 'restaurant', 'food'],

  // 🌙 夜生活系
  '夜生活': ['bar', 'night_club', 'casino'],
  '看夜景': ['tourist_attraction', 'point_of_interest'],
  '酒吧微醺': ['bar', 'pub', 'night_club'],

  // 🚶‍♀️ 放鬆系
  '慢步散心': ['park', 'tourist_attraction', 'cafe'],
  'SPA放鬆': ['spa', 'beauty_salon'],
  '泡湯溫泉': ['spa', 'lodging'],

  // 🎢 家庭 / 情侶
  '親子同樂': ['amusement_park', 'zoo', 'aquarium'],
  '情侶約會': ['cafe', 'restaurant', 'movie_theater'],
  '寵物友善': ['park', 'cafe', 'restaurant'],

  // 🎭 娛樂系
  '電影院': ['movie_theater'],
  '音樂演出': ['night_club', 'art_gallery', 'tourist_attraction'],
  '遊樂園': ['amusement_park'],

  // 🚗 交通景點
  '打卡地標': ['tourist_attraction', 'point_of_interest'],
  '知名建築': ['museum', 'city_hall', 'tourist_attraction'],
};

const DEFAULT_PER_TYPE = 6;

function mapPlaceBasic(p) {
  const loc = p.geometry?.location || {};
  const types = Array.isArray(p.types) ? p.types : [];
  const item = {
    id: p.place_id,
    placeId: p.place_id,
    name: p.name,
    address: p.vicinity || p.formatted_address || '',
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    latitude: Number(loc.lat),
    longitude: Number(loc.lng),
    rating: p.rating ?? null,
    user_ratings_total: p.user_ratings_total ?? 0,
    price_level: p.price_level ?? null,
    types,
    tags: types,
    opening_hours: p.opening_hours || null,
    photos: p.photos || [],
    photoUrl: null,
    city: '',
  };
  return item;
}

function popularityScore(p) {
  const r = Number(p.rating || 0);
  const n = Number(p.user_ratings_total || 0);
  return r * Math.log(1 + n);
}

function dedupeByPlaceId(list) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const id = x.placeId || x.id;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(x);
  }
  return out;
}

async function nearbySearch({ center, type, keyword, radius }) {
  if (!G_API_KEY) return [];
  const base = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
  const params = new URLSearchParams({
    key: G_API_KEY,
    location: `${center.lat},${center.lng}`,
    radius: String(radius || 15000),
    type,
  });
  if (keyword) params.set('keyword', keyword);

  const url = `${base}?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data?.results?.length) return [];
  return data.results.map(mapPlaceBasic);
}

// 🔥 新增：搜尋建議 (Autocomplete)
export async function getPlacePredictions(query) {
  if (!query || query.length < 2) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&components=country:tw&language=zh-TW&key=${G_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === 'OK') {
      return data.predictions.map(p => ({
        id: p.place_id,
        name: p.structured_formatting.main_text,
        address: p.structured_formatting.secondary_text,
      }));
    }
    return [];
  } catch (error) {
    console.error("Autocomplete error:", error);
    return [];
  }
}

// 🔥 新增：計算真實交通時間 (Directions API)
export async function getTravelDuration(origin, destination, mode = 'driving') {
  if (!origin || !destination) return 30; // 預設緩衝
  if (!G_API_KEY) return 30; // 沒 Key 就直接回傳預設值

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&language=zh-TW&key=${G_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0 && data.routes[0].legs.length > 0) {
      // value 是秒數，轉成分鐘
      const durationSecs = data.routes[0].legs[0].duration.value;
      return Math.ceil(durationSecs / 60);
    }
    
    console.warn('Google API 無法計算交通時間，使用預設值');
    return 30;
  } catch (error) {
    console.error("Directions API error:", error);
    return 30;
  }
}

function tagToGoogleTypes(tag) {
  return TAG_TO_TYPES[tag] || [];
}

export async function fetchPlacesWeighted(
  region = '北部',
  tags = ['美食吃爆', '自然景點'],
  options = {}
) {
  const perType = Number(options?.perType || DEFAULT_PER_TYPE);
  const center = REGION_CENTERS[region] || REGION_CENTERS['北部'];
  const radius = options.radius || center.radius || 14000;

  if (!G_API_KEY) {
    const mock = mockPlaces(region, tags);
    return mock
      .map((p) => normalizeOpeningHours(p))
      .map((p) => enrichPlaceFields(p))
      .sort((a, b) => popularityScore(b) - popularityScore(a));
  }

  try {
    let collected = [];
    for (const tag of tags || []) {
      const types = tagToGoogleTypes(tag);
      for (const tp of types) {
        const rows = await nearbySearch({ center, type: tp, radius });
        const top = rows.sort((a, b) => popularityScore(b) - popularityScore(a)).slice(0, perType);
        collected.push(...top);
      }
    }

    if (collected.length < perType * 2) {
      const extra = await nearbySearch({ center, type: 'tourist_attraction', radius });
      collected.push(...extra.slice(0, perType));
    }

    const deduped = dedupeByPlaceId(collected);
    const enriched = deduped
      .map((p) => normalizeOpeningHours(p))
      .map((p) => enrichPlaceFields(p));

    const sorted = enriched.sort((a, b) => popularityScore(b) - popularityScore(a));
    return sorted;
  } catch (err) {
    console.warn('[GooglePlacesService] fetchPlacesWeighted error:', err?.message || err);
    const fallback = mockPlaces(region, tags);
    return fallback
      .map((p) => normalizeOpeningHours(p))
      .map((p) => enrichPlaceFields(p))
      .sort((a, b) => popularityScore(b) - popularityScore(a));
  }
}

export function normalizeOpeningHours(place) {
  if (Array.isArray(place.open_hours)) return place;
  const periods = place.opening_hours?.periods || place.openingHours?.periods || null;
  const parsed = Array.isArray(periods)
    ? periods.map((p) => {
        const s = p.open?.time || '0900';
        const e = p.close?.time || '2100';
        return {
          weekday: toWeekday(p.open?.day),
          start: fmtHHMM(s),
          end: fmtHHMM(e),
        };
      })
    : null;
  const fallback = [{ weekday: -1, start: '10:00', end: '20:00' }];
  return { ...place, open_hours: parsed && parsed.length ? parsed : fallback };
}

export function enrichPlaceFields(place) {
  const types = place.types || place.tags || [];
  const stayByType = () => {
    if (types.includes('museum') || types.includes('博物館')) return 90;
    if (types.includes('shopping_mall') || types.includes('購物')) return 80;
    if (types.includes('cafe') || types.includes('咖啡')) return 40;
    if (types.includes('restaurant') || types.includes('餐廳')) return 60;
    return 60;
  };

  return {
    ...place,
    avg_stay_min: place.avg_stay_min ?? stayByType(),
    price_level:
      place.price_level ??
      (typeof place.price === 'number' ? place.price : 2),
    user_ratings_total: place.user_ratings_total ?? place.reviews ?? 0,
  };
}

function toWeekday(v) {
  const n = Number.isInteger(v) ? v : 0;
  return Math.min(Math.max(n, 0), 6);
}
function fmtHHMM(s) {
  const txt = String(s || '0900');
  return `${txt.slice(0, 2)}:${txt.slice(2, 4)}`;
}

function mockPlaces(region = '北部', tags = []) {
  // ... (保留原本的 Mock 資料，這裡省略以節省篇幅，請保留你原本的內容) ...
  // 如果你需要我把這裡也貼出來，請告訴我
  return []; 
}

// ✅ 記得匯出新增的函式
export default {
  fetchPlacesWeighted,
  normalizeOpeningHours,
  enrichPlaceFields,
  getPlacePredictions, // 新增
  getTravelDuration,   // 新增
};