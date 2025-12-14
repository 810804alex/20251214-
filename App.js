// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import AppLoading from 'expo-app-loading';

// 畫面元件
import LoginScreen from './screens/LoginScreen';
import PasswordScreen from './screens/PasswordScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import HomeScreen from './screens/HomeScreen';
import FavoritesScreen from './screens/FavoritesScreen';
import NotificationScreen from './screens/NotificationScreen';
import ProfileScreen from './screens/ProfileScreen';
import MapScreen from './screens/MapScreen';
import PlaceDetailScreen from './screens/PlaceDetailScreen';
import MissionsScreen from './screens/MissionsScreen';   // ✅ 已有
import GroupCreateScreen from './screens/GroupCreateScreen';
import GroupPreferenceScreen from './screens/GroupPreferenceScreen';
import GroupListScreen from './screens/GroupListScreen';
import GroupStatsScreen from './screens/GroupStatsScreen';
import ItineraryScreen from './screens/ItineraryScreen';
import HistoryScreen from './screens/HistoryScreen';
import GroupMembersScreen from './screens/GroupMembersScreen';
// ✅ 新增：手動排程頁
import ManualPlanScreen from './screens/ManualPlanScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    GenRyuMin: require('./assets/fonts/GenRyuMin.otf'),
  });

  if (!fontsLoaded) {
    return <AppLoading />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SecondPage" component={PasswordScreen} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen name="Notifications" component={NotificationScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
        <Stack.Screen name="Missions" component={MissionsScreen} /> 
        <Stack.Screen name="GroupCreate" component={GroupCreateScreen} />
        <Stack.Screen name="GroupPreference" component={GroupPreferenceScreen} />
        <Stack.Screen name="GroupList" component={GroupListScreen} />
        <Stack.Screen name="GroupStats" component={GroupStatsScreen} />
        <Stack.Screen name="Itinerary" component={ItineraryScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="GroupMembers" component={GroupMembersScreen} />
        {/* ✅ 新增手動安排行程頁 */}
        <Stack.Screen name="ManualPlan" component={ManualPlanScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
