import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, getApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

type Decision = { id:string; purpose:string; decision:'GRANTED'|'DENIED'|'WITHDRAWN'; policyVersion:number; source:string; occurredAt:string };
type Policy = { id:string; key:string; purpose:string; version:number; documentReference:string };

export default function PrivacyConsentScreen() {
  const { user } = useAuthStore(); const [history, setHistory] = useState<Decision[]>([]); const [policies, setPolicies] = useState<Policy[]>([]); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const [policyData, historyData] = await Promise.all([api.consentPolicies(user?.countryCode || 'ES', user?.registrationLocale || 'es'), api.consentHistory()]); setPolicies(policyData.policies); setHistory(historyData.items || []); } catch (error) { Alert.alert('Privacidad', getApiError(error)); } finally { setLoading(false); } };
  useEffect(() => { void load() }, []);
  const current = history[0]; const withdraw = () => Alert.alert('Retirar consentimiento', 'Detendremos inmediatamente nuevos procesos de marketing y atribución. Esto no afecta trabajos, cobros ni funciones contractuales.', [{ text:'Cancelar', style:'cancel' }, { text:'Retirar', style:'destructive', onPress:async()=>{ try { await api.withdrawConsent(); await load(); } catch(error){ Alert.alert('Privacidad',getApiError(error)); } } }]);
  return <SafeAreaView style={styles.safe}><View style={styles.header}><Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={25} color={COLORS.text} /></Pressable><Text style={styles.title}>Consentimiento y privacidad</Text><View style={{width:25}} /></View><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.notice}><Ionicons name="information-circle-outline" size={22} color={COLORS.primary} /><Text style={styles.noticeText}>Marketing es opcional. Rechazarlo o retirarlo no limita trabajos, pagos, soporte ni el acceso a tu cuenta.</Text></View>
    <Text style={styles.section}>Política vigente</Text>{loading ? <Text style={styles.muted}>Cargando…</Text> : policies.length ? policies.map((policy)=><Pressable key={policy.id} style={styles.card} onPress={() => void Linking.openURL(policy.documentReference)}><Text style={styles.strong}>{policy.key} · v{policy.version}</Text><Text style={styles.muted}>{policy.purpose}</Text><Text style={styles.link}>Abrir documento</Text></Pressable>) : <View style={styles.card}><Text style={styles.muted}>No existe una política activa para tu país e idioma. No se procesará marketing.</Text></View>}
    <Text style={styles.section}>Estado e historial</Text>{current?.decision === 'GRANTED' && <Pressable style={styles.withdraw} onPress={withdraw}><Text style={styles.withdrawText}>Retirar consentimiento de marketing</Text></Pressable>}{history.length ? history.map((item)=><View key={item.id} style={styles.card}><Text style={styles.strong}>{item.decision}</Text><Text style={styles.muted}>{item.purpose} · política v{item.policyVersion}</Text><Text style={styles.muted}>{new Date(item.occurredAt).toLocaleString()} · {item.source}</Text></View>) : !loading && <View style={styles.card}><Text style={styles.muted}>No hay decisiones registradas.</Text></View>}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:COLORS.background},header:{height:58,paddingHorizontal:SPACING.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{fontSize:18,fontWeight:'800',color:COLORS.text},content:{padding:SPACING.lg,paddingBottom:SPACING.xxl,gap:SPACING.md},notice:{padding:SPACING.lg,borderRadius:RADIUS.lg,backgroundColor:COLORS.primarySoft,flexDirection:'row',gap:SPACING.sm},noticeText:{flex:1,color:COLORS.text,fontSize:13,lineHeight:19},section:{color:COLORS.muted,fontSize:13,fontWeight:'800',textTransform:'uppercase',marginTop:SPACING.md},card:{padding:SPACING.lg,borderRadius:RADIUS.lg,borderWidth:1,borderColor:COLORS.border,backgroundColor:COLORS.surface},strong:{color:COLORS.text,fontWeight:'800',marginBottom:4},muted:{color:COLORS.muted,fontSize:13,lineHeight:19},link:{color:COLORS.primary,fontWeight:'700',marginTop:SPACING.sm},withdraw:{minHeight:52,borderRadius:RADIUS.md,borderWidth:1,borderColor:COLORS.danger,alignItems:'center',justifyContent:'center'},withdrawText:{color:COLORS.danger,fontWeight:'800'}});
