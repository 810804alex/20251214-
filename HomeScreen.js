// screens/HomeScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  Platform,
  StatusBar,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// 子頁面 (保持不變)
import NotificationScreen from './NotificationScreen';
import ProfileScreen from './ProfileScreen';
import MapScreen from './MapScreen';

// Design System
import { useTheme } from '../theme';
import SectionHeader from '../components/ui/SectionHeader';
import Button from '../components/ui/Button'; // 保留引用
import Card from '../components/ui/Card';     // 保留引用

// 🔥 引入新做的共用元件
import CustomAlert from '../components/ui/CustomAlert';
import LoadingOverlay from '../components/ui/LoadingOverlay';

// Firestore
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';

// hook
import { useUnreadCount } from '../hooks/useUnreadCount';

const { width } = Dimensions.get('window');

function HomeMain() {
  const navigation = useNavigation();
  const t = useTheme();

  // 狀態
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', onConfirm: null });

  // Data
  const [me, setMe] = useState(null);
  const [allGroups, setAllGroups] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [manualCode, setManualCode] = useState(''); 

  // Banner
  const bannerData = [{ id: '1', color: '#FFD54F' }, { id: '2', color: '#4DB6AC' }, { id: '3', color: '#9575CD' }];
  const renderBanner = ({ item }) => (
    <View style={[styles.bannerCard, { backgroundColor: item.color }]}>
      <Text style={styles.bannerText}>✨ 熱門推薦行程 {item.id}</Text>
      <Text style={styles.bannerSubText}>點擊查看更多細節</Text>
    </View>
  );

  useEffect(() => {
    AsyncStorage.getItem('username').then((u) => setMe(u || 'guest'));
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'groups'), (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      setAllGroups(rows);
    });
    return () => unsub();
  }, []);

  const myGroups = useMemo(() => {
    if (!me) return [];
    const mine = allGroups.filter((g) => {
      const inMembers = Array.isArray(g.members) && g.members.includes(me);
      return inMembers || g.creator === me;
    });
    return mine.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);
  }, [allGroups, me]);

  // 工具：顯示彈窗
  const showAlert = (title, message, onConfirm = null) => {
    setAlertConfig({
      visible: true, title, message,
      onConfirm: onConfirm || (() => setAlertConfig(prev => ({ ...prev, visible: false })))
    });
  };

  // 加入群組邏輯
  const quickJoin = async () => {
    const code = joinCode.trim();
    if (!code) return showAlert('提醒', '請輸入群組 ID');
    if (!me) return showAlert('尚未登入', '請先登入再加入群組');

    setLoading(true);
    try {
      const ref = doc(db, 'groups', code);
      const snap = await getDoc(ref);
      
      if (!snap.exists()) {
        setLoading(false);
        showAlert('找不到群組', '請確認 ID 是否正確');
        return;
      }
      
      await updateDoc(ref, { members: arrayUnion(me) });
      setLoading(false);
      setJoinCode('');
      
      showAlert('加入成功', '你已加入此群組！', () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
        navigation.getParent()?.navigate('GroupMembers', {
          groupId: code,
          groupName: snap.data()?.name || '未命名群組',
        });
      });
    } catch (e) {
      console.error(e);
      setLoading(false);
      showAlert('加入失敗', '請稍後再試一次');
    }
  };

  // 加入手動行程邏輯
  const handleOpenManual = () => {
    const code = manualCode.trim();
    if (!code.startsWith('manual-')) {
      showAlert('格式錯誤', '行程 ID 應為 manual-xxxx');
      return;
    }
    navigation.getParent()?.navigate('ManualPlan', { planId: code });
    setManualCode('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      
      {/* 1. Header & Logo (無搜尋欄，Logo 放大置中) */}
      <View style={styles.headerContainer}>
        <Image source={require('../assets/zhuan-ti-logo.png')} style={styles.logo} />
      </View>

      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          
          {/* 2. 我的群組快覽 (最重要資訊放最上面) */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>我的旅程</Text>
              <TouchableOpacity onPress={() => navigation.getParent()?.navigate('GroupList')}>
                <Text style={styles.sectionLink}>查看全部 &gt;</Text>
              </TouchableOpacity>
            </View>

            {myGroups.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="map-outline" size={48} color="#cbd5e1" />
                <Text style={styles.emptyText}>還沒有旅程，趕快建立一個！</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={myGroups}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.groupCard}
                    activeOpacity={0.9}
                    onPress={() => navigation.getParent()?.navigate('Itinerary', {
                      groupId: item.id,
                      groupName: item.name,
                      days: Number(item.days || 1),
                      region: item.region || '北部',
                      tags: item.tags || []
                    })}
                  >
                    <View style={styles.groupCardHeader}>
                      <Text style={styles.groupCardRegion}>{item.region || '台灣'}</Text>
                      <Text style={styles.groupCardDays}>{item.days || 1} 天</Text>
                    </View>
                    <View style={styles.groupCardBody}>
                      <Text style={styles.groupCardTitle} numberOfLines={1}>{item.name || '未命名'}</Text>
                      <Text style={styles.groupCardTag} numberOfLines={1}>
                        🏷 {Array.isArray(item.tags) ? item.tags.join('、') : '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          {/* 3. 快捷功能區 (Grid 排列) */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 20, marginBottom: 12 }]}>快捷功能</Text>
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.getParent()?.navigate('GroupCreate')}>
                <View style={[styles.actionIcon, { backgroundColor: '#e0f2fe' }]}>
                  <Ionicons name="add-circle" size={28} color="#0284c7" />
                </View>
                <Text style={styles.actionText}>建立群組</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.getParent()?.navigate('GroupList')}>
                <View style={[styles.actionIcon, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="people" size={28} color="#16a34a" />
                </View>
                <Text style={styles.actionText}>群組清單</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('ManualPlan')}>
                <View style={[styles.actionIcon, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="create" size={28} color="#d97706" />
                </View>
                <Text style={styles.actionText}>手動排程</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.getParent()?.navigate('History')}>
                <View style={[styles.actionIcon, { backgroundColor: '#f3e8ff' }]}>
                  <Ionicons name="time" size={28} color="#9333ea" />
                </View>
                <Text style={styles.actionText}>歷史行程</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 4. 加入功能區 (卡片式) */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 20, marginBottom: 12 }]}>加入旅程</Text>
            
            {/* 加入群組卡片 */}
            <View style={styles.inputCard}>
              <View style={styles.inputHeader}>
                <Ionicons name="qr-code-outline" size={20} color="#0b1d3d" />
                <Text style={styles.inputTitle}>輸入群組代碼</Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  value={joinCode}
                  onChangeText={setJoinCode}
                  placeholder="例如：a1B2c3D4"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  style={styles.textInput}
                />
                <TouchableOpacity style={styles.joinBtn} onPress={quickJoin}>
                  <Text style={styles.joinBtnText}>加入</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 加入手動行程卡片 */}
            <View style={[styles.inputCard, { marginTop: 12 }]}>
              <View style={styles.inputHeader}>
                <Ionicons name="document-text-outline" size={20} color="#0b1d3d" />
                <Text style={styles.inputTitle}>輸入行程代碼 (Manual)</Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  value={manualCode}
                  onChangeText={setManualCode}
                  placeholder="例如：manual-123"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  style={styles.textInput}
                />
                <TouchableOpacity style={[styles.joinBtn, { backgroundColor: '#4b5563' }]} onPress={handleOpenManual}>
                  <Text style={styles.joinBtnText}>開啟</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* 5. Banner 輪播 */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 20, marginBottom: 12 }]}>探索靈感</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={bannerData}
              renderItem={renderBanner}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 20 }}
            />
          </View>

        </ScrollView>

        <LoadingOverlay visible={loading} message="處理中..." />
        <CustomAlert 
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          onConfirm={alertConfig.onConfirm}
        />
      </SafeAreaView>
    </View>
  );
}

// ------------------- Navigation 設定 -------------------
const Tab = createBottomTabNavigator();

export default function HomeScreen() {
  const unreadCount = useUnreadCount();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarLabel: () => null, // 隱藏文字，只留 icon 比較乾淨
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#f0f0f0',
          height: 60, // 稍微調矮一點
          paddingTop: 10,
        },
        tabBarActiveTintColor: '#0b1d3d',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarIcon: ({ color, focused }) => {
          let iconName;
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Explore') iconName = focused ? 'compass' : 'compass-outline';
          else if (route.name === 'Map') iconName = focused ? 'map' : 'map-outline';
          else if (route.name === 'Notifications') iconName = focused ? 'notifications' : 'notifications-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

          const size = 26;

          return (
            <View>
              <Ionicons name={iconName} size={size} color={color} />
              {route.name === 'Notifications' && unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeMain} />
      <Tab.Screen name="Explore" children={() => <View style={{flex:1, backgroundColor:'#fff'}}><Text>Explore</Text></View>} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Notifications" component={NotificationScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ------------------- Styles -------------------
// ------------------- Styles -------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  
  // ✅ Header 優化：變緊湊、去邊框
  headerContainer: {
    // 減少上方留白 (原本 +16/+60)
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 50,
    // 大幅減少下方留白 (原本 24)
    paddingBottom: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    // 移除原本的底部邊框，讓視覺更開闊
    // borderBottomWidth: 1, 
    // borderBottomColor: '#f3f4f6', 
    zIndex: 10,
    // (選項) 如果覺得太白，可以加一點點幾乎看不見的陰影來做層次
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  
  // ✅ Logo 優化：在緊湊空間內最大化
  logo: { 
    width: '70%', // 寬度佔螢幕 70%，確保夠寬
    height: 70,   // 高度設定為 70，在緊湊的 Header 裡看起來會很大
    resizeMode: 'contain' // 保持比例
  },

  // Sections
  sectionContainer: { marginTop: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0b1d3d' },
  sectionLink: { fontSize: 13, color: '#6b7280', fontWeight: '500' },

  // My Groups Card (Hero Style)
  groupCard: {
    width: width * 0.75,
    height: 140,
    backgroundColor: '#0b1d3d',
    borderRadius: 16,
    marginRight: 16,
    padding: 16,
    justifyContent: 'space-between',
    shadowColor: "#0b1d3d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  groupCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupCardRegion: { color: '#fff', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  groupCardDays: { color: '#fbbf24', fontSize: 14, fontWeight: '700' },
  groupCardBody: {},
  groupCardTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  groupCardTag: { fontSize: 12, color: '#cbd5e1' },

  emptyCard: { marginHorizontal: 20, padding: 24, backgroundColor: '#fff', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  emptyText: { marginTop: 8, color: '#94a3b8', fontSize: 14 },

  // Action Grid
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20 },
  actionBtn: { alignItems: 'center', width: '23%', marginBottom: 12 },
  actionIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionText: { fontSize: 12, color: '#333', fontWeight: '500' },

  // Input Cards (Join)
  inputCard: {
    backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  inputHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  inputTitle: { fontSize: 15, fontWeight: '700', color: '#0b1d3d', marginLeft: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  textInput: {
    flex: 1, backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, borderWidth: 1, borderColor: '#e5e7eb', marginRight: 10, color: '#333'
  },
  joinBtn: { backgroundColor: '#0b1d3d', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Banner
  bannerCard: { width: 280, height: 120, borderRadius: 16, marginRight: 16, padding: 16, justifyContent: 'center' },
  bannerText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  bannerSubText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  // Badge
  badge: {
    position: 'absolute', top: -2, right: -2, backgroundColor: '#ef4444',
    borderRadius: 10, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
});