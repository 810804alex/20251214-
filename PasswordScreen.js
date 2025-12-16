// screens/PasswordScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function PasswordScreen({ route, navigation }) {
  const t = useTheme();
  const mode = route?.params?.mode || 'login';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('提醒', '請輸入使用者名稱與密碼');
      return;
    }
    setBusy(true);
    try {
      const userRef = doc(db, 'users', email);
      const docSnap = await getDoc(userRef);

      if (mode === 'login') {
        if (!docSnap.exists()) {
          Alert.alert('登入失敗', '此帳號尚未註冊');
          return;
        }
        const userData = docSnap.data();
        if (userData.password === password) {
          await AsyncStorage.setItem('username', email);
          Alert.alert('登入成功', '歡迎回來！');
          // ✅ 修改：直接跳轉到 Home
          navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          });
        } else {
          Alert.alert('密碼錯誤', '請重新輸入');
        }
      } else {
        if (docSnap.exists()) {
          Alert.alert('帳號已存在', '請直接登入');
          return;
        }
        await setDoc(userRef, { email, password });
        await AsyncStorage.setItem('username', email);
        Alert.alert('註冊成功', '已自動登入');
        // ✅ 修改：直接跳轉到 Home
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      }
    } catch (error) {
      console.error('Firestore 錯誤:', error);
      Alert.alert('操作失敗', '請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Image source={require('../assets/zhuan-ti-logo.png')} style={styles.logo} />

        <Card style={{ width: '100%' }}>
          <Text style={[styles.label, { color: t.colors.muted, fontFamily: t.font.family }]}>使用者名稱</Text>
          <TextInput
            placeholder="輸入 Email 或帳號"
            placeholderTextColor={t.colors.muted}
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            style={[styles.input, { borderColor: t.colors.border, color: t.colors.text }]}
          />

          <Text style={[styles.label, { color: t.colors.muted, fontFamily: t.font.family }]}>密碼</Text>
          <TextInput
            placeholder="請輸入密碼"
            placeholderTextColor={t.colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={[styles.input, { borderColor: t.colors.border, color: t.colors.text }]}
          />

          <Button
            title={mode === 'login' ? '登入' : '註冊'}
            onPress={handleSubmit}
            loading={busy}
            style={{ marginTop: 8 }}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 30, alignItems: 'center', gap: 16 },
  logo: { width: 200, height: 200, resizeMode: 'contain', marginBottom: 0 },
  label: { fontSize: 14, marginTop: 6 },
  input: { width: '100%', padding: 14, borderWidth: 1, borderRadius: 10, marginBottom: 10, fontSize: 16 },
});