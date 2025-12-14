// screens/MissionsScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../firebase';
import { metersBetween } from '../services/CheckInService';
import {
  awardBadgeForMission,
  hasCompletedMission,
  getCompletedMissionIdSet,
} from '../services/BadgeService';

const DIST_THRESHOLD = 100;
const MAX_IMPORT = 60;
const BATCH_LIMIT = 400;

/* ------------------------- utils ------------------------- */

function toNum(x) {
  const n = typeof x === 'string' ? parseFloat(x) : Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeLatLng(lat, lng) {
  const a = toNum(lat);
  const b = toNum(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;
  return { lat: a, lng: b };
}

function pickLatLng(p) {
  const rawLat =
    p?.lat ?? p?.latitude ?? p?.location?.lat ?? p?.geometry?.location?.lat ?? null;
  const rawLng =
    p?.lng ?? p?.longitude ?? p?.location?.lng ?? p?.geometry?.location?.lng ?? null;

  const latVal = typeof rawLat === 'function' ? rawLat() : rawLat;
  const lngVal = typeof rawLng === 'function' ? rawLng() : rawLng;

  return normalizeLatLng(latVal, lngVal);
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function makeMissionDocId(place) {
  const placeId = place?.placeId || place?.id || null;
  if (placeId) return String(placeId);

  const ll = pickLatLng(place);
  const key = `${place?.name || 'place'}|${ll?.lat}|${ll?.lng}`;
  return `m_${hashStr(key)}`;
}

// ✅ 抽景點時，把「第幾天」一起帶出來
function extractPlacesFromPlan(planLike) {
  if (!planLike) return [];

  const daily = Array.isArray(planLike.dailyPlans) ? planLike.dailyPlans : null;
  const plans = Array.isArray(planLike.plans) ? planLike.plans : null;
  const daysArr = daily || plans || [];

  const out = [];
  for (let i = 0; i < daysArr.length; i++) {
    const dayObj = daysArr[i];
    const dayNoRaw = dayObj?.day ?? dayObj?.dayNo ?? dayObj?.dayIndex ?? (i + 1);
    const dayNo = Number.isFinite(Number(dayNoRaw)) ? Number(dayNoRaw) : (i + 1);

    const places = Array.isArray(dayObj?.places)
      ? dayObj.places
      : Array.isArray(dayObj?.items)
      ? dayObj.items
      : [];

    for (const p of places) {
      const ll = pickLatLng(p);
      if (!ll) continue;
      out.push({ ...p, lat: ll.lat, lng: ll.lng, day: dayNo });
    }
  }

  // 去重：placeId/id 優先，否則 name+lat+lng
  const seen = new Set();
  const uniq = [];
  for (const p of out) {
    const key = p.placeId || p.id || `${p.name || ''}|${p.lat}|${p.lng}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq;
}

/* ------------------------- screen ------------------------- */

export default function MissionsScreen({ route }) {
  const navigation = useNavigation();
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;

  const [userId, setUserId] = useState(route?.params?.userId ?? 'demo@user.com');
  useEffect(() => {
    AsyncStorage.getItem('username').then((u) => u && setUserId(u));
  }, []);

  const [loc, setLoc] = useState(null);
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [completedSet, setCompletedSet] = useState(new Set());

  const [aiTrips, setAiTrips] = useState([]);
  const [manualTrips, setManualTrips] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // ✅ 新增：用來過濾顯示特定行程的 ID 與名稱
  const [filterTripId, setFilterTripId] = useState(null);
  const [filterTripName, setFilterTripName] = useState(null);

  const refreshAt = route?.params?.refreshAt;

  const getMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要定位權限才能打卡');
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({});
    const ll = normalizeLatLng(pos?.coords?.latitude, pos?.coords?.longitude);
    if (!ll) return null;
    setLoc(ll);
    return ll;
  };

  const loadMissions = async (my) => {
    const snap = await getDocs(collection(db, 'missions'));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const visible = all.filter((m) => !m.owner || m.owner === userId);

    const list = visible.map((m) => {
      const ll = normalizeLatLng(m.lat, m.lng);
      const dayNo = Number.isFinite(Number(m.day)) ? Number(m.day) : null;

      if (!ll || !my) {
        return {
          ...m,
          day: dayNo,
          lat: ll?.lat ?? m.lat,
          lng: ll?.lng ?? m.lng,
          distance: Infinity,
          _badCoord: true,
        };
      }
      const dist = metersBetween(my.lat, my.lng, ll.lat, ll.lng);
      return {
        ...m,
        day: dayNo,
        lat: ll.lat,
        lng: ll.lng,
        distance: Number.isFinite(dist) ? dist : Infinity,
        _badCoord: !Number.isFinite(dist),
      };
    });

    setMissions(list);
  };

  const loadTrips = async () => {
    const itSnap = await getDocs(collection(db, 'itineraries'));
    const ai = [];
    itSnap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      if (d.owner && d.owner !== userId) return;
      if (!d?.legacy?.plan) return;
      ai.push({ id: docSnap.id, ...d });
    });
    ai.sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() ?? (a.createdAt?.toMillis?.() ?? 0);
      const tb = b.updatedAt?.toMillis?.() ?? (b.createdAt?.toMillis?.() ?? 0);
      return tb - ta;
    });
    setAiTrips(ai);

    const mpSnap = await getDocs(collection(db, 'manualPlans'));
    const manual = [];
    mpSnap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      if (d.owner && d.owner !== userId) return;
      if (!d?.plans && !d?.dailyPlans) return;
      manual.push({ id: docSnap.id, ...d });
    });
    manual.sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() ?? (a.createdAt?.toMillis?.() ?? 0);
      const tb = b.updatedAt?.toMillis?.() ?? (b.createdAt?.toMillis?.() ?? 0);
      return tb - ta;
    });
    setManualTrips(manual);
  };

  const loadAll = async () => {
    const my = await getMyLocation();
    await loadMissions(my);

    const set = await getCompletedMissionIdSet(userId);
    setCompletedSet(set);

    await loadTrips();
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        await loadAll();
      } catch (err) {
        console.warn('Missions init error:', err);
        Alert.alert('讀取失敗', '無法載入任務清單，請稍後再試');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshAt, userId]);

  const handleCheckIn = async (mission) => {
    if (!loc) return;

    const ll = normalizeLatLng(mission.lat, mission.lng);
    if (!ll) {
      Alert.alert('座標異常', '這個任務沒有有效座標，無法打卡。');
      return;
    }

    const d = metersBetween(loc.lat, loc.lng, ll.lat, ll.lng);
    if (!Number.isFinite(d)) {
      Alert.alert('距離計算失敗', '請稍後再試。');
      return;
    }

    const done = await hasCompletedMission(userId, String(mission.id));
    if (done) {
      Alert.alert('已完成', '你已拿過這個徽章囉！');
      return;
    }

    if (d <= DIST_THRESHOLD) {
      await awardBadgeForMission(userId, mission);
      const nextSet = new Set(completedSet);
      nextSet.add(String(mission.id));
      setCompletedSet(nextSet);
      Alert.alert('🎉 打卡成功', `獲得徽章：${mission.badgeIcon} ${mission.name}`);
    } else {
      Alert.alert('還差一點', `距離約 ${Math.round(d)} 公尺，再靠近一點點！`);
    }
  };

  const handleDeleteMission = (mission) => {
    Alert.alert(
      '刪除任務',
      `確定要刪除「${mission.name}」嗎？\n此動作無法復原。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'missions', String(mission.id)));
              setMissions((prev) => prev.filter((m) => String(m.id) !== String(mission.id)));
            } catch (e) {
              console.error(e);
              Alert.alert('刪除失敗', '可能沒有權限（Firestore rules），或網路異常。');
            }
          },
        },
      ]
    );
  };

  const goToMap = (mission) => {
    const ll = normalizeLatLng(mission.lat, mission.lng);
    if (!ll) {
      Alert.alert('座標異常', '這個任務沒有有效座標，無法開啟地圖。');
      return;
    }

    const focus = {
      id: mission.placeId || mission.id,
      placeId: mission.placeId || null,
      name: mission.name,
      lat: ll.lat,
      lng: ll.lng,
      latitude: ll.lat,
      longitude: ll.lng,
      address: mission.city || '',
      badgeIcon: mission.badgeIcon || '📍',
      rating: mission.rating || null,
      photoUrl: mission.photoUrl || null,
      isMission: true,
    };

    const params = {
      focus,
      openDetail: true,
      from: 'Missions',
      returnTo: { name: 'Missions', params: { refreshAt: Date.now() } },
    };

    const parent = navigation.getParent?.();
    const parentState = parent?.getState?.();
    const hasMapInParent =
      !!parentState?.routeNames?.includes?.('Map') ||
      !!parentState?.routes?.some?.((r) => r.name === 'Map');

    if (hasMapInParent) { parent.navigate('Map', params); return; }

    const grand = parent?.getParent?.();
    const grandState = grand?.getState?.();
    const hasMapInGrand =
      !!grandState?.routeNames?.includes?.('Map') ||
      !!grandState?.routes?.some?.((r) => r.name === 'Map');

    if (hasMapInGrand) { grand.navigate('Map', params); return; }

    navigation.navigate('Map', params);
  };

  const importPlacesAsMissions = async (places, meta = {}) => {
    if (!places?.length) {
      Alert.alert('沒有可匯入的景點', '這個行程裡找不到有效座標的景點。');
      return;
    }

    setImporting(true);
    try {
      const slice = places.slice(0, Math.min(places.length, MAX_IMPORT));

      let batch = writeBatch(db);
      let countInBatch = 0;
      let total = 0;

      const flush = async () => {
        if (countInBatch === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        countInBatch = 0;
      };

      for (const p of slice) {
        const ll = normalizeLatLng(p.lat, p.lng);
        if (!ll) continue;

        const id = makeMissionDocId(p);
        const dayNo = Number.isFinite(Number(p.day)) ? Number(p.day) : null;

        const payload = {
          owner: userId,
          name: p.name || '未命名地點',
          placeId: p.placeId || p.id || null,
          lat: ll.lat,
          lng: ll.lng,
          day: dayNo, // ✅ 存第幾天，後面才能 Day1/Day2 排序
          city: p.address || p.city || meta.region || '',
          rating: p.rating ?? null,
          photoUrl: p.photoUrl ?? p.photo ?? null,
          badgeIcon: meta.badgeIcon || '📍',
          source: meta.source || 'history',
          sourceTripId: meta.tripId || null,
          sourceTripName: meta.tripName || null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        };

        batch.set(doc(db, 'missions', String(id)), payload, { merge: true });
        countInBatch += 1;
        total += 1;

        if (countInBatch >= BATCH_LIMIT) await flush();
      }

      await flush();

      Alert.alert('✅ 匯入完成', `已切換至行程：${meta.tripName || '未命名'}`);
      setPickerOpen(false);

      // ✅ 匯入後，直接設定過濾條件，只顯示這個行程
      if (meta.tripId) {
        setFilterTripId(meta.tripId);
        setFilterTripName(meta.tripName || '自訂行程');
      }

      const my = loc || (await getMyLocation());
      await loadMissions(my);
      const set = await getCompletedMissionIdSet(userId);
      setCompletedSet(set);
    } catch (e) {
      console.error(e);
      Alert.alert('匯入失敗', '可能沒有寫入權限（Firestore rules），或網路異常。');
    } finally {
      setImporting(false);
    }
  };

  const importFromAiTrip = (trip) => {
    const plan = trip?.legacy?.plan || null;
    const places = extractPlacesFromPlan(plan);

    Alert.alert(
      '匯入任務',
      `要把「${trip.groupName || '未命名行程'}」的景點匯入成任務嗎？\n（會自動去重、只匯入前 ${MAX_IMPORT} 個）`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確定',
          onPress: () =>
            importPlacesAsMissions(places, {
              source: 'itineraries',
              tripId: trip.groupId || trip.id,
              tripName: trip.groupName || '未命名行程',
              region: trip.region || '',
              badgeIcon: '📍',
            }),
        },
      ]
    );
  };

  const importFromManualTrip = (planDoc) => {
    const places = extractPlacesFromPlan(planDoc);

    Alert.alert(
      '匯入任務',
      `要把「${planDoc.title || planDoc.name || planDoc.id}」的景點匯入成任務嗎？\n（會自動去重、只匯入前 ${MAX_IMPORT} 個）`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確定',
          onPress: () =>
            importPlacesAsMissions(places, {
              source: 'manualPlans',
              tripId: planDoc.planId || planDoc.id,
              tripName: planDoc.title || planDoc.name || planDoc.id,
              region: '',
              badgeIcon: '📍',
            }),
        },
      ]
    );
  };

  const header = useMemo(() => {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Text style={styles.title}>📍 附近任務</Text>
        
        {/* ✅ 修改：顯示目前過濾狀態 */}
        {filterTripId ? (
           <View style={{ marginBottom: 8 }}>
             <Text style={styles.sub}>
               正在顯示行程：<Text style={{ fontWeight: 'bold', color: '#0b1d3d' }}>{filterTripName}</Text>
             </Text>
             <Text style={styles.sub}>（其他行程的任務已隱藏）</Text>
           </View>
        ) : (
           <Text style={styles.sub}>（靠近 ≤ {DIST_THRESHOLD}m 可完成打卡）</Text>
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
             {filterTripId ? '行程任務列表' : '所有未完成任務'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* 如果正在過濾，顯示「顯示全部」按鈕 */}
            {filterTripId && (
              <TouchableOpacity 
                style={[styles.importTopBtn, { borderColor: '#666' }]} 
                onPress={() => {
                  setFilterTripId(null);
                  setFilterTripName(null);
                }}
              >
                <Text style={[styles.importTopBtnText, { color: '#666' }]}>顯示全部</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.importTopBtn} onPress={() => setPickerOpen(true)}>
              <Text style={styles.importTopBtnText}>
                {filterTripId ? '切換行程' : '匯入行程'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {importing ? <Text style={styles.gray}>匯入中…</Text> : null}
      </View>
    );
  }, [importing, filterTripId, filterTripName]);

  const makeEmptyItem = (key, text) => ({ _empty: true, id: key, _emptyText: text });

  // ✅ Day1/Day2 排序 + 根據 filterTripId 過濾 (含已完成)
  const sections = useMemo(() => {
    // 1. 先過濾出「要顯示的任務」
    let visibleMissions = missions;
    
    // 如果有設定 filterTripId，就只留該行程的任務
    if (filterTripId) {
      visibleMissions = missions.filter(m => m.sourceTripId === filterTripId);
    }

    const isDone = (m) => completedSet.has(String(m.id));
    const incomplete = [];
    const completed = [];

    // 2. 針對過濾後的任務進行分類
    for (const m of visibleMissions) {
      if (isDone(m)) completed.push(m);
      else incomplete.push(m);
    }

    const byDist = (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity);

    // 分組：day -> items
    const dayMap = new Map(); // key: number | 'none'
    for (const m of incomplete) {
      const d = Number.isFinite(Number(m.day)) ? Number(m.day) : null;
      const key = d ?? 'none';
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key).push(m);
    }

    // 依 day 由小到大
    const dayKeys = [...dayMap.keys()]
      .filter((k) => k !== 'none')
      .sort((a, b) => Number(a) - Number(b));

    const out = [];

    for (const k of dayKeys) {
      const arr = dayMap.get(k) || [];
      arr.sort(byDist);
      out.push({
        title: `Day ${k}（依距離）`,
        data: arr,
      });
    }

    if (dayMap.has('none')) {
      const arr = dayMap.get('none') || [];
      arr.sort(byDist);
      out.push({
        title: '未分天數（依距離）',
        data: arr.length ? arr : [makeEmptyItem('__empty_none__', '這裡目前沒有未完成任務')],
      });
    }

    completed.sort(byDist);
    
    // 根據是否有 Filter 改變標題
    const completedTitle = filterTripId 
      ? '✅ 此行程已完成（依距離）' 
      : '✅ 全部已完成（依距離）';

    out.push({
      title: completedTitle,
      data: completed.length ? completed : [makeEmptyItem('__empty_done__', '目前沒有已完成的任務')],
    });

    return out;
  }, [missions, completedSet, filterTripId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color="#0b1d3d" />
      </SafeAreaView>
    );
  }

  const renderActionButtons = (m) => (
    <View style={styles.row}>
      <TouchableOpacity style={styles.btn} onPress={() => handleCheckIn(m)}>
        <Text style={styles.btnText}>
          {completedSet.has(String(m.id)) ? '已完成' : '打卡'}
        </Text>
      </TouchableOpacity>

      <View style={{ width: 8 }} />

      <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => goToMap(m)}>
        <Text style={[styles.btnText, styles.btnOutlineText]}>查看地點</Text>
      </TouchableOpacity>

      <View style={{ width: 8 }} />

      <TouchableOpacity style={[styles.btn, styles.btnDangerOutline]} onPress={() => handleDeleteMission(m)}>
        <Text style={[styles.btnText, styles.btnDangerText]}>刪除</Text>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }) => {
    if (item?._empty) {
      return (
        <View style={styles.emptySectionCard}>
          <Text style={styles.emptySectionText}>{item._emptyText}</Text>
        </View>
      );
    }

    const bad = item._badCoord || !Number.isFinite(item.distance) || item.distance === Infinity;
    const dayLabel = Number.isFinite(Number(item.day)) ? `・Day ${Number(item.day)}` : '';

    return (
      <View style={styles.card}>
        <Text style={styles.itemTitle}>
          {item.badgeIcon} {item.name}
        </Text>
        <Text style={styles.gray}>
          📍 {item.city || ''}{dayLabel}・距離 {bad ? '—' : `${Math.round(item.distance)} m`}
        </Text>
        {renderActionButtons(item)}
      </View>
    );
  };

  const renderSectionHeader = ({ section }) => (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', paddingTop: topInset }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 24 }}
        stickySectionHeadersEnabled={false}
      />

      {/* 匯入行程選單 */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>選擇要匯入的行程</Text>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 12 }}>
              <Text style={styles.modalSection}>🌟 AI 智慧行程</Text>
              {aiTrips.length === 0 ? (
                <Text style={styles.modalGray}>找不到可匯入的 AI 行程（需有 legacy.plan）。</Text>
              ) : (
                aiTrips.slice(0, 20).map((t) => (
                  <TouchableOpacity key={`ai-${t.id}`} style={styles.pickRow} onPress={() => importFromAiTrip(t)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickTitle} numberOfLines={1}>{t.groupName || '未命名行程'}</Text>
                      <Text style={styles.pickMeta}>🗓 {t.days || 1} 天　📍 {t.region || '—'}</Text>
                    </View>
                    <Text style={styles.pickGo}>匯入</Text>
                  </TouchableOpacity>
                ))
              )}

              <Text style={[styles.modalSection, { marginTop: 14 }]}>📝 自訂手動行程</Text>
              {manualTrips.length === 0 ? (
                <Text style={styles.modalGray}>找不到可匯入的自訂行程。</Text>
              ) : (
                manualTrips.slice(0, 20).map((p) => (
                  <TouchableOpacity key={`m-${p.id}`} style={styles.pickRow} onPress={() => importFromManualTrip(p)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickTitle} numberOfLines={1}>{p.title || p.name || p.id}</Text>
                      <Text style={styles.pickMeta}>🗓 {p.days || (Array.isArray(p.plans) ? p.plans.length : 1)} 天</Text>
                    </View>
                    <Text style={styles.pickGo}>匯入</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalCloseText}>關閉</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

  title: { fontSize: 20, fontFamily: 'GenRyuMin' },
  sub: { color: '#666', fontFamily: 'GenRyuMin', marginTop: 4 },

  sectionRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontFamily: 'GenRyuMin' },

  importTopBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0b1d3d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  importTopBtnText: { color: '#0b1d3d', fontFamily: 'GenRyuMin' },

  sectionHeaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontFamily: 'GenRyuMin',
    fontSize: 14,
    color: '#111827',
  },

  gray: { color: '#666', fontFamily: 'GenRyuMin', marginTop: 8 },

  row: { flexDirection: 'row', marginTop: 10 },

  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
  },
  itemTitle: { fontSize: 16, fontFamily: 'GenRyuMin', marginBottom: 6 },

  btn: { alignSelf: 'flex-start', backgroundColor: '#0b1d3d', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontFamily: 'GenRyuMin' },

  btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0b1d3d' },
  btnOutlineText: { color: '#0b1d3d' },

  btnDangerOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DC2626' },
  btnDangerText: { color: '#DC2626' },

  emptySectionCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
  },
  emptySectionText: { fontFamily: 'GenRyuMin', color: '#6b7280' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  modalTitle: { fontSize: 16, fontFamily: 'GenRyuMin', marginBottom: 10 },
  modalSection: { fontSize: 14, fontFamily: 'GenRyuMin' },
  modalGray: { fontSize: 12, fontFamily: 'GenRyuMin', color: '#666', marginTop: 6 },

  pickRow: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickTitle: { fontSize: 13, fontFamily: 'GenRyuMin' },
  pickMeta: { fontSize: 12, fontFamily: 'GenRyuMin', color: '#666', marginTop: 2 },
  pickGo: { fontFamily: 'GenRyuMin', color: '#0b1d3d' },

  modalCloseBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalCloseText: { fontFamily: 'GenRyuMin', color: '#0b1d3d' },
});