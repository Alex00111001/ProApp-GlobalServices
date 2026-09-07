import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiClient } from '@/services/api';
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from '@/constants/theme';
import { Button } from '@/components/ui';
import { useTranslation } from 'react-i18next';

type Decision = { id: string; purpose: string; decision: 'GRANTED' | 'DENIED' | 'WITHDRAWN'; policyVersion: number; source: string; occurredAt: string };

export default function PrivacyConsentScreen() {
  const router = useRouter(); const { t } = useTranslation(); const [items, setItems] = useState<Decision[]>([]); const [loading, setLoading] = useState(true); const [withdrawing, setWithdrawing] = useState(false);
  const load = async () => { setLoading(true); try { const data = await apiClient.getConsentHistory(); setItems(data.items || []); } catch (error) { Alert.alert(t('privacyConsent.privacy'), error instanceof Error ? error.message : t('privacyConsent.loadError')); } finally { setLoading(false); } };
  useEffect(() => { void load() }, []);
  const current = items[0];
  const withdraw = () => Alert.alert(t('privacyConsent.withdrawTitle'), t('privacyConsent.withdrawExplanation'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('privacyConsent.withdraw'), style: 'destructive', onPress: async () => { setWithdrawing(true); try { await apiClient.withdrawConsent('marketing_attribution'); await load(); } catch (error) { Alert.alert(t('privacyConsent.privacy'), error instanceof Error ? error.message : t('privacyConsent.withdrawError')); } finally { setWithdrawing(false); } } },
  ]);
  return <SafeAreaView style={styles.safe}><View style={styles.header}><TouchableOpacity onPress={() => router.back()} accessibilityLabel={t('common.goBack')}><Ionicons name="arrow-back" size={25} color={COLORS.textPrimary} /></TouchableOpacity><Text style={styles.title}>{t('privacyConsent.title')}</Text><View style={{ width: 25 }} /></View><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.notice}><Text style={styles.noticeTitle}>{t('privacyConsent.optionalTitle')}</Text><Text style={styles.body}>{t('privacyConsent.optionalBody')}</Text></View>
    <Text style={styles.section}>{t('privacyConsent.current')}</Text><View style={styles.card}>{loading ? <Text style={styles.body}>{t('common.loading')}</Text> : current ? <><Text style={styles.state}>{t(`privacyConsent.decisions.${current.decision}`)}</Text><Text style={styles.body}>{t('privacyConsent.purpose')}: {current.purpose}</Text><Text style={styles.body}>{t('privacyConsent.policyVersion', { version: current.policyVersion })} · {new Date(current.occurredAt).toLocaleString()}</Text></> : <Text style={styles.body}>{t('privacyConsent.empty')}</Text>}</View>
    {current?.decision === 'GRANTED' && <Button title={t('privacyConsent.withdrawMarketing')} variant="outline" onPress={withdraw} loading={withdrawing} fullWidth />}
    <Text style={styles.section}>{t('privacyConsent.history')}</Text>{items.map((item) => <View key={item.id} style={styles.history}><Text style={styles.state}>{t(`privacyConsent.decisions.${item.decision}`)}</Text><Text style={styles.body}>{t('privacyConsent.policyVersion', { version: item.policyVersion })} · {item.source}</Text><Text style={styles.body}>{new Date(item.occurredAt).toLocaleString()}</Text></View>)}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:COLORS.background},header:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:SPACING.lg},title:{fontSize:FONTS.sizes.lg,fontWeight:'700',color:COLORS.textPrimary},content:{padding:SPACING.lg,paddingBottom:SPACING.xxl,gap:SPACING.md},notice:{padding:SPACING.lg,borderRadius:BORDER_RADIUS.lg,backgroundColor:COLORS.primaryLight},noticeTitle:{fontWeight:'700',color:COLORS.textPrimary,marginBottom:SPACING.xs},body:{fontSize:FONTS.sizes.sm,color:COLORS.textSecondary,lineHeight:20},section:{fontSize:FONTS.sizes.sm,fontWeight:'700',color:COLORS.textSecondary,textTransform:'uppercase',marginTop:SPACING.md},card:{padding:SPACING.lg,borderRadius:BORDER_RADIUS.lg,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.border},history:{padding:SPACING.md,borderRadius:BORDER_RADIUS.md,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.border},state:{fontWeight:'800',color:COLORS.primary,marginBottom:4} });
