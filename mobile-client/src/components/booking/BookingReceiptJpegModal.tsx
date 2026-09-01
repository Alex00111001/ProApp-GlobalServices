import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import ViewShot, { captureRef, type ViewShotRef } from 'react-native-view-shot';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { COLORS, SPACING } from '@/constants/theme';
import { buildBookingReceiptHtml } from '@/utils/bookingPdf';

interface Props {
  booking: any;
  language: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  visible: boolean;
  onClose: () => void;
}

export const BookingReceiptJpegModal: React.FC<Props> = ({ booking, language, t, visible, onClose }) => {
  const receiptRef = useRef<ViewShotRef>(null);
  const [html, setHtml] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setHtml('');
    setIsReady(false);
    buildBookingReceiptHtml(booking, t, language).then(setHtml).catch(() => {
      Alert.alert(t('common.error'), t('booking.shareError'));
      onClose();
    });
  }, [visible, booking, language, t, onClose]);

  const shareJpeg = async () => {
    if (!receiptRef.current || !isReady) return;
    setIsSharing(true);
    try {
      const temporaryUri = await captureRef(receiptRef, {
        format: 'jpg', quality: 0.96, result: 'tmpfile', width: 1240, height: 1754,
      });
      const shortReference = String(booking.id).split('-')[0] || 'reserva';
      const sourceFile = new File(temporaryUri);
      const shareFile = new File(Paths.cache, `comprobante-reserva-${shortReference}.jpg`);
      if (shareFile.exists) shareFile.delete();
      await sourceFile.move(shareFile, { overwrite: true });
      await Sharing.shareAsync(shareFile.uri, {
        mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: t('booking.shareJpeg'),
      });
    } catch {
      Alert.alert(t('common.error'), t('booking.shareError'));
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button">
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('booking.jpegPreview')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.preview}>
          {!html && <ActivityIndicator size="large" color={COLORS.primary} />}
          {!!html && (
            <ViewShot ref={receiptRef} style={styles.receipt} options={{ format: 'jpg', quality: 0.96 }}>
              <WebView
                source={{ html }}
                style={styles.webView}
                scrollEnabled={false}
                onLoadEnd={() => setTimeout(() => setIsReady(true), 500)}
              />
            </ViewShot>
          )}
        </View>
        <TouchableOpacity
          style={[styles.shareButton, (!isReady || isSharing) && styles.disabled]}
          onPress={shareJpeg}
          disabled={!isReady || isSharing}
        >
          {isSharing ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="image-outline" size={21} color={COLORS.white} />}
          <Text style={styles.shareText}>{t('booking.shareJpeg')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 62, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  headerSpacer: { width: 28 },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.md, overflow: 'hidden' },
  receipt: { width: 397, height: 561.5, backgroundColor: COLORS.white, transform: [{ scale: 0.9 }] },
  webView: { width: 794, height: 1123, transform: [{ scale: 0.5 }], transformOrigin: 'top left' as any, backgroundColor: COLORS.white },
  shareButton: { margin: SPACING.lg, minHeight: 54, borderRadius: 14, backgroundColor: COLORS.primary, flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.55 },
  shareText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
