import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, LAYOUT, SHADOWS } from '@/constants/theme';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '@/i18n';

type MenuItemProps = { icon: keyof typeof Ionicons.glyphMap; title: string; value?: string; onPress: () => void };
const MenuItem = ({ icon, title, value, onPress }: MenuItemProps) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title}>
    <View style={styles.menuItemLeft}><View style={styles.menuIcon}><Ionicons name={icon} size={21} color={COLORS.primary} /></View><View style={styles.menuText}><Text style={styles.menuItemTitle}>{title}</Text>{value ? <Text style={styles.menuValue} numberOfLines={2}>{value}</Text> : null}</View></View>
    <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
  </TouchableOpacity>
);

export default function ProfileTab() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, profile, loadUser, logout, isLoading } = useAuthStore();
  useFocusEffect(useCallback(() => { loadUser(); }, [loadUser]));
  const currentUser = user as any;
  const currentProfile = profile as any;
  const name = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
  const avatarUrl = currentUser?.avatarUrl || currentUser?.avatar;
  const languageName = t(`profile.${i18n.language === 'en' ? 'english' : i18n.language === 'pt' ? 'portuguese' : 'spanish'}`);
  const chooseLanguage = () => Alert.alert(t('profile.language'), t('profile.languageQuestion'), [
    { text:t('profile.spanish'), onPress:()=>setAppLanguage('es') }, { text:t('profile.english'), onPress:()=>setAppLanguage('en') }, { text:t('profile.portuguese'), onPress:()=>setAppLanguage('pt') }, { text:t('common.cancel'), style:'cancel' }
  ]);
  const handleLogout = () => Alert.alert(t('profile.logout'), t('profile.logoutQuestion'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('profile.logout'), style: 'destructive', onPress: async () => { await logout(); router.replace('/auth/login'); } },
  ]);

  return <SafeAreaView style={styles.container} edges={['top']}><ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.header}>
      <View style={styles.headerGlow} />
      <View style={styles.profileEyebrow}><Ionicons name="shield-checkmark" size={15} color={COLORS.successSoft} /><Text style={styles.profileEyebrowText}>{t('home.trustVerified')}</Text></View>
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Ionicons name="person" size={42} color={COLORS.white} /></View>}
      <Text style={styles.userName}>{name || t('profile.title')}</Text><Text style={styles.userEmail}>{currentUser?.email}</Text>
      <TouchableOpacity style={styles.editButton} onPress={() => router.push('/profile/edit' as any)} accessibilityRole="button"><Ionicons name="pencil" size={17} color={COLORS.primary} /><Text style={styles.editText}>{t('profile.edit')}</Text></TouchableOpacity>
    </View>
    <View style={styles.section}><Text style={styles.sectionTitle}>{t('profile.personalInfo')}</Text><View style={styles.card}>
      <MenuItem icon="call-outline" title={t('profile.phone')} value={currentUser?.phone || t('profile.missing')} onPress={() => router.push('/profile/edit' as any)} />
      <MenuItem icon="location-outline" title={t('profile.address')} value={currentProfile?.address || t('profile.missing')} onPress={() => router.push('/profile/edit' as any)} />
    </View></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>{t('profile.account')}</Text><View style={styles.card}>
      <MenuItem icon="language-outline" title={t('profile.language')} value={languageName} onPress={chooseLanguage} />
      <MenuItem icon="lock-closed-outline" title={t('profile.changePassword')} onPress={() => router.push('/profile/security' as any)} />
      <MenuItem icon="shield-checkmark-outline" title={t('privacyConsent.title')} value={t('privacyConsent.menuHint')} onPress={() => router.push('/profile/privacy-consent' as any)} />
      <MenuItem icon="gift-outline" title={t('referrals.title')} value={t('referrals.menuHint')} onPress={() => router.push('/profile/referrals' as any)} />
      <MenuItem icon="notifications-outline" title={t('profile.notifications')} onPress={() => router.push('/notifications')} />
      <MenuItem icon="calendar-outline" title={t('profile.myBookings')} onPress={() => router.push('/(tabs)/bookings')} />
    </View></View>
    <View style={styles.logout}><Button title={t('profile.logout')} variant="outline" loading={isLoading} onPress={handleLogout} fullWidth /><Text style={styles.version}>{t('profile.version',{version:'1.0.0'})}</Text></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.background},scrollContent:{width:'100%',maxWidth:LAYOUT.contentMaxWidth,alignSelf:'center',paddingBottom:100},header:{overflow:'hidden',alignItems:'center',margin:LAYOUT.screenPadding,padding:SPACING.xl,borderRadius:BORDER_RADIUS.xxl,backgroundColor:COLORS.ink,...SHADOWS.md},headerGlow:{position:'absolute',width:180,height:180,borderRadius:90,right:-65,top:-90,backgroundColor:'rgba(92,133,234,0.22)'},profileEyebrow:{flexDirection:'row',alignItems:'center',gap:SPACING.xs,alignSelf:'flex-start'},profileEyebrowText:{color:'#DDE9EE',fontSize:FONTS.sizes.xs,fontWeight:'700'},avatar:{width:88,height:88,borderRadius:44,marginTop:SPACING.lg,borderWidth:3,borderColor:'rgba(255,255,255,0.3)'},avatarPlaceholder:{width:88,height:88,borderRadius:44,marginTop:SPACING.lg,backgroundColor:COLORS.primary,alignItems:'center',justifyContent:'center',borderWidth:3,borderColor:'rgba(255,255,255,0.3)'},userName:{fontSize:FONTS.sizes.xxl,fontWeight:'700',color:COLORS.white,marginTop:SPACING.md,textAlign:'center'},userEmail:{color:'#CFE0E8',marginTop:SPACING.xs,textAlign:'center',flexShrink:1},editButton:{minHeight:LAYOUT.touchTarget,flexDirection:'row',alignItems:'center',gap:SPACING.xs,marginTop:SPACING.lg,paddingHorizontal:SPACING.lg,backgroundColor:COLORS.white,borderRadius:BORDER_RADIUS.full},editText:{color:COLORS.primary,fontWeight:'700'},section:{paddingHorizontal:LAYOUT.screenPadding,marginBottom:SPACING.xl},sectionTitle:{fontSize:FONTS.sizes.xs,fontWeight:'700',letterSpacing:.7,color:COLORS.accent,textTransform:'uppercase',marginBottom:SPACING.sm},card:{backgroundColor:COLORS.surface,borderRadius:BORDER_RADIUS.xl,overflow:'hidden',borderWidth:1,borderColor:COLORS.border,...SHADOWS.sm},menuItem:{minHeight:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:SPACING.md,borderBottomWidth:1,borderBottomColor:COLORS.border},menuItemLeft:{flexDirection:'row',alignItems:'center',gap:SPACING.md,flex:1,minWidth:0},menuIcon:{width:40,height:40,borderRadius:13,backgroundColor:COLORS.primarySoft,alignItems:'center',justifyContent:'center'},menuText:{flex:1,minWidth:0},menuItemTitle:{fontSize:FONTS.sizes.md,fontWeight:'600',color:COLORS.textPrimary,flexShrink:1},menuValue:{fontSize:FONTS.sizes.sm,color:COLORS.textSecondary,marginTop:2,flexShrink:1},logout:{paddingHorizontal:LAYOUT.screenPadding,marginTop:SPACING.sm},version:{textAlign:'center',color:COLORS.textTertiary,fontSize:FONTS.sizes.xs,marginTop:SPACING.md}
});
