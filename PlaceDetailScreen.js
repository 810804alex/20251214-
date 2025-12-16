import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function PlaceDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { title, location, image } = route.params;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backButtonText}>← 返回地圖</Text>
      </TouchableOpacity>

      <Image source={image} style={styles.image} />

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.location}>📍 {location}</Text>

      <View style={styles.descriptionContainer}>
        <Text style={styles.description}>
          {title} 是台灣非常有特色的旅遊景點，擁有豐富的文化與自然景觀，非常適合週末短途旅行或與朋友一同前往探索。
        </Text>
      </View>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>❤️ 加入收藏</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'GenRyuMin',
    color: '#0b1d3d',
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: 'GenRyuMin',
    marginBottom: 8,
  },
  location: {
    fontSize: 16,
    fontFamily: 'GenRyuMin',
    color: '#666',
    marginBottom: 20,
  },
  descriptionContainer: {
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    fontFamily: 'GenRyuMin',
    lineHeight: 24,
    color: '#333',
  },
  button: {
    backgroundColor: '#0b1d3d',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'GenRyuMin',
  },
});
