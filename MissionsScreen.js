// screens/MissionsScreen.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  SectionList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Pressable,
  Platform,
  Vibration 
} from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Firebase
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  writeBatch, 
  serverTimestamp,
  updateDoc,
  query, // 🔥 務必引入 query
  where  // 🔥 務必引入 where
} from 'firebase/firestore';
import { db } from '../firebase'; 

const GOOGLE_API_KEY = 'AIzaSyCH_XC3ju87XIlYjfcZd6B8BXr-7wQcYmo';

const COLORS = {
  primary: '#0b1d3d',
  accent: '#10b981',
  bg: '#f8f9fa',
  text: '#334155',
  subText: '#94a3b8',
  border: '#e2e8f0',
  white: '#ffffff',
  debug: '#ef4444',
  navBlue: '#007AFF',
  completedBg: '#f3f4f6', 
  completedText: '#9ca3af', 
};

function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371e3; 
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 🔍 Google API 查座標
async function fetchGoogleCoordinates(queryStr) {
  if (!GOOGLE_API_KEY) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(queryStr)}&key=${GOOGLE_API_KEY}&language=zh-TW&region=tw`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const result = data.results[0];
      return { 
        lat: result.geometry.location.lat, 
        lng: result.geometry.location.lng, 
        address: result.formatted_address, 
        placeId: result.place_id 
      };
    }
    return null;
  } catch (error) { return null; }
}

function extractPlacesFromPlan(planLike) {
  if (!planLike) return [];
  const daysArr = planLike.dailyPlans || planLike.plans || (Array.isArray(planLike) ? planLike : []);
  const out = [];
  daysArr.forEach((dayObj, i) => {
    const dayNo = dayObj.day || (i + 1);
    const places = dayObj.places || dayObj.items || dayObj.spots || [];
    places.forEach((p, idx) => {
      const lat = p.lat || p.location?.lat || p.geometry?.location?.lat;
      const lng = p.lng || p.location?.lng || p.geometry?.location?.lng;
      out.push({
        ...p,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        day: dayNo,
        sequence: idx + 1
      });
    });
  });
  return out;
}

export default function MissionsScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [userId, setUserId] = useState('guest');
  const [myLoc, setMyLoc] = useState(null);
  const [missions, setMissions] = useState([]); 
  const [historyTrips, setHistoryTrips] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [debugMsg, setDebugMsg] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('username').then(u => u && setUserId(u));
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.getCurrentPositionAsync({}).then(loc => {
          setMyLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        });
      }
    });
  }, []);

  // 🔥 修改：嚴格抓取「我的」任務
  const fetchMissions = async () => {
    if (!userId || userId === 'guest') return; // 防止未登入抓取
    
    setLoading(true);
    try {
      // 使用 query + where 進行後端過濾，只抓 owner == userId
      const q = query(collection(db, 'missions'), where('owner', '==', userId));
      const snap = await getDocs(q);
      
      const list = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      
      setMissions(list);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setLoading(false); 
    }
  };

  useFocusEffect(useCallback(() => { fetchMissions(); }, [userId]));

  const fetchHistoryTrips = async () => {
    setImporting(true);
    setImportProgress('讀取行程列表...');
    const results = [];
    const myGroupIds = new Set(); 
    try {
      const groupSnap = await getDocs(collection(db, 'groups'));
      groupSnap.forEach(doc => {
        const d = doc.data();
        if ((d.members && d.members.includes(userId)) || d.owner === userId || d.creator === userId) {
          myGroupIds.add(doc.id);
        }
      });
      const aiSnap = await getDocs(collection(db, 'itineraries'));
      aiSnap.forEach(doc => {
        const d = doc.data();
        if (d.plan || d.legacy?.plan) {
           const isMine = d.owner === userId;
           const isMyGroup = d.groupId && myGroupIds.has(d.groupId);
           if (isMine || isMyGroup) {
             results.push({ 
               id: doc.id, type: 'AI', title: d.groupName || d.name, region: d.region, days: d.days, rawPlan: d.plan || d.legacy?.plan, groupId: d.groupId 
             });
           }
        }
      });
      const manualSnap = await getDocs(collection(db, 'manualPlans'));
      manualSnap.forEach(doc => {
        const d = doc.data();
        if (d.owner === userId) {
          results.push({ 
            id: doc.id, type: 'Manual', title: d.title || d.name, region: '自訂', days: d.days, rawPlan: d 
          });
        }
      });
      setHistoryTrips(results);
      setImportModalVisible(true);
    } catch (e) { Alert.alert("讀取失敗", e.message); } finally { setImporting(false); setImportProgress(''); }
  };

  const confirmAndImport = (trip) => {
    Alert.alert(
      "匯入確認",
      "即將匯入新行程。\n\n保留：已完成任務、額外手動任務\n移除：舊行程的未完成任務",
      [
        { text: "取消", style: "cancel" },
        { text: "開始匯入", style: 'destructive', onPress: () => handleImport(trip) }
      ]
    );
  };

  const handleImport = async (trip) => {
    let planData = trip.rawPlan;
    if (!planData && trip.type === 'Group') {
        const found = historyTrips.find(t => t.type === 'AI' && t.groupId === trip.id);
        if (found) planData = found.rawPlan;
        else { Alert.alert('無法匯入', '此群組尚未產生或儲存 AI 行程。'); return; }
    }
    setImportModalVisible(false);
    setImporting(true);
    setImportProgress('準備匯入...');
    try {
      const places = extractPlacesFromPlan(planData);
      if (places.length === 0) throw new Error("行程中沒有景點");

      const batchDelete = writeBatch(db);
      
      missions.forEach(m => {
          if(m.owner === userId) {
              const isManualExtra = m.badgeIcon === '📍' || !m.day;
              const isCompleted = m.isCompleted;

              if (!isCompleted && !isManualExtra) {
                  batchDelete.delete(doc(db, 'missions', m.id));
              }
          }
      });
      await batchDelete.commit();

      const batch = writeBatch(db);
      
      let processedCount = 0;
      for (const p of places) {
        setImportProgress(`匯入中 ${processedCount + 1}/${places.length}...`);
        let lat = p.lat, lng = p.lng, addr = p.address, pid = p.placeId;
        if (!lat || !lng) {
           const queryStr = `${p.name} ${trip.region || ''} 台灣`;
           const gRes = await fetchGoogleCoordinates(queryStr);
           if (gRes) { lat = gRes.lat; lng = gRes.lng; addr = gRes.address; pid = gRes.placeId; }
        }
        if (lat && lng) {
            const docId = `m_${Math.random().toString(36).substr(2, 9)}`;
            const ref = doc(db, 'missions', docId);
            const missionData = {
                id: docId, owner: userId, name: p.name, lat, lng, placeId: pid || null, city: addr || '',
                day: p.day, sequence: p.sequence, sourceTripId: trip.id, sourceTripName: trip.title,
                badgeIcon: trip.type === 'Manual' ? '📝' : '🤖', createdAt: serverTimestamp(), isCompleted: false
            };
            batch.set(ref, missionData, { merge: true });
        }
        processedCount++;
      }
      await batch.commit();
      
      await fetchMissions();
      
      Alert.alert('匯入成功', `已切換至「${trip.title}」！\n(已完成與額外任務均保留)`);
    } catch (e) { console.error(e); Alert.alert('匯入錯誤', e.message); } finally { setImporting(false); setImportProgress(''); }
  };

  const goToMap = (mission) => {
    navigation.navigate('Map', {
        openDetail: true,
        focus: { id: mission.placeId || mission.id, placeId: mission.placeId, name: mission.name, lat: mission.lat, lng: mission.lng, latitude: mission.lat, longitude: mission.lng, address: mission.city },
        from: 'Missions'
    });
  };

  // 🔥 分組邏輯：Day 1, Day 2 ... 額外任務 ... 已完成
  const groupedMissions = useMemo(() => {
    const processed = missions.map(m => ({ ...m, dist: myLoc ? getDistance(myLoc.lat, myLoc.lng, m.lat, m.lng) : null }));
    const activeMissions = processed.filter(m => !m.isCompleted);
    const completedMissions = processed.filter(m => m.isCompleted);

    activeMissions.sort((a, b) => {
      const dayA = typeof a.day === 'number' ? a.day : 9999;
      const dayB = typeof b.day === 'number' ? b.day : 9999;
      
      if (dayA !== dayB) return dayA - dayB;
      
      const seqA = Number(a.sequence) || 999; 
      const seqB = Number(b.sequence) || 999;
      return seqA - seqB;
    });

    const groupsObj = {};
    activeMissions.forEach(m => {
      // 只有當 day 是數字時才分天數，否則歸類為額外任務
      const d = (typeof m.day === 'number') ? `Day ${m.day}` : '額外任務';
      if (!groupsObj[d]) groupsObj[d] = [];
      groupsObj[d].push(m);
    });

    const result = Object.keys(groupsObj).map(key => ({ title: key, data: groupsObj[key] }));

    if (completedMissions.length > 0) {
      completedMissions.sort((a,b) => {
         const dayA = Number(a.day) || 999; const dayB = Number(b.day) || 999; return dayA - dayB;
      });
      result.push({ title: '✅ 已完成', data: completedMissions });
    }
    return result;
  }, [missions, myLoc]);

  const checkIn = async (mission) => {
    if (!myLoc) return Alert.alert("定位中...");
    if (mission.isCompleted) return;
    const dist = getDistance(myLoc.lat, myLoc.lng, mission.lat, mission.lng);
    if (dist <= 100) {
      try {
        const missionRef = doc(db, 'missions', mission.id);
        await updateDoc(missionRef, { isCompleted: true });
        setMissions(prev => prev.map(m => m.id === mission.id ? { ...m, isCompleted: true } : m));
        Alert.alert("🎉 打卡成功！", `恭喜完成 ${mission.name} 的探索！`);
      } catch (e) { console.error(e); Alert.alert("錯誤", "打卡狀態更新失敗，請檢查網路"); }
    } else { Alert.alert("還太遠囉", `距離 ${Math.round(dist)} 公尺`); }
  };

  const showDebugMenu = (mission) => {
    Vibration.vibrate(100); 
    Alert.alert(
      "🕵️‍♂️ 測試者模式",
      `要如何處理「${mission.name}」？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "🔄 重置為「未打卡」",
          onPress: async () => {
             try {
                const missionRef = doc(db, 'missions', mission.id);
                await updateDoc(missionRef, { isCompleted: false });
                setMissions(prev => prev.map(m => m.id === mission.id ? { ...m, isCompleted: false } : m));
                Alert.alert("🔄 重置成功", "已恢復為未完成狀態");
             } catch(e) { Alert.alert("錯誤", e.message); }
          }
        },
        {
           text: "🗑️ 徹底刪除",
           style: 'destructive',
           onPress: async () => {
              try {
                 await deleteDoc(doc(db, 'missions', mission.id));
                 setMissions(prev => prev.filter(m => m.id !== mission.id));
              } catch(e) { Alert.alert("錯誤", e.message); }
           }
        }
      ]
    );
  };

  const removeMission = (id) => {
    Alert.alert("刪除", "確定移除?", [
        { text: "取消" },
        { text: "刪除", style: 'destructive', onPress: async () => {
            await deleteDoc(doc(db, 'missions', id));
            setMissions(prev => prev.filter(m => m.id !== id));
        }}
    ]);
  };

  const renderSectionHeader = ({ section: { title } }) => (
    <View style={styles.sectionHeaderContainer}>
      <View style={[ 
          styles.dayBadge, 
          title === '✅ 已完成' && { backgroundColor: COLORS.accent },
          title === '額外任務' && { backgroundColor: COLORS.navBlue }
      ]}>
        <Text style={styles.dayBadgeText}>{title}</Text>
      </View>
      <View style={styles.sectionHeaderLine} />
    </View>
  );

  const renderItem = ({ item }) => {
    const isDone = item.isCompleted;
    return (
      <View style={[ styles.card, isDone && { opacity: 0.6, backgroundColor: COLORS.completedBg } ]}>
        <TouchableOpacity 
          style={styles.cardLeft} 
          onPress={() => goToMap(item)}
          onLongPress={() => isDone && showDebugMenu(item)}
          delayLongPress={3000}
        >
          <View style={[ styles.iconBox, isDone && { backgroundColor: '#d1fae5' } ]}>
            <Text style={{fontSize: 20}}>{isDone ? '✅' : (item.badgeIcon || '📍')}</Text>
          </View>
          <View style={{flex: 1}}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
               <Text style={[ styles.cardTitle, isDone && { textDecorationLine: 'line-through', color: COLORS.completedText } ]} numberOfLines={1}>
                 {item.name}
               </Text>
               {!isDone && <Ionicons name="map" size={16} color={COLORS.navBlue} style={{marginLeft: 4}} />}
            </View>
            <Text style={styles.cardSub} numberOfLines={1}>{item.city || item.sourceTripName}</Text>
            <Text style={[ styles.cardDist, item.dist < 500 && {color: COLORS.accent}, isDone && { color: COLORS.completedText } ]}>
              {isDone ? '任務達成' : (item.dist ? `距離 ${item.dist < 1000 ? Math.round(item.dist) + 'm' : (item.dist/1000).toFixed(1) + 'km'}` : '計算中...')}
            </Text>
          </View>
        </TouchableOpacity>
  
        <View style={styles.cardRight}>
          <TouchableOpacity 
            style={[ styles.checkInBtn, isDone && { backgroundColor: '#cbd5e1' } ]} 
            onPress={() => checkIn(item)}
            disabled={isDone}
          >
            <Text style={styles.checkInText}>{isDone ? '已打卡' : '打卡'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => removeMission(item.id)} style={{padding: 8}}>
            <Ionicons name="trash-outline" size={20} color="#999" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>探索任務</Text>
        <TouchableOpacity style={styles.importBtn} onPress={fetchHistoryTrips} disabled={importing}>
          {importing ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
            <>
              <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
              <Text style={styles.importText}>匯入行程</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {importing && (
        <View style={styles.progressContainer}>
            <Text style={styles.progressText}>{importProgress}</Text>
            <ActivityIndicator size="small" color="#666" style={{marginLeft: 8}} />
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : missions.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="map-marker-path" size={64} color="#ddd" />
          <Text style={styles.emptyText}>目前沒有任務</Text>
          <Text style={styles.emptySub}>點擊右上角「匯入行程」開始吧！</Text>
        </View>
      ) : (
        <SectionList
          sections={groupedMissions}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingBottom: 100 }}
          stickySectionHeadersEnabled={false} 
        />
      )}

      <Modal visible={importModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalBg} onPress={() => setImportModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>選擇歷史行程</Text>
                <Text style={{fontSize: 10, color: COLORS.debug, marginTop: 4}}>{debugMsg}</Text>
              </View>
              <TouchableOpacity onPress={() => setImportModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{maxHeight: 400}}>
              {historyTrips.map((trip, index) => (
                <TouchableOpacity key={index} style={styles.tripItem} onPress={() => confirmAndImport(trip)}>
                  <View style={[styles.tripIcon, { backgroundColor: trip.type === 'AI' ? '#e0f2fe' : '#fef3c7' }]}>
                    <Text>{trip.type === 'AI' ? '🤖' : '📝'}</Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
                    <Text style={styles.tripInfo}>{trip.days} 天・{trip.region}</Text>
                  </View>
                  <Ionicons name="download-outline" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#e0f2fe', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20
  },
  importText: { marginLeft: 4, color: COLORS.primary, fontWeight: 'bold' },
  progressContainer: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      padding: 8, backgroundColor: '#fffbe6'
  },
  progressText: { fontSize: 13, color: '#d97706', fontWeight: '600' },
  sectionHeaderContainer: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8, backgroundColor: COLORS.bg,
  },
  dayBadge: {
    backgroundColor: '#0b1d3d', paddingVertical: 6, paddingHorizontal: 16,
    borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomRightRadius: 2, borderBottomLeftRadius: 2,
  },
  dayBadgeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionHeaderLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0', marginLeft: 8, marginTop: 8 },
  card: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.white, marginHorizontal: 16, marginTop: 8, padding: 16,
    borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBox: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', marginRight: 12
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.subText, marginTop: 2 },
  cardDist: { fontSize: 12, color: COLORS.primary, marginTop: 2, fontWeight: '600' },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  checkInBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8
  },
  checkInText: { color: COLORS.white, fontSize: 12, fontWeight: 'bold' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#999', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#bbb', marginTop: 8 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  tripItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
  },
  tripIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f9ff',
    alignItems: 'center', justifyContent: 'center', marginRight: 12
  },
  tripTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  tripInfo: { fontSize: 12, color: COLORS.subText, marginTop: 2 },
});