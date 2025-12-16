// screens/LoginScreen.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useTheme } from '../theme';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function LoginScreen({ navigation }) {
  const t = useTheme();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Image source={require('../assets/zhuan-ti-logo.png')} style={styles.logo} />

        <Text style={[styles.title, { color: t.colors.text, fontFamily: t.font.family }]}>
          歡迎使用旅遊 App
        </Text>
        <Text style={[styles.sub, { color: t.colors.muted, fontFamily: t.font.family }]}>
          請選擇要登入或註冊
        </Text>

        <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
          <Button
            title="登入"
            onPress={() => navigation.navigate('SecondPage', { mode: 'login' })}
          />
          <Button
            title="註冊"
            variant="outline"
            onPress={() => navigation.navigate('SecondPage', { mode: 'register' })}
          />
        </View>

        <Text style={[styles.or, { color: t.colors.muted, fontFamily: t.font.family }]}>或使用社群帳號</Text>

        <Text style={[styles.terms, { color: t.colors.muted, fontFamily: t.font.family }]}>
          點擊表示你同意我們的 <Text style={{ textDecorationLine: 'underline', color: t.colors.text }}>服務條款</Text> 和 <Text style={{ textDecorationLine: 'underline', color: t.colors.text }}>隱私政策</Text>。
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 30, alignItems: 'center' },
  logo: { width: 200, height: 200, resizeMode: 'contain', marginBottom: 10 },
  title: { fontSize: 20, marginBottom: 6, lineHeight: 26 },
  sub: { fontSize: 14, marginBottom: 18, lineHeight: 20 },
  or: { marginTop: 20, marginBottom: 12, fontSize: 14 },
  terms: { fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
