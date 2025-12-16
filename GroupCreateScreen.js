// screens/GroupCreateScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { db } from '../firebase';
import {
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

// UI / Theme
import { useTheme } from '../theme';
import { TAG_TO_TYPES } from '../services/GooglePlacesService';

// 🔥 引入共用元件
import CustomAlert from '../components/ui/CustomAlert';
import LoadingOverlay from '../components/ui/LoadingOverlay';

// 通知服務
import { addNotification } from '../services/NotificationService';

const REGIONS = ['北部', '中部', '南部', '東部', '離島'];
const TAGS = Object.keys(TAG_TO_TYPES || {});

// Chip 元件
const SelectionChip = ({ label, active, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      styles.chip,
      active && styles.chipActive
    ]}
  >
    <Text style={[styles.chipText, active && styles.chipTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

export default function GroupCreateScreen() {
  const t = useTheme();
  const navigation = useNavigation();

  // 表單狀態
  const [groupName, setGroupName] = useState('');
  const [region, setRegion] = useState('北部');
  const [days, setDays] = useState('2');
  const [pickedTags, setPickedTags] = useState(TAGS.length ? [TAGS[0]] : []);

  // 系統狀態
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', onConfirm: null });

  // 工具：顯示彈窗
  const showAlert = (title, message, onConfirm = null, confirmText = "確定") => {
    setAlertConfig({
      visible: true, title, message, confirmText,
      onConfirm: onConfirm || (() => setAlertConfig(prev => ({ ...prev, visible: false })))
    });
  };

  const toggleTag = (tag) => {
    setPickedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  const onCreate = async () => {
    const d = parseInt(days, 10);
    
    // 驗證
    if (!groupName.trim()) return showAlert('提醒', '請輸入群組名稱');
    if (Number.isNaN(d) || d < 1 || d > 10) return showAlert('提醒', '旅遊天數請輸入 1–10 的整數');
    if (!REGIONS.includes(region)) return showAlert('提醒', '請選擇旅遊區域');
    if (!pickedTags.length) return showAlert('提醒', '至少選擇一個偏好標籤');

    try {
      setLoading(true);
      const creator = (await AsyncStorage.getItem('username')) || 'guest';

      // 1. 建立文件
      const docRef = await addDoc(collection(db, 'groups'), {
        name: groupName.trim(),
        region,
        days: d,
        tags: pickedTags,
        creator,
        members: [creator],
        createdAt: serverTimestamp(),
      });

      // 2. 回寫 ID
      await updateDoc(docRef, { groupId: docRef.id });

      // 3. 發送通知
      await addNotification(
        creator,
        'group',
        '群組建立成功',
        `你建立了「${groupName.trim()}」\n群組 ID：${docRef.id}`,
        { groupId: docRef.id, groupName: groupName.trim() }
      );

      setLoading(false);

      // 4. 🔥 成功彈窗：修改這裡的跳轉邏輯
      showAlert(
        '建立成功',
        `群組 ID：${docRef.id}\n\n即將為您生成專屬行程...`,
        () => {
          setAlertConfig(prev => ({ ...prev, visible: false }));
          
          // 🔥 核心修改：使用 reset 重設導航歷史
          // 這樣堆疊順序變成：Home -> GroupList -> Itinerary
          // 所以按返回時，會回到 GroupList，而不是 GroupCreate
          navigation.reset({
            index: 2,
            routes: [
              { name: 'Home' },      // 確保最底層是首頁
              { name: 'GroupList' }, // 中間層是群組列表 (這樣返回就會到這)
              { 
                name: 'Itinerary',   // 最上層是行程頁 (目前顯示的)
                params: { 
                  groupId: docRef.id, 
                  groupName: groupName.trim(),
                  region: region,
                  days: d,
                  tags: pickedTags
                }
              },
            ],
          });
        },
        "前往行程"
      );

    } catch (e) {
      console.error(e);
      setLoading(false);
      showAlert('失敗', '建立群組時發生錯誤，請稍後再試');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0b1d3d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>建立旅遊群組</Text>
        <View style={{ width: 40 }} /> 
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}>
          <View style={{ marginTop: 20 }}>
            <Text style={styles.subTitle}>填寫基本資訊，AI 立即為您規劃 🚀</Text>

            {/* 群組名稱 */}
            <View style={styles.card}>
              <Text style={styles.label}>群組名稱</Text>
              <TextInput
                placeholder="例如：畢業旅行、週末小酌..."
                placeholderTextColor="#9ca3af"
                value={groupName}
                onChangeText={setGroupName}
                style={styles.input}
              />
            </View>

            {/* 旅遊天數 */}
            <View style={styles.card}>
              <Text style={styles.label}>旅遊天數 (天)</Text>
              <TextInput
                placeholder="2"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={days}
                onChangeText={setDays}
                style={styles.input}
              />
              <Text style={styles.hint}>建議 1–10 天，行程較容易規劃。</Text>
            </View>

            {/* 旅遊區域 */}
            <View style={styles.card}>
              <Text style={styles.label}>旅遊區域</Text>
              <View style={styles.chipGrid}>
                {REGIONS.map((r) => (
                  <SelectionChip 
                    key={r} 
                    label={r} 
                    active={region === r} 
                    onPress={() => setRegion(r)} 
                  />
                ))}
              </View>
            </View>

            {/* 偏好標籤 */}
            <View style={styles.card}>
              <Text style={styles.label}>偏好玩法 (可複選)</Text>
              <View style={styles.chipGrid}>
                {TAGS.map((tag) => (
                  <SelectionChip 
                    key={tag} 
                    label={tag} 
                    active={pickedTags.includes(tag)} 
                    onPress={() => toggleTag(tag)} 
                  />
                ))}
              </View>
              <Text style={styles.hint}>這些標籤會影響 AI 推薦的地點與排序。</Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 底部按鈕區 */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.createBtn} onPress={onCreate}>
          <Text style={styles.createBtnText}>確認建立並生成行程</Text>
        </TouchableOpacity>
      </View>

      {/* 全域元件 */}
      <LoadingOverlay visible={loading} message="正在建立群組..." />
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
        confirmText={alertConfig.confirmText}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Header
  headerContainer: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0b1d3d',
  },
  subTitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
    textAlign: 'center',
  },

  // Card Style (與首頁一致)
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    // 陰影
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0b1d3d',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#333',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#9ca3af',
  },

  // Chips
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: {
    backgroundColor: '#0b1d3d', // 主題深藍
    borderColor: '#0b1d3d',
  },
  chipText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Footer Button
  footer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  createBtn: {
    backgroundColor: '#0b1d3d',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#0b1d3d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});