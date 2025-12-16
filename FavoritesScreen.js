import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function FavoritesScreen() {
  const navigation = useNavigation();

  // 模擬收藏資料（可改為從 Firebase Firestore 抓資料）
  const favoriteItems = [
    { id: 1, title: '九份老街', location: '新北市・瑞芳區' },
    { id: 2, title: '淡水夕陽', location: '新北市・淡水區' },
    { id: 3, title: '彩虹眷村', location: '台中市・南屯區' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollWrapper}>
      <Text style={styles.title}>❤️ 我的收藏</Text>

      {favoriteItems.map(item => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardSubtitle}>📍 {item.location}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← 返回主頁</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollWrapper: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontFamily: 'GenRyuMin',
    fontWeight: 'bold',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fefefe',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontFamily: 'GenRyuMin',
    fontSize: 18,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: 'GenRyuMin',
    color: '#666',
    fontSize: 14,
  },
  backButton: {
    marginTop: 20,
    alignSelf: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'GenRyuMin',
    color: '#0b1d3d',
  },
});
