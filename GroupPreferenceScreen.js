// screens/GroupPreferenceScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';

// ✅ 共用容器
import Screen from '../components/ui/Screen';

// Design System
import { useTheme } from '../theme';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';

import { TAG_TO_TYPES } from '../services/GooglePlacesService';

// 與 GooglePlacesService 的設定保持一致
const REGIONS = ['北部', '中部', '南部'];

// --- ① 你原本的 6 大類，改名成 BASE_TAG_SECTIONS ---
const BASE_TAG_SECTIONS = [
  {
    title: '🍣 美食系',
    tags: ['美食吃爆', '甜點控', '咖啡廳巡禮', '在地小吃', '早午餐'],
  },
  {
    title: '🌳 自然系',
    tags: ['自然景點', '海邊放空', '登山健行', '賞花賞景'],
  },
  {
    title: '🎌 文化系',
    tags: ['文青散步', '歷史文化', '藝術展覽', '宗教建築'],
  },
  {
    title: '🛍 逛街系',
    tags: ['商圈購物', '文創小店', 'Outlet購物', '夜市文化'],
  },
  {
    title: '🌙 夜生活系',
    tags: ['夜生活', '看夜景', '酒吧微醺'],
  },
  {
    title: '🚶‍♀️ 放鬆 / 其他',
    tags: ['慢步散心', 'SPA放鬆', '泡湯溫泉', '親子同樂', '情侶約會', '寵物友善', '電影院', '遊樂園', '打卡地標', '知名建築'],
  },
];

// --- ② 從 GooglePlacesService 把所有 tag 抓出來，補到「🆕 其他標籤」 ---
const allTagKeys = Object.keys(TAG_TO_TYPES || {});
const knownTagSet = new Set(
  BASE_TAG_SECTIONS.flatMap((section) => section.tags)
);
const extraTags = allTagKeys.filter((tag) => !knownTagSet.has(tag));

const TAG_SECTIONS = extraTags.length
  ? [
      ...BASE_TAG_SECTIONS,
      {
        title: '🆕 其他標籤',
        tags: extraTags,
      },
    ]
  : BASE_TAG_SECTIONS;

export default function GroupPreferenceScreen() {
  const t = useTheme();
  const navigation = useNavigation();
  const route = useRoute();

  const groupId = route?.params?.groupId;
  const groupNameParam = route?.params?.groupName || '未命名群組';

  const [group, setGroup] = useState(null);
  const [region, setRegion] = useState(route?.params?.region || '北部');
  const [days, setDays] = useState(String(route?.params?.days || 2));
  const [pickedTags, setPickedTags] = useState(
    Array.isArray(route?.params?.tags) && route.params.tags.length
      ? route.params.tags
      : ['美食吃爆']
  );
  const [busy, setBusy] = useState(false);

  // 讀取群組現況
  useEffect(() => {
    if (!groupId) return;
    const ref = doc(db, 'groups', groupId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const g = { id: snap.id, ...snap.data() };
      setGroup(g);

      if (g.region && REGIONS.includes(g.region)) setRegion(g.region);
      if (typeof g.days === 'number') setDays(String(g.days));
      if (Array.isArray(g.tags) && g.tags.length) {
        setPickedTags((prev) =>
          prev.join() === g.tags.join() ? prev : g.tags
        );
      }
    });
    return () => unsub();
  }, [groupId]);

  const toggleTag = (tag) => {
    setPickedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  const savePreference = async () => {
    const nDays = parseInt(days, 10);
    if (Number.isNaN(nDays) || nDays < 1 || nDays > 10) {
      Alert.alert('提醒', '旅遊天數請輸入 1–10 的整數');
      return;
    }
    if (!REGIONS.includes(region)) {
      Alert.alert('提醒', '請選擇旅遊區域');
      return;
    }
    if (!pickedTags.length) {
      Alert.alert('提醒', '至少選擇一個偏好標籤');
      return;
    }

    try {
      setBusy(true);
      await updateDoc(doc(db, 'groups', groupId), {
        region,
        days: nDays,
        tags: pickedTags,
      });
      Alert.alert('已儲存', '偏好設定已更新', [
        { text: '完成', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('失敗', '儲存偏好時發生錯誤，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  const goItinerary = () => {
    navigation.navigate('Itinerary', {
      groupId,
      groupName: group?.name || groupNameParam,
      days: Number(days) || 2,
      region,
      tags: pickedTags,
    });
  };

  return (
    <Screen>
      <Text style={{ fontSize: t.font.h2, fontFamily: t.font.family, color: t.colors.text, marginBottom: 4 }}>
        偏好設定
      </Text>
      <Text style={{ color: t.colors.muted, fontFamily: t.font.family, marginBottom: 12 }}>
        {group?.name || groupNameParam}
      </Text>

      {/* 地區 */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.label, { color: t.colors.muted, fontFamily: t.font.family }]}>
          旅遊區域
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {REGIONS.map((r) => (
            <Chip key={r} label={r} active={region === r} onPress={() => setRegion(r)} />
          ))}
        </View>
      </Card>

      {/* 天數 */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.label, { color: t.colors.muted, fontFamily: t.font.family }]}>
          旅遊天數
        </Text>
        <TextInput
          placeholder="2"
          placeholderTextColor={t.colors.muted}
          keyboardType="number-pad"
          value={days}
          onChangeText={setDays}
          style={[styles.input, { borderColor: t.colors.border, color: t.colors.text }]}
        />
        <Text style={{ color: t.colors.muted, fontSize: 12 }}>
          建議 1–10 天，行程較容易規劃。
        </Text>
      </Card>

      {/* 旅遊標籤 */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.label}>旅遊標籤（可複選）</Text>

        {TAG_SECTIONS.map((section) => (
          <View key={section.title} style={{ marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {section.tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  active={pickedTags.includes(tag)}
                  onPress={() => toggleTag(tag)}
                />
              ))}
            </View>
          </View>
        ))}
      </Card>

      {/* 動作 */}
      <View style={{ gap: 10 }}>
        <Button title="💾 儲存偏好" onPress={savePreference} loading={busy} />
        <Button title="🧭 生成行程" variant="outline" onPress={goItinerary} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, marginBottom: 6 },
  input: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
    fontFamily: 'GenRyuMin',
  },
});
