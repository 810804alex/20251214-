// screens/NotificationScreen.js
import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  Animated
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

import { markAllAsRead, clearAllNotifications } from '../services/NotificationService';
import { useTheme } from '../theme';
import LoadingOverlay from '../components/ui/LoadingOverlay';

export default function NotificationScreen({ navigation }) {
  const t = useTheme();
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('username').then((u) => setMe(u || 'guest'));
  }, []);

  useEffect(() => {
    if (!me) return;

    const q = query(collection(db, 'notifications'), where('toUser', '==', me));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });

      setRows(list);
      setLoading(false);
    });

    return () => unsub();
  }, [me]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 350);
  };

  const markOneRead = async (n) => {
    if (n.read) return;
    try {
      await updateDoc(doc(db, 'notifications', n.id), { read: true });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteOne = async (id) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (e) {
      console.error(e);
    }
  };

  const formatWhen = (n) => {
    const ts = n.createdAt?.toDate?.() || (n.createdAt instanceof Date ? n.createdAt : null);
    if (!ts) return '';
    
    // 簡單的時間格式化：如果是今天顯示時間，否則顯示日期
    const now = new Date();
    const isToday = ts.getDate() === now.getDate() && ts.getMonth() === now.getMonth() && ts.getFullYear() === now.getFullYear();
    const pad = (x) => String(x).padStart(2, '0');
    
    if (isToday) {
      return `${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
    } else {
      return `${ts.getMonth() + 1}/${ts.getDate()}`;
    }
  };

  const onPressItem = async (n) => {
    await markOneRead(n);

    if (n.type === 'member' || n.type === 'group') {
      navigation?.getParent()?.navigate('GroupMembers', {
        groupId: n.meta?.groupId,
        groupName: n.meta?.groupName || '未命名群組',
      });
    } else if (n.type === 'itinerary') {
      navigation?.getParent()?.navigate('Itinerary', {
        groupId: n.meta?.groupId,
        groupName: n.meta?.groupName || '未命名群組',
        days: Number(n.meta?.days || 2),
        region: n.meta?.region || '北部',
        tags: n.meta?.tags || [],
      });
    }
  };

  // 🔥 根據類型決定 Icon 與顏色
  const getIconConfig = (type) => {
    switch (type) {
      case 'member':
        return { icon: 'person-add', color: '#0284c7', bg: '#e0f2fe' }; // 藍色
      case 'group':
        return { icon: 'people', color: '#7c3aed', bg: '#f3e8ff' }; // 紫色
      case 'itinerary':
        return { icon: 'map', color: '#d97706', bg: '#fef3c7' }; // 橘色
      case 'system':
        return { icon: 'information-circle', color: '#dc2626', bg: '#fee2e2' }; // 紅色
      default:
        return { icon: 'notifications', color: '#4b5563', bg: '#f3f4f6' }; // 灰色
    }
  };

  // 左滑刪除 UI
  const renderRightActions = (progress, dragX, id) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity onPress={() => deleteOne(id)} style={styles.deleteAction}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>通知中心</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => markAllAsRead(me)} style={styles.iconBtn}>
              <Ionicons name="checkmark-done-outline" size={22} color="#0b1d3d" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() =>
                Alert.alert('確認清除', '確定要刪除所有通知？', [
                  { text: '取消', style: 'cancel' },
                  { text: '刪除', style: 'destructive', onPress: () => clearAllNotifications(me) },
                ])
              } 
              style={styles.iconBtn}
            >
              <Ionicons name="trash-outline" size={22} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 列表 */}
        {rows.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="notifications-off-outline" size={40} color="#cbd5e1" />
            </View>
            <Text style={styles.emptyText}>目前沒有任何新通知</Text>
          </View>
        ) : (
          <ScrollView 
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {rows.map((n) => {
              const { icon, color, bg } = getIconConfig(n.type);
              return (
                <Swipeable
                  key={n.id}
                  renderRightActions={(p, d) => renderRightActions(p, d, n.id)}
                >
                  <TouchableOpacity 
                    onPress={() => onPressItem(n)} 
                    activeOpacity={0.9}
                    style={[styles.card, !n.read && styles.unreadCard]}
                  >
                    {/* 左側 Icon */}
                    <View style={[styles.iconBox, { backgroundColor: bg }]}>
                      <Ionicons name={icon} size={20} color={color} />
                    </View>

                    {/* 中間內容 */}
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={[styles.title, !n.read && styles.unreadTitle]} numberOfLines={1}>
                          {n.title}
                        </Text>
                        <Text style={styles.timeText}>{formatWhen(n)}</Text>
                      </View>
                      
                      <Text style={styles.bodyText} numberOfLines={2}>{n.body}</Text>
                      
                      {!!n.meta?.groupName && (
                        <Text style={styles.metaText}>群組：{n.meta.groupName}</Text>
                      )}
                    </View>

                    {/* 右側未讀紅點 */}
                    {!n.read && <View style={styles.redDot} />}
                  </TouchableOpacity>
                </Swipeable>
              );
            })}
          </ScrollView>
        )}

        {loading && <LoadingOverlay text="讀取通知中..." />}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#0b1d3d' },
  iconBtn: { padding: 4 },

  // Empty State
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { color: '#94a3b8', fontSize: 16 },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    // 陰影
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 1, borderColor: 'transparent',
  },
  unreadCard: {
    backgroundColor: '#f0f9ff', // 未讀時淡淡的藍色背景
    borderColor: '#e0f2fe',
  },

  // Icon Box
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },

  // Text Styles
  title: { fontSize: 15, fontWeight: '600', color: '#374151', flex: 1 },
  unreadTitle: { fontWeight: '800', color: '#0b1d3d' },
  
  bodyText: { fontSize: 13, color: '#6b7280', lineHeight: 20 },
  metaText: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  timeText: { fontSize: 12, color: '#9ca3af', marginLeft: 8 },

  // Indicators
  redDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444',
    marginTop: 6, marginLeft: 4,
  },

  // Swipe Action
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    height: '100%', // 充滿卡片高度
    borderRadius: 16,
    marginBottom: 12,
    marginLeft: 8,
  },
});