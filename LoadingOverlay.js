// components/ui/LoadingOverlay.js
import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

/**
 * 結合原本邏輯與新設計的 Loading 元件
 * props:
 * - visible: 是否顯示 (boolean)
 * - text: 顯示文字 (string)，預設 '處理中...'
 */
export default function LoadingOverlay({ visible, text = '處理中...' }) {
  const t = useTheme();

  // 如果 visible 為 false，就不渲染任何東西
  if (!visible) return null;

  return (
    <View style={styles.loadingOverlay}>
      <View style={styles.loadingContent}>
        
        {/* 1. 大尺寸 Loading 動畫 (使用你的主題色 primary) */}
        <ActivityIndicator 
          size="large" 
          color={t.colors.primary || '#0b1d3d'} 
          style={{ transform: [{ scale: 1.5 }] }} 
        />

        {/* 2. 固定高度的文字容器 (防止文字跳動) */}
        <View style={styles.textContainer}>
          <Text 
            style={[
              styles.loadingText, 
              { 
                color: t.colors.primary || '#0b1d3d', // 使用主題色
                fontFamily: t.font.family // 使用原本的主題字體
              }
            ]}
          >
            {text}
          </Text>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 全螢幕半透明白色遮罩 (明樺風格)
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)', 
    justifyContent: 'center', alignItems: 'center', zIndex: 9999,
  },
  // 中間的白色卡片區塊
  loadingContent: {
    alignItems: 'center', 
    padding: 30, 
    borderRadius: 20, 
    backgroundColor: 'white',
    width: 280, // 固定寬度
    // 陰影效果
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 10, 
    elevation: 8,
  },
  // 文字容器 (固定高度)
  textContainer: {
    marginTop: 20, 
    height: 30, 
    justifyContent: 'center', 
    width: '100%', 
    alignItems: 'center'
  },
  // 文字樣式
  loadingText: {
    fontSize: 18, 
    fontWeight: '700', 
    textAlign: 'center',
  },
});