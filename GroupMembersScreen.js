// screens/GroupMembersScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons'; 

import { db } from '../firebase';
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';

// UI / Theme
import LoadingOverlay from '../components/ui/LoadingOverlay';

export default function GroupMembersScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const groupId = route?.params?.groupId;
  const groupNameParam = route?.params?.groupName || '未命名群組';

  const [me, setMe] = useState('');
  const [group, setGroup] = useState(null);
  const [newMember, setNewMember] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('username').then((u) => setMe(u || 'guest'));
  }, []);

  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(doc(db, 'groups', groupId), (docSnap) => {
      if (docSnap.exists()) {
        setGroup(docSnap.data());
      }
    });
    return () => unsub();
  }, [groupId]);

  // 新增成員
  const addMember = async () => {
    const target = newMember.trim();
    if (!target) return Alert.alert('請輸入使用者 ID');
    if (group?.members?.includes(target)) return Alert.alert('該使用者已在群組中');

    setBusy(true);
    try {
      const userRef = doc(db, 'users', target);
      const userSnap = await getDoc(userRef);
      
      // 這裡可以選擇是否要嚴格檢查使用者是否存在
      
      await updateDoc(doc(db, 'groups', groupId), {
        members: arrayUnion(target),
      });
      setNewMember('');
      Alert.alert('成功', `已邀請 ${target} 加入！`);
    } catch (e) {
      console.error(e);
      Alert.alert('失敗', '加入成員時發生錯誤');
    } finally {
      setBusy(false);
    }
  };

  // 移除成員 (僅團長)
  const removeMember = async (memberId) => {
    Alert.alert('移除成員', `確定要將 ${memberId} 移出群組嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await updateDoc(doc(db, 'groups', groupId), {
              members: arrayRemove(memberId),
            });
          } catch (e) {
            console.error(e);
            Alert.alert('錯誤', '無法移除成員');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const isCreator = group?.creator === me;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0b1d3d" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle} numberOfLines={1}>{group?.name || groupNameParam}</Text>
            <Text style={styles.headerSub}>
              {group?.members?.length || 1} 位旅伴・{group?.days || 1} 天旅程
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          
          {/* 1. 邀請區塊 (Invite Card) */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteHeader}>
              <Ionicons name="person-add-outline" size={20} color="#0b1d3d" />
              <Text style={styles.inviteTitle}>邀請新旅伴</Text>
            </View>
            <Text style={styles.inviteDesc}>
              輸入對方的使用者 ID (Email) 即可加入。
            </Text>
            
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="例如：friend@example.com"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                value={newMember}
                onChangeText={setNewMember}
              />
              <TouchableOpacity style={styles.addBtn} onPress={addMember}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* 2. 成員列表標題 */}
          <Text style={styles.sectionTitle}>成員列表</Text>

          {/* 3. 成員卡片列表 */}
          <View style={styles.membersList}>
            {/* 團長 (Creator) */}
            {group?.creator && (
              <View style={[styles.memberCard, styles.creatorCard]}>
                <View style={styles.avatarBoxCreator}>
                  <Text style={styles.avatarTextCreator}>{group.creator[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.memberName}>{group.creator}</Text>
                    {group.creator === me && <Text style={styles.meTag}> (你)</Text>}
                  </View>
                  <View style={styles.roleBadgeCreator}>
                    <Text style={styles.roleTextCreator}>👑 團長</Text>
                  </View>
                </View>
              </View>
            )}

            {/* 其他成員 */}
            {group?.members?.filter(m => m !== group.creator).map((member, index) => (
              <View key={index} style={styles.memberCard}>
                <View style={styles.avatarBox}>
                  <Text style={styles.avatarText}>{member[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.memberName}>{member}</Text>
                    {member === me && <Text style={styles.meTag}> (你)</Text>}
                  </View>
                  <Text style={styles.memberRole}>旅伴</Text>
                </View>

                {/* 只有團長可以踢人 (且不能踢自己) */}
                {isCreator && member !== me && (
                  <TouchableOpacity 
                    style={styles.removeBtn} 
                    onPress={() => removeMember(member)}
                  >
                    <Ionicons name="close-circle-outline" size={24} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {busy && <LoadingOverlay text="處理中..." />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0b1d3d' },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 2 },

  // Invite Card
  inviteCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 24,
    shadowColor: "#0b1d3d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  inviteTitle: { fontSize: 16, fontWeight: '700', color: '#0b1d3d', marginLeft: 8 },
  inviteDesc: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { 
    flex: 1, height: 48, backgroundColor: '#f8fafc', 
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, 
    paddingHorizontal: 16, fontSize: 15, color: '#334155', marginRight: 10 
  },
  addBtn: {
    width: 48, height: 48, backgroundColor: '#0b1d3d', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: "#0b1d3d", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },

  // Members
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  membersList: { gap: 12 },
  
  memberCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 12, borderRadius: 14,
    borderWidth: 1, borderColor: '#f1f5f9',
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
  },
  creatorCard: {
    borderColor: '#fcd34d', backgroundColor: '#fffbeb', // 金色邊框與背景
  },
  
  avatarBox: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#64748b' },
  
  avatarBoxCreator: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fcd34d',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarTextCreator: { fontSize: 18, fontWeight: '700', color: '#92400e' },

  memberName: { fontSize: 16, fontWeight: '600', color: '#334155' },
  meTag: { fontSize: 14, color: '#64748b' },
  
  memberRole: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  
  roleBadgeCreator: {
    backgroundColor: '#fcd34d', paddingHorizontal: 6, paddingVertical: 2, 
    borderRadius: 6, alignSelf: 'flex-start', marginTop: 4,
  },
  roleTextCreator: { fontSize: 10, fontWeight: '800', color: '#78350f' },

  removeBtn: { padding: 8 },
});