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
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location'; // 🔥 1. 引入 Location

// 子頁面 (保持不變)
import NotificationScreen from './NotificationScreen';
import ProfileScreen from './ProfileScreen';
import MapScreen from './MapScreen';

// Design System
import { useTheme } from '../theme';

// 🔥 引入共用元件
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

// 🔥 2. 定義 API Key
const GOOGLE_API_KEY = 'AIzaSyCH_XC3ju87XIlYjfcZd6B8BXr-7wQcYmo';

function HomeMain() {
  const navigation = useNavigation();
  const t = useTheme();

  // 狀態
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: null,
  });

  // Data
  const [me, setMe] = useState(null);
  const [allGroups, setAllGroups] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [manualCode, setManualCode] = useState('');

  // 🔥 3. 新增推薦行程狀態
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(true);

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

  // 🔥 4. 取得位置並抓取推薦
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Permission to access location was denied');
          setRecLoading(false);
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;
        
        await fetchNearbyPlaces(latitude, longitude);
      } catch (error) {
        console.error("Location Error:", error);
        setRecLoading(false);
      }
    })();
  }, []);

  // 🔥 5. Google Places API 搜尋函式
  const fetchNearbyPlaces = async (lat, lng) => {
    try {
      const radius = 5000; // 搜尋半徑 5公里
      const type = 'tourist_attraction'; // 搜尋類別：觀光景點
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&language=zh-TW&key=${GOOGLE_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results) {
        // 篩選：有評分、評分 > 4.0、有照片
        const filtered = data.results.filter(
          p => p.rating && p.rating >= 4.0 && p.photos && p.photos.length > 0
        );
        
        // 排序：評分由高到低
        filtered.sort((a, b) => b.rating - a.rating);

        // 取前 5 名
        setRecommendations(filtered.slice(0, 5));
      }
    } catch (e) {
      console.error("Fetch Places Error:", e);
    } finally {
      setRecLoading(false);
    }
  };

  const myGroups = useMemo(() => {
    if (!me) return [];
    const mine = allGroups.filter((g) => {
      const inMembers = Array.isArray(g.members) && g.members.includes(me);
      return inMembers || g.creator === me;
    });
    return mine
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 5);
  }, [allGroups, me]);

  const showAlert = (title, message, onConfirm = null) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      onConfirm:
        onConfirm ||
        (() => setAlertConfig((prev) => ({ ...prev, visible: false }))),
    });
  };

  const goToMissions = () => {
    navigation.getParent()?.navigate('Missions', { refreshAt: Date.now() });
  };

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
        setAlertConfig((prev) => ({ ...prev, visible: false }));
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

  const handleOpenManual = () => {
    const code = manualCode.trim();
    if (!code.startsWith('manual-')) {
      showAlert('格式錯誤', '行程 ID 應為 manual-xxxx');
      return;
    }
    navigation.getParent()?.navigate('ManualPlan', { planId: code });
    setManualCode('');
  };

  // 🔥 6. 點擊推薦卡片：導航至 MapScreen 並鎖定地點
  const handlePressRecommendation = (item) => {
    navigation.getParent()?.navigate('Map', {
      openDetail: true,
      focus: {
        id: item.place_id,
        placeId: item.place_id,
        name: item.name,
        lat: item.geometry.location.lat,
        lng: item.geometry.location.lng,
        address: item.vicinity,
        rating: item.rating,
        photoUrl: item.photos?.[0]?.photo_reference 
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${item.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
          : null
      }
    });
  };

  // 🔥 7. 全新的推薦卡片 Render
  const renderRecommendationCard = ({ item }) => {
    const photoUrl = item.photos?.[0]?.photo_reference 
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${item.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
      : 'https://via.placeholder.com/400x200?text=No+Image';

    return (
      <TouchableOpacity 
        style={styles.recCard} 
        activeOpacity={0.9}
        onPress={() => handlePressRecommendation(item)}
      >
        <Image source={{ uri: photoUrl }} style={styles.recImage} />
        <View style={styles.recOverlay}>
          <View style={styles.recBadge}>
            <Ionicons name="star" size={12} color="#fff" />
            <Text style={styles.recBadgeText}>{item.rating}</Text>
          </View>
          <Text style={styles.recTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.recSub} numberOfLines={1}>📍 {item.vicinity}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      <View style={styles.headerContainer}>
        <Image
          source={require('../assets/zhuan-ti-logo.png')}
          style={styles.logo}
        />
      </View>

      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {/* 我的群組快覽 */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>我的旅程</Text>
              <TouchableOpacity
                onPress={() => navigation.getParent()?.navigate('GroupList')}
              >
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
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.groupCard}
                    activeOpacity={0.9}
                    onPress={() =>
                      navigation.getParent()?.navigate('Itinerary', {
                        groupId: item.id,
                        groupName: item.name,
                        days: Number(item.days || 1),
                        region: item.region || '北部',
                        tags: item.tags || [],
                      })
                    }
                  >
                    <View style={styles.groupCardHeader}>
                      <Text style={styles.groupCardRegion}>
                        {item.region || '台灣'}
                      </Text>
                      <Text style={styles.groupCardDays}>{item.days || 1} 天</Text>
                    </View>
                    <View style={styles.groupCardBody}>
                      <Text style={styles.groupCardTitle} numberOfLines={1}>
                        {item.name || '未命名'}
                      </Text>
                      <Text style={styles.groupCardTag} numberOfLines={1}>
                        🏷 {Array.isArray(item.tags) ? item.tags.join('、') : '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          {/* 快捷功能區 */}
          <View style={styles.sectionContainer}>
            <Text
              style={[
                styles.sectionTitle,
                { paddingHorizontal: 20, marginBottom: 12 },
              ]}
            >
              快捷功能
            </Text>

            <View style={styles.actionGrid}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.getParent()?.navigate('GroupCreate')}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#e0f2fe' }]}>
                  <Ionicons name="add-circle" size={28} color="#0284c7" />
                </View>
                <Text style={styles.actionText}>建立群組</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.getParent()?.navigate('GroupList')}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="people" size={28} color="#16a34a" />
                </View>
                <Text style={styles.actionText}>群組清單</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.getParent()?.navigate('ManualPlan')}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="create" size={28} color="#d97706" />
                </View>
                <Text style={styles.actionText}>手動排程</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.getParent()?.navigate('History')}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#f3e8ff' }]}>
                  <Ionicons name="time" size={28} color="#9333ea" />
                </View>
                <Text style={styles.actionText}>歷史行程</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={goToMissions}>
                <View style={[styles.actionIcon, { backgroundColor: '#ffe4e6' }]}>
                  <Ionicons name="location" size={28} color="#e11d48" />
                </View>
                <Text style={styles.actionText}>打卡任務</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 加入功能區 */}
          <View style={styles.sectionContainer}>
            <Text
              style={[
                styles.sectionTitle,
                { paddingHorizontal: 20, marginBottom: 12 },
              ]}
            >
              加入旅程
            </Text>

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

            <View style={[styles.inputCard, { marginTop: 12 }]}>
              <View style={styles.inputHeader}>
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#0b1d3d"
                />
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
                <TouchableOpacity
                  style={[styles.joinBtn, { backgroundColor: '#4b5563' }]}
                  onPress={handleOpenManual}
                >
                  <Text style={styles.joinBtnText}>開啟</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* 🔥 8. 探索靈感 (取代原本的假色塊) */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {recLoading ? '正在搜尋附近好去處...' : '探索周邊靈感 (Rating 4.0+)'}
              </Text>
            </View>
            
            {recLoading ? (
              <ActivityIndicator size="small" color="#0b1d3d" style={{marginTop: 20}} />
            ) : recommendations.length === 0 ? (
              <View style={{paddingHorizontal: 20}}>
                <Text style={{color: '#94a3b8'}}>附近暫無推薦景點，請開啟定位或移動位置。</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={recommendations}
                renderItem={renderRecommendationCard}
                keyExtractor={(item) => item.place_id}
                contentContainerStyle={{ paddingHorizontal: 20 }}
              />
            )}
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

const Tab = createBottomTabNavigator();

export default function HomeScreen() {
  const unreadCount = useUnreadCount();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarLabel: () => null,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#f0f0f0',
          height: 60,
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
      <Tab.Screen name="Explore" children={() => <View style={{ flex: 1, backgroundColor: '#fff' }}><Text>Explore</Text></View>} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Notifications" component={NotificationScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerContainer: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 50,
    paddingBottom: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },

  logo: {
    width: '70%',
    height: 70,
    resizeMode: 'contain'
  },

  sectionContainer: { marginTop: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0b1d3d' },
  sectionLink: { fontSize: 13, color: '#6b7280', fontWeight: '500' },

  groupCard: {
    width: width * 0.75,
    height: 140,
    backgroundColor: '#0b1d3d',
    borderRadius: 16,
    marginRight: 16,
    padding: 16,
    justifyContent: 'space-between',
    shadowColor: "#0b1d3d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  groupCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupCardRegion: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8
  },
  groupCardDays: { color: '#fbbf24', fontSize: 14, fontWeight: '700' },
  groupCardBody: {},
  groupCardTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  groupCardTag: { fontSize: 12, color: '#cbd5e1' },

  emptyCard: {
    marginHorizontal: 20,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed'
  },
  emptyText: { marginTop: 8, color: '#94a3b8', fontSize: 14 },

  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20
  },
  actionBtn: { alignItems: 'center', width: '18%', marginBottom: 12 },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  actionText: { fontSize: 12, color: '#333', fontWeight: '500' },

  inputCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inputHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  inputTitle: { fontSize: 15, fontWeight: '700', color: '#0b1d3d', marginLeft: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  textInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 10,
    color: '#333'
  },
  joinBtn: { backgroundColor: '#0b1d3d', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // 🔥 9. 推薦卡片樣式
  recCard: {
    width: 200,
    height: 140,
    borderRadius: 16,
    marginRight: 16,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden', // 讓圖片圓角生效
    position: 'relative',
  },
  recImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  recOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.4)', // 漸層黑底
  },
  recBadge: {
    position: 'absolute',
    top: -110, // 往上放
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  recBadgeText: { color: '#fbbf24', fontSize: 12, fontWeight: 'bold' },
  recTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  recSub: { color: '#cbd5e1', fontSize: 10 },

  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
});