// screens/ProfileScreen.js
import React, { useMemo, useState, useEffect } from 'react';
import { 
  ScrollView, 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  Alert, 
  Image, 
  TouchableOpacity, 
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; 

import { useTheme } from '../theme';
import Button from '../components/ui/Button';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useCurrentUser } from '../hooks/useCurrentUser';

export default function ProfileScreen() {
  const t = useTheme();
  const navigation = useNavigation();
  const { username, user, loading } = useCurrentUser();

  // 編輯模式
  const [isEditing, setIsEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // 表單資料
  const [displayName, setDisplayName] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [bucketList, setBucketList] = useState(''); // 新增：夢想清單
  
  const [showUrlInput, setShowUrlInput] = useState(false);

  // 初始化資料
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? '');
    setLocation(user.location ?? '');
    setBio(user.bio ?? '');
    setPhotoURL(user.photoURL ?? '');
    setBucketList(user.bucketList ?? ''); // 讀取夢想清單
  }, [user]);

  const onSave = async () => {
    if (!username) return;
    try {
      setBusy(true);
      const ref = doc(db, 'users', username);
      await setDoc(ref, {
        email: username,
        displayName: displayName.trim(),
        location: location.trim(),
        bio: bio.trim(),
        photoURL: photoURL.trim(),
        bucketList: bucketList.trim(), // 儲存夢想清單
      }, { merge: true });
      
      setIsEditing(false);
      setShowUrlInput(false);
      Alert.alert('更新成功', '你的個人檔案已更新 ✨');
    } catch (e) {
      console.error(e);
      Alert.alert('儲存失敗', '請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    Alert.alert('登出確認', '確定要登出目前的帳號嗎？', [
      { text: '取消', style: 'cancel' },
      { 
        text: '登出', 
        style: 'destructive', 
        onPress: async () => {
          await AsyncStorage.removeItem('username');
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      }
    ]);
  };

  // 📊 統計數據
  const stats = useMemo(() => {
    const s = user?.stats || {};
    return [
      { label: '探索城市', value: s.visitedCities ?? 0, icon: 'map', color: '#0284c7', bg: '#e0f2fe' },
      { label: '累積旅程', value: s.journeys ?? 0, icon: 'airplane', color: '#d97706', bg: '#fef3c7' },
      { label: '成就勳章', value: s.badges ?? 0, icon: 'trophy', color: '#16a34a', bg: '#f0fdf4' },
    ];
  }, [user?.stats]);

  // 🎖 計算旅人等級 (虛擬邏輯：根據旅程數)
  const travelerLevel = useMemo(() => {
    const count = user?.stats?.journeys ?? 0;
    if (count > 20) return { title: '傳奇探險家', progress: 100, color: '#f59e0b' };
    if (count > 10) return { title: '資深背包客', progress: 80, color: '#8b5cf6' };
    if (count > 5) return { title: '城市漫遊者', progress: 50, color: '#0ea5e9' };
    return { title: '新手旅人', progress: 20, color: '#10b981' }; // 預設
  }, [user?.stats]);

  if (!loading && !username) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="person-circle-outline" size={80} color="#cbd5e1" />
        <Text style={[styles.emptyText, { fontFamily: t.font.family }]}>您尚未登入</Text>
        <Button title="前往登入" style={{marginTop: 20}} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0b1d3d" />
      
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {/* 🔥 1. Header Cover */}
        <View style={styles.headerCover}>
          <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={24} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* 🔥 2. Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity 
            style={styles.editModeBtn} 
            onPress={() => isEditing ? onSave() : setIsEditing(true)}
          >
            <Ionicons name={isEditing ? "checkmark" : "create-outline"} size={18} color={isEditing ? "#fff" : "#0b1d3d"} />
            <Text style={[styles.editModeText, { color: isEditing ? "#fff" : "#0b1d3d" }]}>
              {isEditing ? "儲存" : "編輯"}
            </Text>
          </TouchableOpacity>

          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <Image 
              source={photoURL ? { uri: photoURL } : require('../assets/icon.png')} 
              style={styles.avatar} 
            />
            {isEditing && (
              <TouchableOpacity style={styles.cameraBtn} onPress={() => setShowUrlInput(!showUrlInput)}>
                <Ionicons name="camera" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {isEditing && showUrlInput && (
            <TextInput 
              value={photoURL} 
              onChangeText={setPhotoURL} 
              placeholder="圖片網址..." 
              style={styles.urlInput}
              autoCapitalize="none"
            />
          )}

          {/* Name & Location */}
          <View style={{ alignItems: 'center', marginTop: 8, width: '100%' }}>
            {isEditing ? (
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="輸入您的暱稱"
                style={[styles.nameText, styles.editInputBase]}
                textAlign="center"
              />
            ) : (
              <Text style={[styles.nameText, { fontFamily: t.font.family }]}>
                {displayName || '未命名旅人'}
              </Text>
            )}

            <View style={styles.locationRow}>
              <Ionicons name="location-sharp" size={14} color="#ef4444" />
              {isEditing ? (
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="輸入地點"
                  style={[styles.locationText, styles.editInputBase, { minWidth: 80 }]}
                />
              ) : (
                <Text style={[styles.locationText, { fontFamily: t.font.family }]}>
                  {location || '台灣・地球'}
                </Text>
              )}
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsRow}>
            {stats.map((stat, index) => (
              <View key={index} style={styles.statItem}>
                <View style={[styles.statIconBox, { backgroundColor: stat.bg }]}>
                  <Ionicons name={stat.icon} size={20} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 🔥 3. 旅人等級 (填補空缺的新區塊) */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>旅人等級</Text>
          <View style={styles.levelCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.levelTitle}>{travelerLevel.title}</Text>
              <Text style={styles.levelPercent}>Lv.{user?.stats?.journeys || 1}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${travelerLevel.progress}%`, backgroundColor: travelerLevel.color }]} />
            </View>
            <Text style={styles.levelDesc}>
              {travelerLevel.progress < 100 ? '再多去幾趟旅行來升級！' : '你已經是旅遊大師了！'}
            </Text>
          </View>
        </View>

        {/* 🔥 4. 歷史回憶錄 (取代原本的收藏選單) */}
        {!isEditing && (
          <View style={styles.sectionContainer}>
            <TouchableOpacity 
              style={styles.historyCard} 
              activeOpacity={0.9}
              onPress={() => navigation.getParent()?.navigate('History')}
            >
              <View style={styles.historyLeft}>
                <MaterialCommunityIcons name="book-open-page-variant" size={28} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>回顧我的旅程</Text>
                <Text style={styles.historySub}>查看所有 AI 與手動行程紀錄</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
            </TouchableOpacity>
          </View>
        )}

        {/* 🔥 5. 關於我 & 夢想清單 (合併在一起顯示) */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>關於我</Text>
          <View style={styles.bioBox}>
            {isEditing ? (
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="寫下你的旅遊風格..."
                multiline
                style={[styles.bioText, { minHeight: 60, marginBottom: 12 }]}
              />
            ) : (
              <Text style={[styles.bioText, { marginBottom: 16 }]}>
                {bio || '這傢伙很神祕，還沒寫下自我介紹...'}
              </Text>
            )}

            {/* 分隔線 */}
            <View style={styles.divider} />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Ionicons name="airplane" size={16} color="#0b1d3d" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0b1d3d' }}>下一個夢想目的地</Text>
            </View>
            
            {isEditing ? (
              <TextInput
                value={bucketList}
                onChangeText={setBucketList}
                placeholder="例如：冰島、迪士尼..."
                style={[styles.bioText, styles.editInputBase]}
              />
            ) : (
              <Text style={styles.bioText}>
                {bucketList || '尚未設定（點擊編輯來新增）'}
              </Text>
            )}
          </View>
        </View>

      </ScrollView>

      {(loading || busy) && <LoadingOverlay text={busy ? "儲存中..." : "載入中..."} />}
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  emptyText: { color: '#94a3b8', fontSize: 16, marginTop: 12 },

  // Header
  headerCover: {
    height: 150, backgroundColor: '#0b1d3d',
    paddingTop: Platform.OS === 'ios' ? 50 : 30, paddingHorizontal: 20, alignItems: 'flex-end',
  },
  logoutBtn: { padding: 8 },

  // Profile Card
  profileCard: {
    marginTop: -60, marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20,
    paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center',
    shadowColor: "#0b1d3d", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 6,
  },
  editModeBtn: {
    position: 'absolute', top: 16, right: 16, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f4f6', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, zIndex: 10,
  },
  editModeText: { fontSize: 13, fontWeight: '600', marginLeft: 4 },

  avatarContainer: { position: 'relative', marginBottom: 12 },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 4, borderColor: '#fff', backgroundColor: '#e2e8f0' },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0, backgroundColor: '#0b1d3d', width: 28, height: 28,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff'
  },
  urlInput: {
    width: '90%', fontSize: 13, padding: 8, backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10
  },

  nameText: { fontSize: 22, fontWeight: '800', color: '#1f2937', marginBottom: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationText: { fontSize: 14, color: '#6b7280', marginLeft: 4 },
  editInputBase: { borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 2 },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6'
  },
  statItem: { flex: 1, alignItems: 'center' },
  statIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#1f2937' },
  statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  // Sections
  sectionContainer: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0b1d3d', marginBottom: 10 },

  // Level Card (New)
  levelCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  levelTitle: { fontSize: 16, fontWeight: '800', color: '#334155' },
  levelPercent: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  progressBarBg: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  levelDesc: { fontSize: 12, color: '#94a3b8', marginTop: 8 },

  // History Card (New)
  historyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  historyLeft: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#0b1d3d', alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  historyTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  historySub: { fontSize: 13, color: '#64748b', marginTop: 2 },

  // Bio & Bucket List
  bioBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  bioText: { fontSize: 15, color: '#4b5563', lineHeight: 24 },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
});