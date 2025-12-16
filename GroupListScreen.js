// screens/GroupListScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { db } from '../firebase';
// 🔥 修改 1：引入 query 和 where
import { collection, onSnapshot, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';

// 引入你的共用元件
import CustomAlert from '../components/ui/CustomAlert';
import LoadingOverlay from '../components/ui/LoadingOverlay';

// 🎨 只用在左側標籤的色票
const TICKET_COLORS = [
  '#0ea5e9', // 藍
  '#10b981', // 綠
  '#f59e0b', // 黃
  '#8b5cf6', // 紫
  '#f43f5e', // 紅
  '#6366f1', // 深紫
];

export default function GroupListScreen() {
  const navigation = useNavigation();

  // Data
  const [me, setMe] = useState(null);
  const [groups, setGroups] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Alert Config
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', onConfirm: null });

  useEffect(() => { 
    AsyncStorage.getItem('username').then((u) => setMe(u || 'guest')); 
  }, []);

  // 🔥 修改 2：加上篩選條件，只監聽「我是成員」的群組
  useEffect(() => {
    if (!me) return; // 等到抓到使用者 ID 才開始監聽

    // 建立查詢：只抓取 members 陣列包含 me 的文件
    const q = query(collection(db, 'groups'), where('members', 'array-contains', me));

    const unsub = onSnapshot(q, (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      
      // 排序邏輯 (新 -> 舊)
      const toTs = (g) => {
        const ts = g?.createdAt;
        if (ts?.toMillis) return ts.toMillis();
        if (ts instanceof Date) return ts.getTime();
        const p = Date.parse(ts);
        return Number.isFinite(p) ? p : 0;
      };
      rows.sort((a, b) => toTs(b) - toTs(a));
      setGroups(rows);
    });
    return () => unsub();
  }, [me]); // 🔥 這裡加入 [me] 作為依賴，當 me 改變時重新執行

  const showAlert = (title, message, onConfirm = null) => {
    setAlertConfig({ 
      visible: true, 
      title, 
      message, 
      onConfirm: onConfirm || (() => setAlertConfig(prev => ({ ...prev, visible: false }))) 
    });
  };

  const copyGroupId = async (gid) => {
    try { 
      await Clipboard.setStringAsync(gid); 
      setCopiedId(gid); 
      setTimeout(() => setCopiedId(null), 1500); 
    } catch (e) { 
      console.error(e); 
    }
  };

  // 整合組員邏輯：刪除群組時，同時刪除手動行程
  const handleDeleteGroup = (g) => {
    showAlert('刪除群組', `確定要刪除「${g.name || '未命名'}」嗎？`, async () => {
        setAlertConfig(prev => ({ ...prev, visible: false })); 
        setLoading(true);
        try { 
          // 1. 刪除群組文件
          await deleteDoc(doc(db, 'groups', g.id)); 
          
          // 2. 如果有手動行程，一併刪除 (組員的功能)
          if (g.manualPlanId) {
            await deleteDoc(doc(db, 'manualPlans', g.manualPlanId)); 
          }
        } catch (e) { 
          console.error(e); 
          setTimeout(() => showAlert('刪除失敗', '請稍後再試'), 500); 
        } finally { 
          setLoading(false); 
        }
    });
  };

  // 整合組員邏輯：開啟手動行程 (若無 ID 則自動建立)
  const handleOpenManual = async (g) => {
    try {
      const ref = doc(db, 'groups', g.id); 
      let planId = g.manualPlanId;
      
      // 如果還沒有 manualPlanId，幫他生成一個並存回去
      if (!planId) { 
        planId = `manual-${Math.random().toString(36).slice(2, 8)}`; 
        await updateDoc(ref, { manualPlanId: planId }); 
      }
      
      navigation.navigate('ManualPlan', { 
        planId, 
        groupId: g.id, 
        groupName: g.name || '未命名群組' 
      });
    } catch (e) { 
      console.error(e); 
      showAlert('錯誤', '無法開啟手動行程'); 
    }
  };

  const renderGroupCard = (g, index) => {
    const gid = g.groupId || g.id;
    const isCopied = copiedId === gid;
    const accentColor = TICKET_COLORS[index % TICKET_COLORS.length];

    return (
      <View key={g.id} style={styles.ticketContainer}>
        
        {/* 左側色條 */}
        <View style={[styles.colorStrip, { backgroundColor: accentColor }]} />

        {/* 缺口 */}
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={[styles.notch, styles.notchRight]} />

        {/* 內容區塊 */}
        <View style={styles.cardContent}>
            
            {/* 上半部 */}
            <View style={styles.ticketTopSection}>
                <View style={styles.headerRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.ticketTitle} numberOfLines={1}>{g.name || '未命名行程'}</Text>
                        <View style={styles.tagRow}>
                            <Ionicons name="pricetag" size={12} color="#94a3b8" />
                            <Text style={styles.ticketTags} numberOfLines={1}>
                                {Array.isArray(g.tags) && g.tags.length > 0 ? g.tags.join(', ') : 'PASSENGER'}
                            </Text>
                        </View>
                    </View>
                    
                    {/* Icons */}
                    <View style={styles.iconRow}>
                        <TouchableOpacity style={styles.iconBtnGhost} onPress={() => navigation.navigate('GroupMembers', { groupId: g.id, groupName: g.name })}>
                            <Ionicons name="people-outline" size={18} color="#64748b" />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.iconBtnGhost, {backgroundColor: '#fff1f2'}]} onPress={() => handleDeleteGroup(g)}>
                            <Ionicons name="trash-outline" size={18} color="#f43f5e" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Info Row */}
                <View style={styles.mainInfoRow}>
                    <View style={styles.destBox}>
                        <Text style={styles.label}>DESTINATION</Text>
                        <View style={{flexDirection:'row', alignItems:'center', gap: 6}}>
                            <MaterialCommunityIcons name="airplane-landing" size={22} color="#0b1d3d" />
                            <Text style={styles.destValue}>{g.region || '未定地區'}</Text>
                        </View>
                    </View>

                    <View style={styles.metaBox}>
                        <View style={styles.metaItem}>
                            <Text style={styles.label}>DURATION</Text>
                            <Text style={styles.metaValue}>{g.days || 1} DAYS</Text>
                        </View>
                        <TouchableOpacity style={styles.metaItem} onPress={() => copyGroupId(gid)} activeOpacity={0.6}>
                            <Text style={styles.label}>ID {isCopied && '✓'}</Text>
                            <Text style={[styles.idValue, isCopied && {color: '#10b981'}]}>
                                {gid.length > 8 ? gid.slice(0,8)+'..' : gid}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* 虛線 */}
            <View style={styles.tearLineContainer}>
                <View style={styles.tearLineDashed} />
            </View>

            {/* 下半部：按鈕區 */}
            <View style={styles.ticketBottomSection}>
                <View style={styles.footerActions}>
                    <TouchableOpacity 
                        style={[styles.ticketBtn, styles.btnManual]}
                        onPress={() => handleOpenManual(g)}
                    >
                        <Ionicons name="create-outline" size={16} color="#64748b" />
                        <Text style={styles.btnTextManual}>手動</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.ticketBtn, styles.btnBoarding]}
                        onPress={() => navigation.navigate('Itinerary', {
                            groupId: g.id, groupName: g.name, days: Number(g.days || 2), region: g.region, tags: g.tags,
                        })}
                    >
                        <Text style={styles.btnTextBoarding}>進入行程</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
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
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0b1d3d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>我的旅程</Text>
         {/* 保持標題置中 */}
         <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="ticket-confirmation-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>世界這麼大，這裡卻這麼空？</Text>
          </View>
        ) : (
          groups.map((g, index) => renderGroupCard(g, index))
        )}
      </ScrollView>

      <LoadingOverlay visible={loading} message="處理中..." />
      <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} onConfirm={alertConfig.onConfirm} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Page
  headerContainer: {
    paddingTop: 10, paddingBottom: 15, paddingHorizontal: 20, backgroundColor: '#f1f5f9',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b', letterSpacing: 0.5 },
  backBtn: { padding: 4 },
  
  scrollContent: { padding: 20, paddingBottom: 100 },
  
  // Empty State
  emptyContainer: { alignItems: 'center', marginTop: 120 },
  emptyText: { color: '#94a3b8', fontSize: 18, marginTop: 16, fontWeight: '600' },

  // Ticket Card
  ticketContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: "#64748b", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
    flexDirection: 'row',
  },

  colorStrip: {
    width: 6,
    height: '100%',
  },

  cardContent: {
    flex: 1,
    backgroundColor: '#fff',
  },

  notch: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#f1f5f9',
    bottom: 58, 
    zIndex: 10,
  },
  notchLeft: { left: -10 }, 
  notchRight: { right: -12 },

  // Top Section
  ticketTopSection: {
    padding: 16, paddingBottom: 20, backgroundColor: '#fff',
  },
  headerRow: { 
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: 16 
  },
  ticketTitle: { fontSize: 20, fontWeight: '900', color: '#0b1d3d', marginBottom: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ticketTags: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' },
  
  iconRow: { flexDirection: 'row', gap: 8 },
  iconBtnGhost: { padding: 6, backgroundColor: '#f8fafc', borderRadius: 8 },

  // Main Info
  mainInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  
  destBox: { flex: 1 },
  label: { fontSize: 10, color: '#94a3b8', fontWeight: '700', marginBottom: 2, letterSpacing: 0.5 },
  destValue: { fontSize: 22, color: '#0f172a', fontWeight: '800' },
  
  metaBox: { flexDirection: 'row', gap: 16 },
  metaItem: { alignItems: 'flex-end' },
  metaValue: { fontSize: 15, color: '#334155', fontWeight: '700' },
  idValue: { fontSize: 14, color: '#334155', fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // Tear Line
  tearLineContainer: { height: 1, overflow: 'hidden', backgroundColor: '#fff', position: 'relative', zIndex: 5 },
  tearLineDashed: {
    height: 2, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', marginTop: -1,
    marginHorizontal: 12 
  },

  // Bottom Section
  ticketBottomSection: {
    padding: 12, backgroundColor: '#f8fafc',
  },
  footerActions: { flexDirection: 'row', gap: 10 },
  ticketBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10, gap: 6,
  },
  btnManual: { backgroundColor: '#e2e8f0' },
  btnTextManual: { color: '#64748b', fontWeight: '700', fontSize: 13 },
  
  btnBoarding: { backgroundColor: '#0b1d3d' }, 
  btnTextBoarding: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});