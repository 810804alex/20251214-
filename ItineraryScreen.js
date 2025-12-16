// screens/ItineraryScreen.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  StatusBar,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  FlatList,
  Keyboard,
  Animated,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🔥 1. 引入 AsyncStorage
import { Ionicons } from '@expo/vector-icons'; 
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useTheme } from '../theme';
import Card from '../components/ui/Card';
import Chip from '../components/ui/Chip';

// Services
import { fetchPlacesWeighted, getPlacePredictions, getTravelDuration, getPlaceDetails } from '../services/GooglePlacesService';
import { generateItineraryWithAI } from '../services/AIService';
import { saveItinerary, getAdoptedByGroup } from '../services/ItineraryService';
import { planItinerary } from '../services/SchedulerService';

/* ------------------------- 工具函式 (來自 Hao 的邏輯) ------------------------- */

// 🕒 時間計算工具
const timeToMin = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minToTime = (min) => {
  let h = Math.floor(min / 60);
  let m = min % 60;
  if (h >= 24) h = h % 24; 
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

function sortPlacesByTime(places) {
  return places.sort((a, b) => timeToMin(a.__start) - timeToMin(b.__start));
}

// 🔥 輔助函式：類型轉中文
function formatTag(type) {
    if (!type) return '景點';
    const map = {
        'restaurant': '餐廳', 'food': '美食', 'point_of_interest': '景點',
        'tourist_attraction': '熱門', 'store': '商店', 'night_club': '夜店',
        'bar': '酒吧', 'park': '公園', 'museum': '博物館', 'cafe': '咖啡廳',
        'bakery': '烘焙', 'shopping_mall': '購物', 'night_market': '夜市',
        'breakfast_restaurant': '早餐', 'meal_takeaway': '外帶',
        'lodging': '住宿', 'spa': 'SPA', 'amusement_park': '樂園',
        'zoo': '動物園', 'place_of_worship': '宗教', 'art_gallery': '藝文'
    };
    if (map[type]) return map[type];
    if (/[\u4e00-\u9fa5]/.test(type)) return type;
    return '景點';
}

// 🔥 1. 核心演算法：真實交通順延 + 智慧警示
async function smartReschedule(places, enableTimeShift = true) {
  let sorted = sortPlacesByTime([...places]);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    current.warning = null; 

    const currentStartH = parseInt(current.__start.split(':')[0], 10);
    const currentEndH = parseInt(current.__end.split(':')[0], 10);
    const name = (current.name || '').toLowerCase();
    const types = current.types || [];

    // 規則檢查 (防呆警示)
    const isNightMarket = name.includes('夜市') || types.includes('night_market');
    if (isNightMarket && currentStartH < 17) current.warning = "⚠️ 夜市通常傍晚才開始營業喔！";

    if (name.includes('豆漿') || name.includes('早餐') || types.includes('breakfast_restaurant') || types.includes('bakery')) {
        if (currentStartH >= 14) current.warning = "⚠️ 這家店可能已經打烊囉";
    }

    const isNightLife = isNightMarket || types.includes('bar') || types.includes('night_club') || types.includes('casino');
    if (!isNightLife && currentEndH >= 22) current.warning = "⚠️ 時間太晚了，請確認該地點是否營業";

    // 時間順延邏輯
    if (enableTimeShift) {
        const currentEndMin = timeToMin(current.__end);
        const nextStartMin = timeToMin(next.__start);

        let buffer = 15; // 預設交通緩衝 15 分鐘
        const arrivalTime = currentEndMin + buffer;
        
        if (arrivalTime > nextStartMin) {
          const originalDuration = timeToMin(next.__end) - timeToMin(next.__start);
          const newStart = arrivalTime;
          const newEnd = newStart + originalDuration;
          next.__start = minToTime(newStart);
          next.__end = minToTime(newEnd);
        }
    }
  }
  return sorted;
}

// 🔥 2. 智慧排序演算法
function autoOptimizeOrder(places) {
  const typePriority = {
    'bakery': 1, 'meal_takeaway': 1, 'cafe': 1, 'breakfast_restaurant': 1, 
    'park': 2, 'museum': 2, 'tourist_attraction': 2, 'zoo': 2, 'art_gallery': 2, 
    'department_store': 3, 'shopping_mall': 3, 'clothing_store': 3, 
    'restaurant': 4, 'dinner_theater': 4, 
    'night_club': 5, 'bar': 5, 'casino': 5, 'night_market': 5 
  };

  const scoredPlaces = places.map(p => {
    let score = 2.5; 
    const name = (p.name || '').toLowerCase();

    if (p.types && p.types.length > 0) {
        for (let t of p.types) {
            if (typePriority[t]) {
                score = typePriority[t];
                break;
            }
        }
    } 
    
    if (name.includes('夜市')) score = 4.5;
    if (name.includes('豆漿') || name.includes('早餐')) score = 1;

    return { ...p, _sortScore: score };
  });

  scoredPlaces.sort((a, b) => a._sortScore - b._sortScore);
  return scoredPlaces.map(({ _sortScore, ...keep }) => keep);
}

// 🔥 模擬 AI 思考過程的日誌庫
const AI_THINKING_LOGS = [
  "正在連線至運算核心...",
  "分析地理位置資料...",
  "檢索熱門景點權重...",
  "正在交叉比對營業時間...",
  "計算最佳路徑與交通耗時...",
  "正在避開擁擠時段...",
  "搜尋在地美食評分...",
  "正在進行行程最佳化排序...",
  "生成最終旅遊建議...",
  "正在校驗資料完整性...",
];

/* ------------------------- 主程式 ------------------------- */

export default function ItineraryScreen() {
  const t = useTheme();
  const route = useRoute();
  const navigation = useNavigation();

  // 🔥 終端機 ScrollView Ref
  const scrollViewRef = useRef(null);

  const groupId = route.params?.groupId ?? 'demo-group';
  const groupName = route.params?.groupName ?? '未命名群組';
  const region = route.params?.region ?? '北部';
  const days = Number(route.params?.days ?? 1);
  const tags = Array.isArray(route.params?.tags) ? route.params.tags : ['美食吃爆', '自然景點'];

  const [loading, setLoading] = useState(true);
  // 🔥 新增：當前使用者 ID
  const [userId, setUserId] = useState(null);
  
  // 🔥 動態日誌陣列
  const [logLines, setLogLines] = useState([]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [plans, setPlans] = useState([]); 
  const [planIndex, setPlanIndex] = useState(0);

  // Modal & Search States
  const [modalVisible, setModalVisible] = useState(false);
  const [targetDayIndex, setTargetDayIndex] = useState(0);
  const [newItem, setNewItem] = useState({ name: '', timeStart: '', timeEnd: '', type: '景點' });
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  // 客製化 Alert 狀態
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '' });

  const currentDailyPlans = useMemo(() => {
    if (!plans.length) return [];
    return plans[planIndex]?.dailyPlans ?? [];
  }, [plans, planIndex]);

  // 🔥 2. 初始化時抓取 User ID
  useEffect(() => {
    AsyncStorage.getItem('username').then(u => setUserId(u));
  }, []);

  // 🔥 輔助函式：新增一行日誌
  const addLog = (text) => {
    setLogLines(prev => [...prev, `> ${text}`]); 
  };

  const openMap = (placeName) => {
    const query = encodeURIComponent(placeName);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  const deletePlace = (dayIndex, placeIndex) => {
    setPlans((prev) => {
      const next = [...prev];
      const curPlan = { ...next[planIndex] };
      const daily = [...curPlan.dailyPlans];
      const targetDay = { ...daily[dayIndex] };
      const newPlaces = [...targetDay.places]; 
      newPlaces.splice(placeIndex, 1); 
      targetDay.places = newPlaces;
      daily[dayIndex] = targetDay;
      curPlan.dailyPlans = daily;
      next[planIndex] = curPlan;
      return next;
    });
  };

  const renderRightActions = (progress, dragX, dayIndex, placeIndex) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        onPress={() => {
          Alert.alert("刪除行程", "確定要刪除嗎？", [
            { text: "取消", style: "cancel" },
            { text: "刪除", style: "destructive", onPress: () => deletePlace(dayIndex, placeIndex) }
          ]);
        }}
        style={styles.deleteButtonContainer}
      >
        <Animated.Text style={[styles.deleteButtonText, { transform: [{ scale }] }]}>
          刪除
        </Animated.Text>
      </TouchableOpacity>
    );
  };

  const handleNameChange = async (text) => {
    setNewItem(prev => ({ ...prev, name: text }));
    if (text.length > 1) {
      const results = await getPlacePredictions(text);
      setSuggestions(results);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectPlace = async (place) => {
    setAddingItem(true); 
    try {
      let details = {};
      if (place.place_id) {
          details = await getPlaceDetails(place.place_id).catch(() => ({})); 
      }
      
      setNewItem(prev => ({ 
        ...prev, 
        name: place.name || details.name,
        address: details.formatted_address || place.description,
        location: details.geometry?.location, 
        types: details.types || [], 
        opening_hours: details.opening_hours 
      }));
      
    } catch (e) {
      console.warn("無法獲取詳細資訊");
      setNewItem(prev => ({ ...prev, name: place.name, address: place.description }));
    } finally {
      setAddingItem(false);
      setSuggestions([]);
      setShowSuggestions(false);
      Keyboard.dismiss();
    }
  };

  const openAddModal = (dayIndex) => {
    setTargetDayIndex(dayIndex);
    const dayPlan = currentDailyPlans[dayIndex];
    let defaultStart = '10:00';
    if (dayPlan && dayPlan.places.length > 0) {
        const lastPlace = dayPlan.places[dayPlan.places.length - 1];
        defaultStart = lastPlace.__end;
    }
    const defaultEndMin = timeToMin(defaultStart) + 60; 
    const defaultEnd = minToTime(defaultEndMin);

    setNewItem({ name: '', timeStart: defaultStart, timeEnd: defaultEnd, type: '自訂' });
    setSuggestions([]);
    setModalVisible(true);
  };

  const handleTimeChange = (text, field) => {
    const digits = text.replace(/\D/g, '');
    let formatted = digits;
    if (digits.length >= 3) {
      formatted = digits.slice(0, 2) + ':' + digits.slice(2, 4);
    }
    setNewItem(prev => ({ ...prev, [field]: formatted }));
  };

  const handleAddItem = async () => {
    if (!newItem.name) {
      Alert.alert("請輸入名稱");
      return;
    }
    
    setModalVisible(false);
    setAddingItem(true); 

    try {
      const nextPlans = JSON.parse(JSON.stringify(plans));
      const curPlan = nextPlans[planIndex];
      const targetDay = curPlan.dailyPlans[targetDayIndex];

      const manualPlace = {
        id: `manual-${Date.now()}`,
        name: newItem.name,
        address: newItem.address || "手動新增", 
        location: newItem.location, 
        rating: null,
        types: newItem.types && newItem.types.length > 0 ? newItem.types : [newItem.type],
        opening_hours: newItem.opening_hours,
        
        __start: newItem.timeStart,
        __end: newItem.timeEnd,
        stayMinutes: timeToMin(newItem.timeEnd) - timeToMin(newItem.timeStart),
        selected: true,
        isManual: true, 
      };

      let newPlaces = [...targetDay.places, manualPlace];
      
      newPlaces = await smartReschedule(newPlaces, false);

      targetDay.places = newPlaces;
      setPlans(nextPlans);

    } catch (error) {
      console.error("Add item error:", error);
      Alert.alert("新增失敗", "計算交通時間時發生錯誤");
    } finally {
      setAddingItem(false);
    }
  };

  const handleOptimize = async (dayIndex) => {
    setLoading(true);
    setLogLines([]);
    addLog("正在分析最佳路徑與營業時間...");
    
    try {
      const nextPlans = JSON.parse(JSON.stringify(plans));
      const curPlan = nextPlans[planIndex];
      const targetDay = curPlan.dailyPlans[dayIndex];

      const sortedPlaces = autoOptimizeOrder(targetDay.places);

      const firstPlaceStart = targetDay.places[0]?.__start || '10:00';
      if (sortedPlaces.length > 0) {
          const duration = timeToMin(sortedPlaces[0].__end) - timeToMin(sortedPlaces[0].__start);
          const startMin = timeToMin(firstPlaceStart);
          sortedPlaces[0].__start = firstPlaceStart;
          sortedPlaces[0].__end = minToTime(startMin + (duration > 0 ? duration : 60));
      }

      const finalPlaces = await smartReschedule(sortedPlaces, true);

      targetDay.places = finalPlaces;
      setPlans(nextPlans);
      
      showCustomAlert('✨ 優化完成', '行程已根據「最佳遊玩時段」自動重新排序！');

    } catch (e) {
      console.error(e);
      Alert.alert('錯誤', '排序失敗');
    } finally {
      setLoading(false);
    }
  };

  const buildItinerary = useCallback(async (triggerByRefresh = false) => {
    let logTimer = null;
    try {
      if (!triggerByRefresh) {
        setLoading(true);
        setLogLines([]); 
      }
      
      const userStyle = tags.length > 0 ? tags.join('、') : '熱門觀光';

      addLog(`初始化請求: ${groupName}`);
      await new Promise(r => setTimeout(r, 600));
      addLog(`設定參數: ${region}, ${days}天`);
      addLog(`風格標籤: ${userStyle}`);
      
      let logIdx = 0;
      logTimer = setInterval(() => {
        if (logIdx < AI_THINKING_LOGS.length) {
          addLog(AI_THINKING_LOGS[logIdx]);
          logIdx++;
        }
      }, 800);

      const aiResult = await generateItineraryWithAI(region, days, userStyle);

      if (logTimer) clearInterval(logTimer);

      if (aiResult && aiResult.length > 0) {
        addLog("運算完成！接收 payload...");
        addLog("正在解析 JSON 資料結構...");
        
        const aiDailyPlans = aiResult.map((dayPlan) => {
          let rawPlaces = dayPlan.places.map((p, idx) => ({
            id: `ai-${dayPlan.day}-${idx}`,
            name: p.name,
            address: p.reason,
            rating: null,
            types: [p.type],
            __start: p.time ? p.time.split('-')[0].trim() : '09:00',
            __end: p.time ? p.time.split('-')[1].trim() : '10:00',
            stayMinutes: 60,
            selected: true,
            isManual: false,
          }));
          rawPlaces = sortPlacesByTime(rawPlaces);
          return { day: dayPlan.day, places: rawPlaces, legs: [] };
        });
        
        addLog("正在渲染使用者介面...");
        await new Promise(r => setTimeout(r, 600)); 

        setPlans([{ dailyPlans: aiDailyPlans }]);
        setPlanIndex(0);
        return; 
      }
      
      // Fallback
      addLog("AI 回應逾時，切換備用演算法...");
      const candidates = await fetchPlacesWeighted(region, tags, { perType: 8, withHours: true, withPrice: true });
      addLog(`已檢索 ${candidates.length} 個備選地點`);
      addLog("計算最佳路徑與交通時間...");
      
      const tripCtx = { region, tags, days, timeRange: { start: '09:00', end: '21:00' }, lunchWindow: ['12:00', '14:00'], dinnerWindow: ['18:00', '20:00'], modes: ['walk', 'transit', 'drive'], budgetCap: null, constraints: { must: [], avoid: [], openHoursRespect: true } };
      let result = await planItinerary({ tripCtx, candidates });
      
      addLog("行程建構完成！");
      if (result?.plans?.length) { setPlans(result.plans); setPlanIndex(0); }
      else { const fallbackDaily = fallbackArrange(candidates, days); setPlans([{ dailyPlans: fallbackDaily }]); setPlanIndex(0); }

    } catch (e) {
      if (logTimer) clearInterval(logTimer);
      console.error("Critical Error:", e);
      addLog("錯誤: 系統發生例外狀況");
      Alert.alert("排程錯誤", "系統發生錯誤，請稍後再試");
    } finally {
      if (!triggerByRefresh) setLoading(false);
      if (triggerByRefresh) setRefreshing(false);
    }
  }, [region, tags, days, groupName]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        setLogLines(["> 正在同步雲端資料..."]); 
        const savedDoc = await getAdoptedByGroup(groupId);
        if (isMounted && savedDoc && savedDoc.plan) {
          setPlans([savedDoc.plan]);
          setPlanIndex(0);
          setLoading(false);
          return;
        }
      } catch (err) { console.warn("讀取失敗:", err); }
      if (isMounted) {
        buildItinerary(false);
      }
    };
    init();
    return () => { isMounted = false; };
  }, [groupId, buildItinerary]);

  const onRefresh = () => { setRefreshing(true); buildItinerary(true); };

  const showCustomAlert = (title, message) => {
    setAlertConfig({ visible: true, title, message });
  };

  const closeCustomAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  const rebuildDay = async (dayIndex) => {
    setLoading(true);
    setLogLines([]); 
    addLog(`正在重新構思第 ${dayIndex + 1} 天行程...`);
    
    try {
      const userStyle = tags.length > 0 ? tags.join('、') : '熱門觀光';
      const currentDayPlan = plans[planIndex]?.dailyPlans[dayIndex];
      const manualItems = currentDayPlan ? currentDayPlan.places.filter(p => p.isManual === true) : [];

      let logIdx = 0;
      const timer = setInterval(() => {
         if (logIdx < AI_THINKING_LOGS.length) addLog(AI_THINKING_LOGS[logIdx++]);
      }, 600);

      const newAiResult = await generateItineraryWithAI(region, days, userStyle + " (請提供不同的行程)");
      clearInterval(timer);
      
      if (newAiResult && newAiResult.length > dayIndex) {
        addLog("AI 回傳成功，正在整合手動保留項目...");
        const newDayData = newAiResult[dayIndex];
        let newPlacesFormatted = newDayData.places.map((p, idx) => ({
          id: `ai-new-${dayIndex}-${Date.now()}-${idx}`,
          name: p.name,
          address: p.reason,
          rating: null,
          types: [p.type],
          __start: p.time ? p.time.split('-')[0].trim() : '09:00',
          __end: p.time ? p.time.split('-')[1].trim() : '10:00',
          stayMinutes: 60,
          selected: true,
          isManual: false,
        }));

        const mergedPlaces = [...newPlacesFormatted, ...manualItems];
        const sortedResolvedPlaces = await smartReschedule(mergedPlaces);

        setPlans((prev) => {
          const next = [...prev];
          const curPlan = { ...next[planIndex] };
          const daily = [...curPlan.dailyPlans];
          daily[dayIndex] = { day: dayIndex + 1, places: sortedResolvedPlaces, legs: [] };
          curPlan.dailyPlans = daily;
          next[planIndex] = curPlan;
          return next;
        });
        
        let msg = `第 ${dayIndex + 1} 天已重新規劃！`;
        if (manualItems.length > 0) msg += `\n(已自動保留 ${manualItems.length} 個手動行程)`;
        
        showCustomAlert('已更新', msg);

      } else { throw new Error("AI 生成失敗"); }
    } catch (err) { Alert.alert('錯誤', '重建失敗：' + err.message); } finally { setLoading(false); }
  };

  const onSave = async () => {
    if (!plans.length) return;
    try {
      // 🔥 3. 關鍵修改：Payload 加入 owner 欄位
      const payload = { 
          groupId, 
          groupName, 
          region, 
          days, 
          tags, 
          adoptedIndex: planIndex, 
          plan: plans[planIndex], 
          createdAt: new Date(),
          owner: userId // 👈 這樣 ProfileScreen 才能透過 owner == userId 找到這筆行程
      };

      await saveItinerary(groupId, payload);
      
      showCustomAlert('已儲存', '你的行程已儲存到雲端！');
    } catch (e) { console.error(e); Alert.alert('儲存失敗', '請稍後再試'); }
  };

  const hasPlans = plans.length > 0 && currentDailyPlans.length > 0;
  const planChips = ['方案 A', '方案 B', '方案 C'];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        
        {/* 頂部導航欄 */}
        <View style={styles.navHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.navBackBtn}>
            <Ionicons name="arrow-back" size={24} color="#0b1d3d" />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>行程規劃</Text>
          <View style={{ width: 40 }} /> 
        </View>

        <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 120 }} 
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            <View style={styles.headerInfo}>
              <Text style={[styles.h2, { color: t.colors.text }]}>{groupName}</Text>
              <Text style={{ color: t.colors.muted, marginTop: 4 }}>
                {region}・{days} 日・{tags.join(' / ')}
              </Text>
            </View>

            {plans.length > 1 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, paddingHorizontal: 16 }}>
                {plans.map((_, i) => (
                  <Chip key={i} label={planChips[i] ?? `方案 ${i + 1}`} active={planIndex === i} onPress={() => setPlanIndex(i)} />
                ))}
              </View>
            )}

            {!hasPlans ? (
              <Card style={{ marginHorizontal: 16 }}>
                <Text style={{ color: t.colors.muted }}>尚未產生任何行程，請下拉重新整理。</Text>
              </Card>
            ) : (
              currentDailyPlans.map((d, dayIndex) => (
                <View key={d.day} style={styles.dayContainer}>
                  
                  <View style={styles.dayHeaderRow}>
                    <View style={styles.dayBadge}>
                      <Text style={styles.dayBadgeText}>Day {d.day}</Text>
                    </View>
                    <View style={{flexDirection: 'row', gap: 8}}>
                        <TouchableOpacity 
                          onPress={() => handleOptimize(dayIndex)} 
                          style={[styles.refreshButton, {backgroundColor: '#e0f2fe', borderRadius: 6, paddingHorizontal: 10}]}
                        >
                          <Text style={[styles.refreshButtonText, {color: '#0284c7'}]}>✨ 智慧排序</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => rebuildDay(d.day - 1)} style={styles.refreshButton}>
                          <Text style={styles.refreshButtonText}>↻ 重新生成</Text>
                        </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.dayContent}>
                    {d.places.map((p, placeIndex) => (
                      <Swipeable
                        key={`${p.id || p.name}-${placeIndex}`}
                        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, dayIndex, placeIndex)}
                      >
                        <TouchableOpacity 
                          activeOpacity={0.9}
                          onPress={() => openMap(p.name)} 
                        >
                          <View style={[
                              styles.itemRow, 
                              { backgroundColor: 'white' },
                              p.isManual && { backgroundColor: '#fffbe6' }, 
                              placeIndex === d.places.length - 1 && { borderBottomWidth: 0 } 
                            ]}>
                            
                            <View style={styles.timeCol}>
                              <Text style={styles.startTimeText} numberOfLines={1} adjustsFontSizeToFit>{p.__start}</Text>
                              <Text style={styles.endTimeText} numberOfLines={1} adjustsFontSizeToFit>{p.__end}</Text>
                            </View>

                            <View style={styles.cardContent}>
                              <View style={styles.titleRow}>
                                <Text style={styles.poiName} numberOfLines={1}>
                                  {p.name ?? '未命名地點'} {p.isManual && ''}
                                </Text>
                                {!p.isManual && p.types && p.types[0] && (
                                  <View style={styles.tagBadge}>
                                    <Text style={styles.tagText}>{formatTag(p.types[0])}</Text>
                                  </View>
                                )}
                              </View>

                              {p.warning && (
                                  <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 2}}>
                                      <Text style={{color: '#ef4444', fontSize: 12, fontWeight: '700'}}>
                                          {p.warning}
                                      </Text>
                                  </View>
                              )}

                              {!!p.address && (
                                <Text style={styles.descText} numberOfLines={2}>
                                  {p.address.replace(/^📍\s*/, '')}
                                </Text>
                              )}
                              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                                <Text style={styles.metaText}>
                                  預計停留 {p.stayMinutes ?? 60} 分鐘
                                </Text>
                                <Text style={[styles.metaText, {marginLeft: 8, color: '#4f46e5', fontSize: 11, fontWeight: '600'}]}>
                                  導航
                                </Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      </Swipeable>
                    ))}
                  </View>

                  <TouchableOpacity style={styles.addButton} onPress={() => openAddModal(dayIndex)}>
                    <Text style={styles.addButtonText}>+ 新增行程</Text>
                  </TouchableOpacity>

                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.bottomBarContainer}>
            <TouchableOpacity 
              style={[styles.bottomBtn, styles.saveBtn]} 
              onPress={onSave}
            >
              <Text style={styles.saveBtnText}>儲存行程</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>新增第 {targetDayIndex + 1} 天行程</Text>
              
              <Text style={styles.label}>地點名稱 (輸入以搜尋)</Text>
              <View style={{ zIndex: 10 }}> 
                <TextInput 
                  style={styles.input} 
                  placeholder="例如：101、士林夜市..." 
                  value={newItem.name}
                  onChangeText={handleNameChange}
                />
                
                {showSuggestions && suggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    <FlatList
                      data={suggestions}
                      keyExtractor={(item) => item.id}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={styles.suggestionItem} 
                          onPress={() => handleSelectPlace(item)}
                        >
                          <Text style={styles.suggestionText}>{item.name}</Text>
                          <Text style={styles.suggestionSubText} numberOfLines={1}>{item.address}</Text>
                        </TouchableOpacity>
                      )}
                      style={{ maxHeight: 150 }}
                    />
                  </View>
                )}
              </View>

              <View style={{flexDirection: 'row', gap: 10, zIndex: 1}}>
                <View style={{flex: 1}}>
                  <Text style={styles.label}>開始時間</Text>
                  <TextInput 
                    style={styles.input} 
                    value={newItem.timeStart}
                    keyboardType="number-pad" 
                    placeholder="10:00"
                    maxLength={5} 
                    onChangeText={(t) => handleTimeChange(t, 'timeStart')}
                  />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.label}>結束時間</Text>
                  <TextInput 
                    style={styles.input} 
                    value={newItem.timeEnd}
                    keyboardType="number-pad"
                    placeholder="11:00"
                    maxLength={5}
                    onChangeText={(t) => handleTimeChange(t, 'timeEnd')}
                  />
                </View>
              </View>

              <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20, zIndex: 1}}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalBtn, {backgroundColor: '#eee'}]}>
                  <Text style={{color: '#333'}}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddItem} style={[styles.modalBtn, {backgroundColor: '#0b1d3d'}]}>
                  <Text style={{color: '#fff'}}>加入</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Alert */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={alertConfig.visible}
          onRequestClose={closeCustomAlert}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>{alertConfig.title}</Text>
              <Text style={styles.alertMessage}>{alertConfig.message}</Text>
              <TouchableOpacity 
                style={[styles.modalBtn, {backgroundColor: '#0b1d3d', marginTop: 20, width: '100%', alignItems: 'center'}]}
                onPress={closeCustomAlert}
              >
                <Text style={{color: '#fff', fontWeight: '700'}}>確定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 🔥 全域 Loading */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <View style={styles.loadingHeader}>
                <Ionicons name="hardware-chip" size={24} color="#0b1d3d" />
                <Text style={styles.loadingTitle}>AI 智能規劃中</Text>
              </View>
              <View style={styles.divider} />
              <ActivityIndicator size="large" color="#0b1d3d" style={{ marginVertical: 20 }} />
              <View style={styles.terminalBox}>
                <ScrollView 
                  ref={scrollViewRef}
                  onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                  showsVerticalScrollIndicator={false}
                >
                  {logLines.map((line, index) => (
                    <Text key={index} style={styles.terminalText}>
                      {line}
                    </Text>
                  ))}
                  <Text style={styles.terminalText}>
                    <Text style={styles.blinkingCursor}>_</Text>
                  </Text>
                </ScrollView>
              </View>
            </View>
          </View>
        )}

        {/* 局部 Loading */}
        {addingItem && (
          <View style={styles.absoluteLoading}>
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{color: '#fff', marginTop: 12, fontWeight: 'bold', fontSize: 18}}>正在計算最佳路線...</Text>
            </View>
          </View>
        )}

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function fallbackArrange(all, days = 1) { return []; } 

const styles = StyleSheet.create({
  navHeader: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  navBackBtn: { padding: 8 },
  navTitle: { fontSize: 18, fontWeight: '800', color: '#0b1d3d' },

  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  },
  loadingCard: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: "#0b1d3d", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  loadingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  loadingTitle: {
    fontSize: 18, fontWeight: '800', color: '#0b1d3d', letterSpacing: 1,
  },
  divider: {
    width: '100%', height: 1, backgroundColor: '#f0f0f0', marginBottom: 10,
  },
  terminalBox: {
    width: '100%',
    backgroundColor: '#f1f5f9', 
    borderRadius: 12,
    padding: 16,
    borderWidth: 1, borderColor: '#e2e8f0',
    height: 180, 
  },
  terminalText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', 
    fontWeight: '600',
  },
  blinkingCursor: {
    color: '#0b1d3d', fontWeight: '900',
  },

  alertContent: {
    width: '80%', backgroundColor: '#fff', padding: 24, borderRadius: 16, alignItems: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  alertTitle: { fontSize: 20, fontWeight: '800', color: '#0b1d3d', marginBottom: 12 },
  alertMessage: { fontSize: 16, color: '#4b5563', textAlign: 'center', lineHeight: 24 },

  absoluteLoading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
  },
  loadingBox: {
    backgroundColor: 'rgba(0,0,0,0.8)', padding: 30, borderRadius: 16, alignItems: 'center'
  },

  headerInfo: { padding: 16, paddingBottom: 8, backgroundColor: '#fff' },
  h2: { fontSize: 24, fontWeight: '800', color: '#0b1d3d' }, 
  
  dayContainer: { marginBottom: 16, marginHorizontal: 16 },
  dayHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, backgroundColor: 'transparent',
  },
  dayBadge: {
    backgroundColor: '#0b1d3d', paddingVertical: 6, paddingHorizontal: 16, borderTopLeftRadius: 10, borderTopRightRadius: 10,
  },
  dayBadgeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  refreshButton: { paddingVertical: 6, paddingHorizontal: 8 },
  refreshButtonText: { color: '#5b6b87', fontSize: 13, fontWeight: '600' },

  dayContent: {
    backgroundColor: '#fff', borderRadius: 12, borderTopLeftRadius: 0, paddingVertical: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, overflow: 'hidden',
  },

  itemRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  timeCol: { width: 64, paddingRight: 8, alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 0 },
  startTimeText: { color: '#0b1d3d', fontSize: 14, fontWeight: '800', marginBottom: 2 },
  endTimeText: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },

  cardContent: { flex: 1, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' },
  poiName: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginRight: 8 },
  tagBadge: { backgroundColor: '#fff7ed', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#fed7aa' },
  tagText: { fontSize: 10, color: '#f97316', fontWeight: '700' },
  descText: { fontSize: 13, color: '#4b5563', marginBottom: 6, lineHeight: 18 },
  metaText: { fontSize: 11, color: '#9ca3af' },

  deleteButtonContainer: { backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', width: 80, height: '100%' },
  deleteButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  addButton: {
    backgroundColor: '#fff', padding: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed'
  },
  addButtonText: { color: '#5b6b87', fontSize: 14, fontWeight: '600' },

  bottomBarContainer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 0 : 16, 
  },
  bottomBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { backgroundColor: '#0b1d3d', width: '100%' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { width: '85%', backgroundColor: '#fff', padding: 20, borderRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center', color: '#0b1d3d' },
  label: { fontSize: 13, color: '#666', marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16, backgroundColor: '#f9fafb' },
  modalBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  
  suggestionsBox: {
    position: 'absolute', top: 75, left: 0, right: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, zIndex: 999, elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
  },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  suggestionText: { fontSize: 14, color: '#333', fontWeight: '500' },
  suggestionSubText: { fontSize: 12, color: '#999', marginTop: 2 },
});