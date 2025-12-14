// services/ItineraryService.js

import { app } from '../firebase';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

const db = getFirestore(app);

/* ------------------------- 工具 ------------------------- */

function coerceInt(n, fallback = 1) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** 取下一個版本號 */
async function getNextVersionNumber(tripId) {
  const versionsRef = collection(db, 'itineraries', tripId, 'versions');
  const q = query(versionsRef, orderBy('version', 'desc'), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return 1;
  const top = snap.docs[0].data();
  return coerceInt(top?.version, 0) + 1;
}

/** 取 root doc */
async function ensureItineraryRoot(tripId, baseMeta = {}) {
  const rootRef = doc(db, 'itineraries', tripId);
  const now = serverTimestamp();
  const snap = await getDoc(rootRef);
  if (!snap.exists()) {
    await setDoc(rootRef, {
      tripId,
      createdAt: now,
      updatedAt: now,
      ...baseMeta,
    });
  } else {
    await updateDoc(rootRef, { updatedAt: now, ...baseMeta });
  }
  return rootRef;
}

/* ------------------------- 對外 API ------------------------- */

export async function saveItinerary(groupId, payload = {}) {
  const tripId = String(groupId);
  const {
    region,
    days,
    tags,
    adoptedIndex = 0,
    plan,
    groupName,
  } = payload;

  // 1) 確保 root
  const rootRef = await ensureItineraryRoot(tripId, {
    groupId: tripId,
    groupName: groupName ?? null,
    region: region ?? null,
    days: Number(days ?? 1),
    tags: Array.isArray(tags) ? tags : [],
  });

  // 2) 新增版本
  const version = await getNextVersionNumber(tripId);
  const versionsRef = collection(db, 'itineraries', tripId, 'versions');

  const versionDoc = {
    version,
    plan: plan ?? null,
    meta: {
      region: region ?? null,
      days: Number(days ?? 1),
      tags: Array.isArray(tags) ? tags : [],
      adoptedIndex: Number(adoptedIndex ?? 0),
    },
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(versionsRef, String(version)), versionDoc);

  // 3) 更新 root 最後版本
  await updateDoc(rootRef, {
    lastSavedVersion: version,
    updatedAt: serverTimestamp(),
  });

  // 4) 向下相容
  await updateDoc(rootRef, {
    legacy: {
      groupId: tripId,
      region,
      days,
      tags,
      adoptedIndex,
      plan,
      savedAt: serverTimestamp(),
    },
  });

  // 5) 自動採用 (修正錯誤的關鍵在 adoptPlan 函式裡)
  await adoptPlan(tripId, version);

  return { tripId, version };
}

export async function saveItineraryVersion(tripId, planPayload, options = {}) {
  const version = coerceInt(options.version, await getNextVersionNumber(tripId));

  await ensureItineraryRoot(tripId);
  const versionsRef = collection(db, 'itineraries', tripId, 'versions');

  const docData = {
    version,
    plan: planPayload?.plan ?? planPayload ?? null,
    meta: { ...(planPayload?.meta || {}) },
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(versionsRef, String(version)), docData);

  await updateDoc(doc(db, 'itineraries', tripId), {
    lastSavedVersion: version,
    updatedAt: serverTimestamp(),
  });

  return { tripId, version };
}

/**
 * 採用某個版本
 */
export async function adoptPlan(tripId, version) {
  const rootRef = doc(db, 'itineraries', tripId);
  const vRef = doc(db, 'itineraries', tripId, 'versions', String(version));
  const vSnap = await getDoc(vRef);
  if (!vSnap.exists()) {
    console.warn(`Version ${version} not found, skip adopt.`);
    return;
  }

  const vData = vSnap.data();

  // 1) 標記 root
  await updateDoc(rootRef, {
    adoptedVersion: coerceInt(version, 1),
    adoptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2) 寫快照 (🔥 修正處：加了一層 snapshots 子集合)
  // 原本是: itineraries/{tripId}/adopted (3段，錯誤)
  // 現在是: itineraries/{tripId}/snapshots/adopted (4段，正確)
  const adoptedRef = doc(db, 'itineraries', tripId, 'snapshots', 'adopted');
  
  await setDoc(adoptedRef, {
    version: coerceInt(version, 1),
    plan: vData?.plan ?? null,
    meta: vData?.meta ?? {},
    adoptedAt: serverTimestamp(),
  });

  // 3) 同步 legacy
  await updateDoc(rootRef, {
    legacy: {
      ...(vData?.meta || {}),
      plan: vData?.plan ?? null,
      savedAt: serverTimestamp(),
    },
  });

  return { tripId, version };
}

/**
 * 讀取所有版本
 */
export async function getItineraryVersions(tripId) {
  const versionsRef = collection(db, 'itineraries', tripId, 'versions');
  const q = query(versionsRef, orderBy('version', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * 讀取已採用版本
 */
export async function getAdoptedItinerary(tripId) {
  // 🔥 修正處：讀取路徑也要同步改
  const adoptedRef = doc(db, 'itineraries', tripId, 'snapshots', 'adopted');
  const snap = await getDoc(adoptedRef);
  if (!snap.exists()) return null;
  return { id: 'adopted', ...snap.data() };
}

/**
 * 依 groupId 查詢
 */
export async function getAdoptedByGroup(groupId) {
  const tripId = String(groupId);
  return getAdoptedItinerary(tripId);
}

export default {
  saveItinerary,
  saveItineraryVersion,
  adoptPlan,
  getItineraryVersions,
  getAdoptedItinerary,
  getAdoptedByGroup,
};