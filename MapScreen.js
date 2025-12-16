// screens/MapScreen.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Dimensions,
  TextInput, ScrollView, SafeAreaView, Platform, ActivityIndicator, Alert, StatusBar, FlatList, Keyboard
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { db } from '../firebase';
// 🔥 1. 新增 doc, setDoc, serverTimestamp 引用
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { 
  awardBadgeForMission, 
  getCompletedMissionIdSet 
} from '../services/BadgeService';
import { metersBetween } from '../services/CheckInService';

const GOOGLE_API_KEY = 'AIzaSyCH_XC3ju87XIlYjfcZd6B8BXr-7wQcYmo';
const DIST_THRESHOLD = 100;

const COLORS = {
  primary: '#0F172A', 
  accent: '#3B82F6',  
  success: '#10B981', 
  warning: '#F59E0B', 
  surface: '#FFFFFF',
  text: '#1E293B',
  subText: '#64748B',
  border: '#E2E8F0',
  shadow: '#94A3B8',
  danger: '#EF4444', 
};

const CATEGORIES = [
  { key: 'tourist_attraction', label: '景點', icon: 'camera-outline' },
  { key: 'restaurant',         label: '美食', icon: 'restaurant-outline' },
  { key: 'cafe',               label: '咖啡', icon: 'cafe-outline' },
  { key: 'shopping_mall',      label: '購物', icon: 'cart-outline' },
  { key: 'night_market',       label: '夜市', icon: 'moon-outline' },
];

const { width, height } = Dimensions.get('window');

// API: 搜尋地點建議
async function fetchPredictions(text) {
  if (!text || text.length < 1) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_API_KEY}&language=zh-TW&components=country:tw`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK') {
      return data.predictions;
    }
    return [];
  } catch (e) {
    console.error("Search Error:", e);
    return [];
  }
}

// API: 取得地點詳細資訊
async function getPlaceDetails(placeId) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_API_KEY}&language=zh-TW&fields=geometry,name,formatted_address,photos,rating,types`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK') {
      return data.result;
    }
    return null;
  } catch (e) {
    console.error("Details Error:", e);
    return null;
  }
}

export default function MapScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const mapRef = useRef(null);

  const [USER_ID, setUSER_ID] = useState('demo@user.com');
  const [region, setRegion] = useState({
    latitude: 23.6978, longitude: 120.9605, latitudeDelta: 0.05, longitudeDelta: 0.05,
  });
  const [mapRegion, setMapRegion] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  
  const [selectedCategory, setSelectedCategory] = useState('tourist_attraction');
  const [markers, setMarkers] = useState([]);
  
  // 搜尋相關
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [missionPlaceIds, setMissionPlaceIds] = useState(new Set());
  const [missionIndex, setMissionIndex] = useState({});
  const [completedMissionIds, setCompletedMissionIds] = useState(new Set());
  
  const [selectedPOI, setSelectedPOI] = useState(null);

  useEffect(() => { AsyncStorage.getItem('username').then(u => u && setUSER_ID(u)); }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

  const fetchGlobalState = async () => {
    if (!USER_ID) return;
    try {
      const snap = await getDocs(collection(db, 'missions'));
      const ids = new Set();
      const idx = {};
      snap.docs.forEach(d => {
        const data = d.data() || {};
        // 這裡可以考慮也只抓取自己的，但為了比對 missionPlaceIds 暫時全部讀取
        // 只要後端寫入正確，前端顯示就會正確
        const key = data.placeId || data.id;
        ids.add(key);
        idx[key] = d.id;
      });
      setMissionPlaceIds(ids);
      setMissionIndex(idx);
      const completedSet = await getCompletedMissionIdSet(USER_ID);
      setCompletedMissionIds(completedSet);
    } catch (e) { console.warn(e); }
  };

  useFocusEffect(
    useCallback(() => {
      fetchGlobalState();

      if (route.params?.focus && route.params?.openDetail) {
        const { focus } = route.params;
        const targetPOI = {
            id: focus.id || focus.placeId,
            name: focus.name,
            latitude: Number(focus.lat || focus.latitude),
            longitude: Number(focus.lng || focus.longitude),
            address: focus.address,
            rating: focus.rating,
            photoUrl: focus.photoUrl,
            isExternalFocus: true 
        };
        setSelectedPOI(targetPOI);
        setTimeout(() => {
            mapRef.current?.animateToRegion({
                latitude: targetPOI.latitude,
                longitude: targetPOI.longitude,
                latitudeDelta: 0.005, 
                longitudeDelta: 0.005,
            }, 800);
        }, 500); 
        navigation.setParams({ focus: null, openDetail: false });
      }
    }, [USER_ID, route.params])
  );

  const fetchPOIs = useCallback(async (centerLat, centerLon, typeKey) => {
    if (selectedPOI && selectedPOI.isExternalFocus) return;

    setLoading(true);
    try {
        const radius = 2000;
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${centerLat},${centerLon}&radius=${radius}&type=${typeKey}&language=zh-TW&key=${GOOGLE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === 'OK') {
            const results = data.results.map(p => ({
                id: p.place_id,
                name: p.name,
                rating: p.rating,
                address: p.vicinity,
                latitude: p.geometry.location.lat,
                longitude: p.geometry.location.lng,
                photoUrl: p.photos?.[0]?.photo_reference 
                    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
                    : null,
                types: p.types,
            }));
            setMarkers(results);
        } else {
            setMarkers([]);
        }
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  }, [selectedPOI]);

  useEffect(() => {
    if (mapRegion) {
        fetchPOIs(mapRegion.latitude, mapRegion.longitude, selectedCategory);
    } else if (userLocation) {
        fetchPOIs(userLocation.latitude, userLocation.longitude, selectedCategory);
    }
  }, [selectedCategory, mapRegion]); 

  const handleSearchTextChange = async (text) => {
    setSearchText(text);
    if (text.length > 1) {
      const preds = await fetchPredictions(text);
      setSuggestions(preds);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionPress = async (item) => {
    Keyboard.dismiss();
    setSearchText(item.structured_formatting.main_text);
    setShowSuggestions(false);
    setLoading(true);

    try {
      const details = await getPlaceDetails(item.place_id);
      if (details) {
        const poi = {
          id: item.place_id,
          name: details.name,
          address: details.formatted_address,
          latitude: details.geometry.location.lat,
          longitude: details.geometry.location.lng,
          rating: details.rating,
          photoUrl: details.photos?.[0]?.photo_reference 
              ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${details.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
              : null,
          types: details.types,
          isExternalFocus: true,
        };

        setSelectedPOI(poi);
        
        mapRef.current?.animateToRegion({
          latitude: poi.latitude,
          longitude: poi.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 800);

      } else {
        Alert.alert("錯誤", "無法取得地點詳細資訊");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchThisArea = () => {
      if (mapRegion) fetchPOIs(mapRegion.latitude, mapRegion.longitude, selectedCategory);
  };

  const recenterToUser = () => {
    if (!mapRef.current || !userLocation) return;
    mapRef.current.animateToRegion({
      ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02
    }, 600);
  };

  // 🔥 2. 修正：明確建立帶有 Owner 的任務
  const createMissionData = (p, docId) => ({
      id: docId,
      owner: USER_ID, // 👈 關鍵：必須寫入目前使用者 ID
      name: p.name,
      lat: p.latitude,
      lng: p.longitude,
      placeId: p.id,
      city: p.address || '',
      badgeIcon: '📍',
      createdAt: serverTimestamp(),
      isCompleted: false,
      day: null // 👈 設定為 null，代表是額外任務
  });

  const addMissionFor = async (p) => {
      setProcessing(true);
      try {
          const key = p.id; 
          if (missionPlaceIds.has(key)) {
              Alert.alert('提示', '已在任務清單中');
              return;
          }
          
          // 不再使用 MissionService，直接在此寫入以確保 Owner 正確
          const docId = `m_${Math.random().toString(36).substr(2, 9)}`;
          const ref = doc(db, 'missions', docId);
          await setDoc(ref, createMissionData(p, docId));
          
          setMissionPlaceIds(prev => new Set([...prev, key]));
          setMissionIndex(prev => ({ ...prev, [key]: docId }));
          
          Alert.alert('✅ 成功', '已加入任務清單');
      } catch (e) { 
          console.error(e);
          Alert.alert('錯誤', '加入失敗'); 
      }
      finally { setProcessing(false); }
  };

  const checkInHere = async (p) => {
      if (!userLocation) return Alert.alert('定位中...');
      const d = metersBetween(userLocation.latitude, userLocation.longitude, p.latitude, p.longitude);
      if (d > DIST_THRESHOLD) return Alert.alert('太遠了', `還差 ${Math.round(d - DIST_THRESHOLD)} 公尺`);
      
      setProcessing(true);
      try {
          const key = p.id;
          let mId = missionIndex[key];
          
          // 如果任務不存在，先建立 (同樣要確保 Owner)
          if (!mId) {
              mId = `m_${Math.random().toString(36).substr(2, 9)}`;
              const ref = doc(db, 'missions', mId);
              await setDoc(ref, createMissionData(p, mId));

              setMissionPlaceIds(prev => new Set([...prev, key]));
              setMissionIndex(prev => ({ ...prev, [key]: mId }));
          }

          if (completedMissionIds.has(mId)) return Alert.alert('提示', '已經完成過了');
          
          await awardBadgeForMission(USER_ID, { id: mId, ...p });
          setCompletedMissionIds(prev => new Set([...prev, mId]));
          Alert.alert('🎉 打卡成功！', `獲得徽章：${p.name}`);
      } catch (e) { 
          console.error(e);
          Alert.alert('錯誤', '打卡失敗'); 
      }
      finally { setProcessing(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        provider={PROVIDER_GOOGLE}
        onRegionChangeComplete={setMapRegion}
        showsUserLocation={true}
        showsCompass={false}
        showsMyLocationButton={false} 
        customMapStyle={MAP_STYLE} 
        onPress={() => Keyboard.dismiss()}
      >
        {markers.map((m, idx) => {
            const isSelected = selectedPOI?.id === m.id;
            const isMission = missionPlaceIds.has(m.id);
            const isCompleted = isMission && completedMissionIds.has(missionIndex[m.id]);

            return (
                <Marker
                    key={`${m.id}-${idx}`}
                    coordinate={{ latitude: m.latitude, longitude: m.longitude }}
                    onPress={() => setSelectedPOI(m)}
                    tracksViewChanges={false}
                >
                    <View style={[
                        styles.markerPin, 
                        isSelected && styles.markerPinSelected,
                        isCompleted && styles.markerPinCompleted
                    ]}>
                        <Ionicons 
                            name={isCompleted ? "trophy" : isSelected ? "location" : "location-outline"} 
                            size={isSelected ? 24 : 18} 
                            color={isSelected || isCompleted ? '#fff' : COLORS.primary} 
                        />
                    </View>
                    <View style={[
                        styles.markerArrow,
                        isSelected && { borderTopColor: COLORS.accent },
                        isCompleted && { borderTopColor: COLORS.warning }
                    ]} />
                </Marker>
            );
        })}

        {selectedPOI && selectedPOI.isExternalFocus && (
             <Marker
                key={`focus-${selectedPOI.id}`}
                coordinate={{ latitude: selectedPOI.latitude, longitude: selectedPOI.longitude }}
                title={selectedPOI.name}
            >
                <View style={[styles.markerPin, { backgroundColor: COLORS.danger, transform: [{ scale: 1.3 }] }]}>
                    <Ionicons name="location" size={24} color="#fff" />
                </View>
                <View style={[styles.markerArrow, { borderTopColor: COLORS.danger }]} />
            </Marker>
        )}
      </MapView>

      {/* 頂部搜尋列 */}
      <SafeAreaView style={styles.topContainer} pointerEvents="box-none">
        <View style={styles.headerRow}>
            <TouchableOpacity 
                style={styles.backBtn} 
                onPress={() => navigation.goBack()}
            >
                <Ionicons name="chevron-back" size={26} color={COLORS.text} />
            </TouchableOpacity>

            <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color={COLORS.subText} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="搜尋地點 (例如：台北101)..."
                    placeholderTextColor={COLORS.subText}
                    value={searchText}
                    onChangeText={handleSearchTextChange}
                    onFocus={() => { if(suggestions.length > 0) setShowSuggestions(true); }}
                    returnKeyType="search"
                />
                {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchText(''); setSuggestions([]); setShowSuggestions(false); }}>
                    <Ionicons name="close-circle" size={18} color={COLORS.subText} />
                  </TouchableOpacity>
                )}
            </View>
        </View>

        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.place_id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.suggestionItem} 
                  onPress={() => handleSuggestionPress(item)}
                >
                  <View style={styles.suggestionIcon}>
                     <Ionicons name="location-sharp" size={18} color={COLORS.subText} />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.suggestionMainText}>{item.structured_formatting.main_text}</Text>
                    <Text style={styles.suggestionSubText}>{item.structured_formatting.secondary_text}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {!showSuggestions && (
          <View style={styles.chipsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CATEGORIES.map(cat => (
                      <TouchableOpacity
                          key={cat.key}
                          style={[styles.chip, selectedCategory === cat.key && styles.chipActive]}
                          onPress={() => setSelectedCategory(cat.key)}
                      >
                          <Ionicons 
                              name={cat.icon} 
                              size={16} 
                              color={selectedCategory === cat.key ? '#fff' : COLORS.text} 
                              style={{ marginRight: 4 }}
                          />
                          <Text style={[styles.chipText, selectedCategory === cat.key && styles.chipTextActive]}>
                              {cat.label}
                          </Text>
                      </TouchableOpacity>
                  ))}
              </ScrollView>
          </View>
        )}
      </SafeAreaView>

      <TouchableOpacity style={styles.fabLeft} onPress={recenterToUser} activeOpacity={0.9}>
          <Ionicons name="locate" size={24} color={COLORS.text} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.fabRight} onPress={handleSearchThisArea} activeOpacity={0.9}>
          <Text style={styles.fabRightText}>搜尋此區</Text>
      </TouchableOpacity>

      {selectedPOI && (
        <View style={styles.cardContainer}>
            <View style={styles.card}>
                {selectedPOI.photoUrl && (
                    <Image source={{ uri: selectedPOI.photoUrl }} style={styles.cardImage} />
                )}
                
                <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                        <View style={{flex: 1}}>
                            <Text style={styles.cardTitle} numberOfLines={1}>{selectedPOI.name}</Text>
                            <Text style={styles.cardAddress} numberOfLines={1}>{selectedPOI.address}</Text>
                        </View>
                        {selectedPOI.rating && (
                            <View style={styles.ratingBadge}>
                                <Ionicons name="star" size={12} color="#FFF" />
                                <Text style={styles.ratingText}>{selectedPOI.rating}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.cardActions}>
                        <TouchableOpacity 
                            style={[styles.actionBtn, styles.btnSecondary]}
                            onPress={() => addMissionFor(selectedPOI)}
                            disabled={missionPlaceIds.has(selectedPOI.id)}
                        >
                            <Text style={[styles.actionText, styles.textSecondary]}>
                                {missionPlaceIds.has(selectedPOI.id) ? '已加入' : '加入任務'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.actionBtn, styles.btnPrimary]}
                            onPress={() => checkInHere(selectedPOI)}
                        >
                            <Ionicons name="navigate-circle" size={20} color="#FFF" style={{marginRight: 4}} />
                            <Text style={styles.actionText}>打卡</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity style={styles.closeCardBtn} onPress={() => setSelectedPOI(null)}>
                    <Ionicons name="close-circle" size={28} color="rgba(0,0,0,0.5)" />
                </TouchableOpacity>
            </View>
        </View>
      )}

      {loading && (
          <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { width, height },

  topContainer: { position: 'absolute', top: 0, width: '100%', zIndex: 10 },
  headerRow: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, gap: 12
  },
  backBtn: {
      width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  searchBox: {
      flex: 1,
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
      borderRadius: 12, paddingHorizontal: 12, height: 48,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: COLORS.text },

  suggestionsContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: 250,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
    overflow: 'hidden'
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
  },
  suggestionIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', marginRight: 12
  },
  suggestionMainText: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  suggestionSubText: { fontSize: 12, color: COLORS.subText },
  
  chipsContainer: { marginTop: 12, paddingBottom: 8, paddingLeft: 16 },
  chip: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  markerPin: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  markerPinSelected: { backgroundColor: COLORS.accent, transform: [{ scale: 1.2 }] },
  markerPinCompleted: { backgroundColor: COLORS.warning },
  markerArrow: {
      width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid',
      borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 0, borderTopWidth: 8,
      borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff',
      alignSelf: 'center', marginTop: -2,
  },

  fabLeft: {
      position: 'absolute', left: 16, bottom: 40, 
      width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 5,
      zIndex: 5
  },
  fabRight: {
      position: 'absolute', right: 16, bottom: 40,
      backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 5,
      zIndex: 5
  },
  fabRightText: { color: '#fff', fontWeight: 'bold' },

  cardContainer: { position: 'absolute', bottom: 30, width: '100%', paddingHorizontal: 16, zIndex: 10 },
  card: {
      backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 10,
  },
  cardImage: { width: '100%', height: 140 },
  cardContent: { padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  cardAddress: { fontSize: 13, color: COLORS.subText },
  ratingBadge: { 
      flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.warning, 
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 
  },
  ratingText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 12 },
  
  cardActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { 
      flex: 1, height: 44, borderRadius: 12, 
      alignItems: 'center', justifyContent: 'center', flexDirection: 'row' 
  },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnSecondary: { backgroundColor: '#F1F5F9' },
  actionText: { fontWeight: '700', color: '#fff', fontSize: 15 },
  textSecondary: { color: COLORS.text },

  closeCardBtn: { position: 'absolute', top: 10, right: 10, zIndex: 5 },

  loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.6)',
      alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
});

const MAP_STYLE = [
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#747474" }] },
  { "featureType": "poi.business", "stylers": [{ "visibility": "off" }] }, 
  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#ffffff" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#dadada" }] },
  { "featureType": "water", "elementType": "geometry.fill", "stylers": [{ "color": "#c6e2ff" }] }
];