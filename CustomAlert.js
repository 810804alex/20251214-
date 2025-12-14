// components/ui/CustomAlert.js
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function CustomAlert({ visible, title, message, onConfirm, confirmText = "確定" }) {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onConfirm}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.alertContent}>
          {!!title && <Text style={styles.alertTitle}>{title}</Text>}
          {!!message && <Text style={styles.alertMessage}>{message}</Text>}
          
          <TouchableOpacity 
            style={styles.confirmBtn}
            onPress={onConfirm}
          >
            <Text style={styles.confirmBtnText}>{confirmText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)'
  },
  alertContent: {
    width: '80%', backgroundColor: '#fff', padding: 24, borderRadius: 16, alignItems: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  alertTitle: {
    fontSize: 20, fontWeight: '800', color: '#0b1d3d', marginBottom: 12,
  },
  alertMessage: {
    fontSize: 16, color: '#4b5563', textAlign: 'center', lineHeight: 24, marginBottom: 20,
  },
  confirmBtn: {
    backgroundColor: '#0b1d3d', paddingVertical: 12, width: '100%', alignItems: 'center', borderRadius: 8
  },
  confirmBtnText: {
    color: '#fff', fontWeight: '700', fontSize: 16
  },
});