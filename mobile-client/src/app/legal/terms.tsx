import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING } from '@/constants/theme';

export default function TermsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const sections = ['service', 'accounts', 'bookings', 'payments', 'conduct', 'cancellation', 'liability', 'law', 'contact'];
  return <SafeAreaView style={styles.container}><ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={24} color={COLORS.primary} /><Text style={styles.backText}>{t('common.goBack')}</Text></TouchableOpacity>
    <Text style={styles.title}>{t('legal.termsTitle')}</Text><Text style={styles.version}>{t('legal.version')}</Text>
    {sections.map((section) => <View key={section} style={styles.section}><Text style={styles.heading}>{t(`legal.terms.${section}Title`)}</Text><Text style={styles.body}>{t(`legal.terms.${section}Body`)}</Text></View>)}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({container:{flex:1,backgroundColor:COLORS.background},content:{padding:SPACING.lg,paddingBottom:SPACING.xxl},back:{flexDirection:'row',alignItems:'center',gap:SPACING.sm,marginBottom:SPACING.lg},backText:{color:COLORS.primary,fontWeight:'600'},title:{fontSize:FONTS.sizes.xxxl,fontWeight:'700',color:COLORS.textPrimary},version:{color:COLORS.textSecondary,marginTop:SPACING.xs,marginBottom:SPACING.xl},section:{marginBottom:SPACING.lg},heading:{fontSize:FONTS.sizes.lg,fontWeight:'700',color:COLORS.textPrimary,marginBottom:SPACING.xs},body:{fontSize:FONTS.sizes.md,lineHeight:24,color:COLORS.textSecondary}});
