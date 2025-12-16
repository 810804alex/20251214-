// screens/GroupStatsScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { PieChart } from 'react-native-chart-kit';

// ✅ 共用容器（SafeArea + KeyboardAvoiding）
import Screen from '../components/ui/Screen';

export default function GroupStatsScreen({ route, navigation }) {
  const { groupId, groupName } = route.params;
  const [preferences, setPreferences] = useState({});
  const [tagStats, setTagStats] = useState([]);
  const [mostDays, setMostDays] = useState(null);
  const [mostRegion, setMostRegion] = useState(null);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const docRef = doc(db, 'groups', groupId);
        const docSnap = await getDoc(docRef);
        const data = docSnap.data()?.membersPreferences || {};
        setPreferences(data);
        processStats(data);
      } catch (err) {
        console.error('讀取偏好失敗:', err);
      }
    };
    fetchPreferences();
  }, []);

  const processStats = (prefs) => {
    const tagCount = {};
    const daysCount = {};
    const regionCount = {};

    Object.values(prefs).forEach(pref => {
      (pref.tags || []).forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
      if (pref.days) daysCount[pref.days] = (daysCount[pref.days] || 0) + 1;
      if (pref.region) regionCount[pref.region] = (regionCount[pref.region] || 0) + 1;
    });

    const pieData = Object.entries(tagCount).map(([tag, count], index) => ({
      name: tag,
      population: count,
      color: pieColors[index % pieColors.length],
      legendFontColor: '#333',
      legendFontSize: 14,
    }));

    const _mostDays = Object.entries(daysCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '無';
    const _mostRegion = Object.entries(regionCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '無';

    setTagStats(pieData);
    setMostDays(_mostDays);
    setMostRegion(_mostRegion);
  };

  return (
    <Screen scroll={false}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>📊 {groupName} - 偏好統計</Text>

        <Text style={styles.sub}>🗓️ 最多人選的天數：{mostDays} 天</Text>
        <Text style={styles.sub}>🗺️ 最多人選的地區：{mostRegion}</Text>

        <Text style={[styles.sub, { marginTop: 20 }]}>🏷️ 偏好標籤比例：</Text>
        {tagStats.length > 0 ? (
          <PieChart
            data={tagStats}
            width={Dimensions.get('window').width - 40}
            height={220}
            chartConfig={{ color: () => `#333` }}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="10"
            absolute
          />
        ) : (
          <Text style={styles.sub}>尚無標籤資料</Text>
        )}

        <Text style={[styles.sub, { marginTop: 24 }]}>📌 想看看 AI 行程怎麼安排？</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            if (mostDays && mostRegion && tagStats.length > 0) {
              navigation.navigate('Itinerary', {
                groupId,
                groupName,
                days: parseInt(mostDays, 10),
                region: mostRegion,
                tags: tagStats.map(t => t.name),
              });
            }
          }}
        >
          <Text style={styles.buttonText}>🚀 生成旅程建議</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('GroupMembers', { groupId, groupName })}
        >
          <Text style={styles.buttonText}>👥 查看群組成員</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const pieColors = ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff', '#ff9f40'];

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'GenRyuMin',
    marginBottom: 20,
  },
  sub: {
    fontSize: 16,
    fontFamily: 'GenRyuMin',
    marginBottom: 6,
  },
  button: {
    marginTop: 12,
    backgroundColor: '#0b1d3d',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'GenRyuMin',
  },
});
