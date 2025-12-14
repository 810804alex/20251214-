// screens/HistoryScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Platform,
  SafeAreaView,
} from 'react-native';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; 

import { useTheme } from '../theme';
import Screen from '../components/ui/Screen';

// 🎨 定義風格顏色
const THEME_COLORS = {
  ai: {
    strip: '#8b5cf6', // 紫色
    icon: '#7c3aed',
    bg: '#f3e8ff',
  },
  manual: {
    strip: '#f59e0b', // 橘黃色
    icon: '#d97706',
    bg: '#fef3c7',
  }
};

export default function HistoryScreen({ navigation }) {
  // 狀態管理
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'manual'
  const [userName, setUserName] = useState(null);
  const [aiTrips, setAiTrips] = useState([]);
  const [manualTrips, setManualTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // 載入資料
  const loadData = async () => {
    try {
      const u = await AsyncStorage.getItem('username');
      const me = u || 'guest';
      setUserName(me);

      // 1. 讀取 AI 行程
      const itSnap = await getDocs(collection(db, 'itineraries'));
      const ai = [];
      itSnap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if (d.owner && d.owner !== me) return; 
        ai.push({ id: docSnap.id, ...d });
      });
      ai.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setAiTrips(ai);

      // 2. 讀取手動行程
      const mpSnap = await getDocs(collection(db, 'manualPlans'));
      const manual = [];
      mpSnap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if (d.owner && d.owner !== me) return;
        manual.push({ id: docSnap.id, ...d });
      });
      manual.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setManualTrips(manual);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return 'Unknown Date';
    const d = timestamp.toDate();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const copyId = async (id) => {
    try {
      await Clipboard.setStringAsync(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteTrip = (id, type, name) => {
    Alert.alert('刪除確認', `確定要刪除「${name || '未命名'}」嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          const col = type === 'ai' ? 'itineraries' : 'manualPlans';
          await deleteDoc(doc(db, col, id));
          if (type === 'ai') setAiTrips(prev => prev.filter(t => t.id !== id));
          else setManualTrips(prev => prev.filter(p => (p.planId || p.id) !== id));
        },
      },
    ]);
  };

  // 🎫 票券渲染元件
  const renderTicket = (item, type) => {
    const isAi = type === 'ai';
    const theme = isAi ? THEME_COLORS.ai : THEME_COLORS.manual;
    const id = isAi ? item.id : (item.planId || item.id);
    const title = isAi ? item.groupName : (item.title || item.name || '未命名行程');
    const region = isAi ? (item.region || '全域') : '自訂行程';
    const days = item.days || 1;
    const tags = isAi ? (item.tags || []) : ['手動排程'];
    const isCopied = copiedId === id;

    return (
      <View key={id} style={styles.ticketContainer}>
        {/* 左側色條 */}
        <View style={[styles.colorStrip, { backgroundColor: theme.strip }]} />

        {/* 缺口 */}
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={[styles.notch, styles.notchRight]} />

        <View style={styles.cardContent}>
          {/* 上半部：資訊 */}
          <View style={styles.ticketTopSection}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.ticketTitle} numberOfLines={1}>{title}</Text>
                <View style={styles.tagRow}>
                  <Ionicons name="pricetag" size={12} color="#94a3b8" />
                  <Text style={styles.ticketTags} numberOfLines={1}>
                    {tags.length > 0 ? tags.join(', ') : 'TRIP'}
                  </Text>
                </View>
              </View>
              {/* 類型標籤 */}
              <View style={[styles.typeBadge, { backgroundColor: theme.bg }]}>
                <Text style={[styles.typeText, { color: theme.icon }]}>{isAi ? 'AI GEN' : 'MANUAL'}</Text>
              </View>
            </View>

            <View style={styles.mainInfoRow}>
              <View style={styles.destBox}>
                <Text style={styles.label}>DESTINATION</Text>
                <View style={{flexDirection:'row', alignItems:'center', gap: 6}}>
                  <MaterialCommunityIcons name="map-marker-radius" size={20} color="#0b1d3d" />
                  <Text style={styles.destValue} numberOfLines={1}>{region}</Text>
                </View>
              </View>

              <View style={styles.metaBox}>
                <View style={styles.metaItem}>
                  <Text style={styles.label}>DATE</Text>
                  <Text style={styles.metaValue}>{formatDate(item.createdAt)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 虛線撕裂線 */}
          <View style={styles.tearLineContainer}>
            <View style={styles.tearLineDashed} />
          </View>

          {/* 下半部：操作 */}
          <View style={styles.ticketBottomSection}>
            <View style={styles.footerInfo}>
                <Text style={styles.label}>DURATION</Text>
                <Text style={styles.footerValue}>{days} DAYS</Text>
            </View>

            <View style={styles.footerActions}>
              {/* 複製 ID */}
              <TouchableOpacity style={styles.iconBtnGhost} onPress={() => copyId(id)}>
                 <Text style={[styles.idText, isCopied && {color: '#10b981'}]}>
                    {isCopied ? 'COPIED' : 'ID'}
                 </Text>
                 <Ionicons name={isCopied ? "checkmark" : "copy-outline"} size={16} color={isCopied ? "#10b981" : "#64748b"} />
              </TouchableOpacity>

              {/* 查看/編輯 */}
              <TouchableOpacity 
                style={[styles.actionBtn, { backgroundColor: theme.bg }]}
                onPress={() => {
                    if(isAi) {
                        navigation.navigate('Itinerary', {
                            groupId: item.groupId || item.id,
                            groupName: item.groupName,
                            days: Number(item.days),
                            region: item.region,
                            tags: item.tags || []
                        });
                    } else {
                        navigation.navigate('ManualPlan', { planId: id });
                    }
                }}
              >
                <Text style={[styles.actionBtnText, { color: theme.icon }]}>{isAi ? 'View' : 'Edit'}</Text>
                <Ionicons name="arrow-forward" size={16} color={theme.icon} />
              </TouchableOpacity>

              {/* 刪除 */}
              <TouchableOpacity style={[styles.iconBtnGhost, { backgroundColor: '#fff1f2' }]} onPress={() => deleteTrip(id, type, title)}>
                <Ionicons name="trash-outline" size={18} color="#f43f5e" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>歷史足跡</Text>
        <Text style={styles.headerSub}>共 {aiTrips.length + manualTrips.length} 趟旅程</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'ai' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('ai')}
        >
          <Text style={[styles.tabText, activeTab === 'ai' && styles.tabTextActive]}>
            🤖 AI 行程
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'manual' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('manual')}
        >
          <Text style={[styles.tabText, activeTab === 'manual' && styles.tabTextActive]}>
            📝 手動行程
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0b1d3d" />
          <Text style={styles.loadingText}>整理回憶中...</Text>
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {activeTab === 'ai' ? (
            aiTrips.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="robot-confused-outline" size={64} color="#cbd5e1" />
                <Text style={styles.emptyText}>沒有 AI 產生的歷史紀錄</Text>
              </View>
            ) : (
              aiTrips.map(item => renderTicket(item, 'ai'))
            )
          ) : (
            manualTrips.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="notebook-outline" size={64} color="#cbd5e1" />
                <Text style={styles.emptyText}>沒有手動建立的行程</Text>
              </View>
            ) : (
              manualTrips.map(item => renderTicket(item, 'manual'))
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#64748b', fontWeight: '600' },

  // Header
  headerContainer: {
    paddingTop: 10, paddingBottom: 10, paddingHorizontal: 20, backgroundColor: '#f1f5f9',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1e293b' },
  headerSub: { fontSize: 14, color: '#64748b', marginTop: 4, fontWeight: '500' },

  // Tabs
  tabContainer: {
    flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 10, backgroundColor: '#f1f5f9', gap: 12
  },
  tabBtn: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#e2e8f0',
  },
  tabBtnActive: { backgroundColor: '#0b1d3d' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  tabTextActive: { color: '#fff' },

  scrollContent: { padding: 20, paddingBottom: 100 },

  // Empty
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#94a3b8', fontSize: 16, marginTop: 16, fontWeight: '600' },

  // =========================
  // Ticket Style (Unified)
  // =========================
  ticketContainer: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 16,
    overflow: 'hidden', position: 'relative', flexDirection: 'row',
    shadowColor: "#64748b", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  colorStrip: { width: 6, height: '100%' },
  cardContent: { flex: 1, backgroundColor: '#fff' },

  notch: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#f1f5f9',
    bottom: 58, zIndex: 10,
  },
  notchLeft: { left: -10 }, 
  notchRight: { right: -12 },

  // Top Section
  ticketTopSection: { padding: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  ticketTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ticketTags: { fontSize: 11, fontWeight: '600', color: '#94a3b8', letterSpacing: 0.5 },
  
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  mainInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  destBox: { flex: 1 },
  label: { fontSize: 10, color: '#94a3b8', fontWeight: '700', marginBottom: 2, letterSpacing: 0.5 },
  destValue: { fontSize: 18, color: '#334155', fontWeight: '800' },
  metaBox: { alignItems: 'flex-end' },
  metaItem: { alignItems: 'flex-end' },
  metaValue: { fontSize: 14, color: '#334155', fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // Divider
  tearLineContainer: { height: 1, overflow: 'hidden', backgroundColor: '#fff', position: 'relative', zIndex: 5 },
  tearLineDashed: {
    height: 2, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', marginTop: -1, marginHorizontal: 12 
  },

  // Bottom Section
  ticketBottomSection: {
    padding: 12, paddingHorizontal: 16, backgroundColor: '#f8fafc',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 70 // 固定高度確保對齊
  },
  footerInfo: { justifyContent: 'center' },
  footerValue: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  footerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  
  iconBtnGhost: { padding: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', gap: 4 },
  idText: { fontSize: 10, fontWeight: '700', color: '#64748b' },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, gap: 4
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
});