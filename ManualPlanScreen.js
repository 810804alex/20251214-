// screens/ManualPlanScreen.js
import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  Alert, 
  ScrollView, 
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
  Modal,
  FlatList,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { useRoute, useNavigation } from '@react-navigation/native'; 
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons'; 

// 引入手勢套件
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

import { useTheme } from '../theme';
import LoadingOverlay from '../components/ui/LoadingOverlay';

// 🔥 1. 定義 API Key 與搜尋函式
const GOOGLE_API_KEY = 'AIzaSyCH_XC3ju87XIlYjfcZd6B8BXr-7wQcYmo'; // 請確認 API Key 是否有效

async function fetchPredictions(text) {
  if (!text || text.length < 1) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_API_KEY}&language=zh-TW&components=country:tw`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK') {
      return data.predictions;
    }
    return [];
  } catch (e) {
    console.error("Search Error:", e);
    return [];
  }
}

export default function ManualPlanScreen() {
  const t = useTheme();
  const navigation = useNavigation();
  const route = useRoute();

  // Params
  const incomingId = route.params?.planId;
  const groupId = route.params?.groupId;
  const groupName = route.params?.groupName;

  // State
  const [planId] = useState(() => incomingId || `manual-${Math.random().toString(36).slice(2, 8)}`);
  const [userName, setUserName] = useState('guest');
  const [days, setDays] = useState(1);
  const [plans, setPlans] = useState([{ day: 1, places: [{ name: '', time: '' }] }]);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // 🔍 搜尋 Modal 狀態
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [editingPath, setEditingPath] = useState(null); // { dayIdx, placeIdx }
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);

  // 初始化
  useEffect(() => {
    AsyncStorage.getItem('username').then((u) => {
      if (u) setUserName(u);
    });
  }, []);

  // 監聽 Firestore 資料
  useEffect(() => {
    if (!incomingId) return;
    const ref = doc(db, 'manualPlans', incomingId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.plans) {
          setDays(data.days || 1);
          setPlans(data.plans);
        }
      }
    });
    return () => unsub();
  }, [incomingId]);

  // 🔹 功能邏輯
  const addDay = () => {
    if (days >= 10) {
      Alert.alert('提醒', '最多只能建立 10 天行程');
      return;
    }
    const newDay = days + 1;
    setDays(newDay);
    setPlans([...plans, { day: newDay, places: [{ name: '', time: '' }] }]);
  };

  const addPlace = (dayIdx) => {
    const next = [...plans];
    next[dayIdx].places.push({ name: '', time: '' });
    setPlans(next);
  };

  const updatePlace = (dayIdx, placeIdx, key, value) => {
    const next = [...plans];
    next[dayIdx].places[placeIdx][key] = value;
    setPlans(next);
  };

  const deletePlace = (dayIdx, placeIdx) => {
    const next = [...plans];
    next[dayIdx].places.splice(placeIdx, 1);
    if (next[dayIdx].places.length === 0) {
      next[dayIdx].places.push({ name: '', time: '' });
    }
    setPlans(next);
  };

  // 🔥 開啟搜尋視窗
  const openSearch = (dayIdx, placeIdx, currentName) => {
    setEditingPath({ dayIdx, placeIdx });
    setSearchText(currentName);
    setSuggestions([]);
    setSearchModalVisible(true);
  };

  // 🔥 處理搜尋文字變更
  const handleSearchChange = async (text) => {
    setSearchText(text);
    if (text.length > 1) {
      setSearching(true);
      const preds = await fetchPredictions(text);
      setSuggestions(preds);
      setSearching(false);
    } else {
      setSuggestions([]);
    }
  };

  // 🔥 選擇地點建議
  const handleSelectSuggestion = (item) => {
    if (editingPath) {
      const { dayIdx, placeIdx } = editingPath;
      const placeName = item.structured_formatting.main_text;
      const placeAddress = item.structured_formatting.secondary_text; // 如果你想存地址也可以
      
      const next = [...plans];
      next[dayIdx].places[placeIdx].name = placeName;
      // 這裡也可以把 next[dayIdx].places[placeIdx].address = placeAddress 存起來
      setPlans(next);
    }
    setSearchModalVisible(false);
  };

  // 🔥 直接使用輸入的文字（不選建議）
  const handleUseCurrentText = () => {
    if (editingPath) {
      const { dayIdx, placeIdx } = editingPath;
      updatePlace(dayIdx, placeIdx, 'name', searchText);
    }
    setSearchModalVisible(false);
  };

  const renderRightActions = (progress, dragX, dayIdx, placeIdx) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        onPress={() => {
          Alert.alert("刪除", "確定要移除這個景點嗎？", [
            { text: "取消", style: "cancel" },
            { text: "刪除", style: "destructive", onPress: () => deletePlace(dayIdx, placeIdx) }
          ]);
        }}
        style={styles.deleteAction}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
          <Text style={styles.deleteActionText}>刪除</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const copyPlanId = async () => {
    try {
      await Clipboard.setStringAsync(planId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
      Alert.alert('複製失敗', '請稍後再試。');
    }
  };

  const savePlan = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'manualPlans', planId),
        {
          planId,
          owner: userName || 'guest',
          days,
          plans,
          groupName: groupName || null,
          groupId: groupId || null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert(
        '✅ 已儲存',
        `你的自訂行程已儲存到雲端。\n行程 ID：${planId}`,
        [{ text: '好', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      console.error(e);
      Alert.alert('儲存失敗', '請稍後再試。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#0b1d3d" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>編輯行程</Text>
          </View>
        </View>

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            
            {/* 1. 資訊卡片 */}
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>行程 ID</Text>
                  <Text style={styles.infoValue}>{planId}</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.copyBtn, copied && { backgroundColor: '#16a34a', borderColor: '#16a34a' }]} 
                  onPress={copyPlanId}
                >
                  <Text style={[styles.copyBtnText, copied && { color: '#fff' }]}>
                    {copied ? '已複製' : '複製'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.infoRow}>
                <View>
                  <Text style={styles.infoLabel}>建立者</Text>
                  <Text style={styles.infoValue}>{userName}</Text>
                </View>
                {groupName && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.infoLabel}>所屬群組</Text>
                    <Text style={styles.infoValue}>{groupName}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* 2. 每日行程編輯區 */}
            {plans.map((d, dayIdx) => (
              <View key={d.day} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayBadge}>
                    <Text style={styles.dayBadgeText}>Day {d.day}</Text>
                  </View>
                  <View style={styles.dayLine} />
                </View>

                {d.places.map((p, placeIdx) => (
                  <Swipeable
                    key={`${dayIdx}-${placeIdx}`}
                    renderRightActions={(progress, dragX) => 
                      renderRightActions(progress, dragX, dayIdx, placeIdx)
                    }
                  >
                    <View style={styles.placeRowContainer}>
                      <View style={styles.placeRow}>
                        {/* 時間輸入 */}
                        <View style={styles.timeInputWrap}>
                          <Ionicons name="time-outline" size={14} color="#6b7280" style={{ marginRight: 4 }} />
                          <TextInput
                            placeholder="09:00"
                            placeholderTextColor="#9ca3af"
                            style={styles.timeInput}
                            value={p.time}
                            onChangeText={(v) => updatePlace(dayIdx, placeIdx, 'time', v)}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                          />
                        </View>

                        {/* 🔥 修改：地點輸入改為可點擊的按鈕，觸發搜尋 Modal */}
                        <TouchableOpacity 
                          style={styles.nameInputBtn}
                          onPress={() => openSearch(dayIdx, placeIdx, p.name)}
                        >
                          {p.name ? (
                            <Text style={styles.nameInputText}>{p.name}</Text>
                          ) : (
                            <Text style={styles.nameInputPlaceholder}>搜尋景點...</Text>
                          )}
                          <Ionicons name="search" size={16} color="#9ca3af" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Swipeable>
                ))}

                {/* 新增景點按鈕 */}
                <TouchableOpacity 
                  style={styles.addPlaceBtn} 
                  onPress={() => addPlace(dayIdx)}
                >
                  <Ionicons name="add" size={16} color="#0b1d3d" />
                  <Text style={styles.addPlaceText}>新增景點</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* 3. 新增天數按鈕 */}
            <TouchableOpacity style={styles.addDayBtn} onPress={addDay}>
              <Text style={styles.addDayText}>+ 新增第 {days + 1} 天</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* 底部儲存按鈕 */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.saveBtn} onPress={savePlan}>
            <Text style={styles.saveBtnText}>儲存行程</Text>
          </TouchableOpacity>
        </View>

        {saving && <LoadingOverlay text="正在儲存行程..." />}

        {/* 🔥 4. 搜尋 Modal */}
        <Modal
          visible={searchModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSearchModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>搜尋地點</Text>
              <TouchableOpacity onPress={() => setSearchModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color="#666" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalInput}
                placeholder="輸入關鍵字 (例如：台北101)..."
                value={searchText}
                onChangeText={handleSearchChange}
                autoFocus
                clearButtonMode="while-editing"
              />
            </View>

            {searching && <ActivityIndicator style={{ marginTop: 20 }} />}

            <FlatList
              data={suggestions}
              keyExtractor={item => item.place_id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                !searching && searchText.length > 0 ? (
                  <TouchableOpacity style={styles.useCurrentBtn} onPress={handleUseCurrentText}>
                    <Text style={styles.useCurrentText}>使用「{searchText}」作為名稱</Text>
                    <Ionicons name="arrow-forward-circle" size={20} color="#0b1d3d" />
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.suggestionItem} 
                  onPress={() => handleSelectSuggestion(item)}
                >
                  <View style={styles.suggestionIcon}>
                    <Ionicons name="location-sharp" size={18} color="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionMain}>{item.structured_formatting.main_text}</Text>
                    <Text style={styles.suggestionSub}>{item.structured_formatting.secondary_text}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </Modal>

      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0b1d3d' },

  // Info Card
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#9ca3af', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#1f2937', fontWeight: '600', fontFamily: 'monospace' },
  
  copyBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20,
    borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff',
  },
  copyBtnText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },

  // Day Card
  dayCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  dayBadge: { backgroundColor: '#0b1d3d', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  dayBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  dayLine: { flex: 1, height: 1, backgroundColor: '#f3f4f6', marginLeft: 12 },

  // Place Row
  placeRowContainer: {
    backgroundColor: '#fff',
  },
  placeRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  
  timeInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f9fafb', borderRadius: 8,
    paddingHorizontal: 8, height: 44, marginRight: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
    width: 80,
  },
  timeInput: { flex: 1, fontSize: 14, color: '#1f2937', fontWeight: '600' },

  // 🔥 改為按鈕樣式的 Input
  nameInputBtn: {
    flex: 1, height: 44,
    backgroundColor: '#f9fafb', borderRadius: 8,
    paddingHorizontal: 12, 
    borderWidth: 1, borderColor: '#e5e7eb',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  nameInputText: { fontSize: 15, color: '#1f2937' },
  nameInputPlaceholder: { fontSize: 15, color: '#9ca3af' },

  // Delete Action
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    height: 44,
    borderRadius: 8,
    marginBottom: 10,
    marginLeft: 8,
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },

  // Buttons
  addPlaceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, marginTop: 4,
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, borderStyle: 'dashed',
  },
  addPlaceText: { color: '#0b1d3d', fontSize: 13, fontWeight: '600', marginLeft: 4 },

  addDayBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#e0f2fe',
    marginTop: 8, marginBottom: 20,
  },
  addDayText: { color: '#0284c7', fontSize: 15, fontWeight: '700' },

  // Bottom Bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', padding: 16,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  saveBtn: {
    backgroundColor: '#0b1d3d', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    shadowColor: "#0b1d3d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // 🔥 Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 20 : 0 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0b1d3d' },
  closeBtn: { padding: 4 },
  
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f4f6', margin: 16, paddingHorizontal: 12, borderRadius: 10, height: 44
  },
  modalInput: { flex: 1, fontSize: 16, color: '#333' },
  
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
  },
  suggestionIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', marginRight: 12
  },
  suggestionMain: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 2 },
  suggestionSub: { fontSize: 12, color: '#666' },

  useCurrentBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#f9fafb'
  },
  useCurrentText: { fontSize: 15, color: '#0b1d3d', fontWeight: '600' },
});