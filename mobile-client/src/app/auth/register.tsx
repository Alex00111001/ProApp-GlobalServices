import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Href, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { LEGAL_DOCUMENT_VERSION } from '@/constants/legal';

type CountryCode = 'ES' | 'BR' | 'CL';
const COUNTRIES: Array<{ code: CountryCode; flag: string; dialCode: string }> = [
  { code: 'ES', flag: '🇪🇸', dialCode: '+34' }, { code: 'BR', flag: '🇧🇷', dialCode: '+55' }, { code: 'CL', flag: '🇨🇱', dialCode: '+56' },
];

export default function RegisterScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { register, isLoading } = useAuthStore();
  const [countryCode, setCountryCode] = useState<CountryCode>('ES');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const selectedCountry = useMemo(() => COUNTRIES.find((country) => country.code === countryCode)!, [countryCode]);

  const handleRegister = async () => {
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = formData.email.trim().toLowerCase();
    const phone = formData.phone.replace(/[\s()-]/g, '');
    if (!firstName || !lastName || !email || !phone || !formData.password || !formData.confirmPassword) return Alert.alert(t('common.error'), t('auth.required'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Alert.alert(t('common.error'), t('auth.invalidEmail'));
    if (!phone.startsWith(selectedCountry.dialCode) || !/^\+[1-9]\d{7,14}$/.test(phone)) return Alert.alert(t('common.error'), t('auth.invalidPhone', { dialCode: selectedCountry.dialCode }));
    if (formData.password.length < 8) return Alert.alert(t('common.error'), t('auth.passwordLength'));
    if (formData.password !== formData.confirmPassword) return Alert.alert(t('common.error'), t('auth.passwordsMismatch'));
    if (!acceptTerms || !acceptPrivacy) return Alert.alert(t('common.error'), t('auth.legalRequired'));
    try {
      await register({ firstName, lastName, email, phone, password: formData.password, role: 'CLIENT', countryCode,
        locale: (['es', 'en', 'pt'].includes(i18n.language) ? i18n.language : 'es') as 'es' | 'en' | 'pt',
        acceptTerms: true, acceptPrivacy: true, marketingConsent, termsVersion: LEGAL_DOCUMENT_VERSION, privacyVersion: LEGAL_DOCUMENT_VERSION });
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(t('auth.registrationFailed'), error instanceof Error ? error.message : t('common.error'));
    }
  };

  const Checkbox = ({ checked, onPress, children }: { checked: boolean; onPress: () => void; children: React.ReactNode }) => (
    <TouchableOpacity style={styles.checkboxRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Ionicons name="checkmark" size={16} color={COLORS.white} />}</View>
      <View style={styles.checkboxLabel}>{children}</View>
    </TouchableOpacity>
  );

  return <SafeAreaView style={styles.container} edges={['top', 'bottom']}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel={t('common.goBack')}><Ionicons name="arrow-back" size={24} color={COLORS.primary} /></TouchableOpacity>
      <Text style={styles.title}>{t('auth.createAccount')}</Text><Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>
      <Text style={styles.sectionLabel}>{t('auth.country')}</Text>
      <View style={styles.countryRow}>{COUNTRIES.map((country) => <TouchableOpacity key={country.code} onPress={() => setCountryCode(country.code)} style={[styles.countryButton, countryCode === country.code && styles.countryButtonSelected]}><Text style={styles.countryText}>{country.flag} {t(`auth.countries.${country.code}`)}</Text></TouchableOpacity>)}</View>
      <View style={styles.nameRow}>
        <Input style={styles.halfInput} label={t('auth.firstName')} placeholder={t('auth.firstNamePlaceholder')} value={formData.firstName} onChangeText={(firstName) => setFormData((v) => ({ ...v, firstName }))} autoCapitalize="words" textContentType="givenName" />
        <Input style={styles.halfInput} label={t('auth.lastName')} placeholder={t('auth.lastNamePlaceholder')} value={formData.lastName} onChangeText={(lastName) => setFormData((v) => ({ ...v, lastName }))} autoCapitalize="words" textContentType="familyName" />
      </View>
      <Input label={t('auth.email')} placeholder={t('auth.emailPlaceholder')} value={formData.email} onChangeText={(email) => setFormData((v) => ({ ...v, email }))} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
      <Input label={t('auth.phone')} placeholder={`${selectedCountry.dialCode} …`} value={formData.phone} onChangeText={(phone) => setFormData((v) => ({ ...v, phone }))} keyboardType="phone-pad" textContentType="telephoneNumber" />
      <Input label={t('auth.password')} placeholder="••••••••" value={formData.password} onChangeText={(password) => setFormData((v) => ({ ...v, password }))} secureTextEntry textContentType="newPassword" />
      <Text style={styles.passwordHelp}>{t('auth.passwordHelp')}</Text>
      <Input label={t('auth.confirmPassword')} placeholder="••••••••" value={formData.confirmPassword} onChangeText={(confirmPassword) => setFormData((v) => ({ ...v, confirmPassword }))} secureTextEntry textContentType="newPassword" />
      <View style={styles.privacyNotice}><Text style={styles.privacyTitle}>{t('auth.privacySummaryTitle')}</Text><Text style={styles.privacyText}>{t(`auth.privacySummary.${countryCode}`)}</Text></View>
      <Checkbox checked={acceptTerms} onPress={() => setAcceptTerms((v) => !v)}><Text style={styles.legalText}>{t('auth.acceptTermsPrefix')} <Text style={styles.legalLink} onPress={() => router.push('/legal/terms' as Href)}>{t('auth.terms')}</Text>.</Text></Checkbox>
      <Checkbox checked={acceptPrivacy} onPress={() => setAcceptPrivacy((v) => !v)}><Text style={styles.legalText}>{t('auth.acceptPrivacyPrefix')} <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy' as Href)}>{t('auth.privacy')}</Text>.</Text></Checkbox>
      <Checkbox checked={marketingConsent} onPress={() => setMarketingConsent((v) => !v)}><Text style={styles.legalText}>{t('auth.marketingOptional')}</Text></Checkbox>
      <Button title={t('auth.register')} onPress={handleRegister} loading={isLoading} disabled={isLoading || !acceptTerms || !acceptPrivacy} fullWidth size="large" />
      <TouchableOpacity onPress={() => router.replace('/auth/login')} style={styles.loginLinkContainer}><Text style={styles.loginText}>{t('auth.hasAccount')} <Text style={styles.legalLink}>{t('auth.signIn')}</Text></Text></TouchableOpacity>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.background},keyboardView:{flex:1},scrollContent:{flexGrow:1,padding:SPACING.lg,paddingBottom:SPACING.xxl},
  backButton:{width:40,height:40,borderRadius:20,backgroundColor:COLORS.primaryLight,justifyContent:'center',alignItems:'center',marginBottom:SPACING.md},
  title:{fontSize:28,fontWeight:'700',color:COLORS.textPrimary,fontFamily:FONTS.bold},subtitle:{fontSize:16,color:COLORS.textSecondary,marginTop:SPACING.xs,marginBottom:SPACING.lg},
  sectionLabel:{fontSize:FONTS.sizes.sm,fontWeight:'600',color:COLORS.textPrimary,marginBottom:SPACING.sm},countryRow:{flexDirection:'row',gap:SPACING.sm,marginBottom:SPACING.lg},
  countryButton:{flex:1,minHeight:48,paddingHorizontal:SPACING.xs,borderWidth:1,borderColor:COLORS.border,borderRadius:BORDER_RADIUS.md,justifyContent:'center',alignItems:'center',backgroundColor:COLORS.surface},countryButtonSelected:{borderColor:COLORS.primary,backgroundColor:COLORS.primaryLight},countryText:{color:COLORS.textPrimary,fontSize:FONTS.sizes.sm,textAlign:'center'},
  nameRow:{flexDirection:'row',gap:SPACING.md},halfInput:{flex:1,minWidth:0},passwordHelp:{color:COLORS.textSecondary,fontSize:FONTS.sizes.xs,marginTop:-SPACING.md,marginBottom:SPACING.lg},
  privacyNotice:{backgroundColor:COLORS.primaryLight,borderRadius:BORDER_RADIUS.md,padding:SPACING.md,marginBottom:SPACING.lg},privacyTitle:{color:COLORS.textPrimary,fontWeight:'700',marginBottom:SPACING.xs},privacyText:{color:COLORS.textSecondary,fontSize:FONTS.sizes.sm,lineHeight:20},
  checkboxRow:{flexDirection:'row',alignItems:'flex-start',marginBottom:SPACING.md,minHeight:28},checkbox:{width:22,height:22,borderRadius:6,borderWidth:1.5,borderColor:COLORS.gray400,alignItems:'center',justifyContent:'center',marginTop:1},checkboxChecked:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},checkboxLabel:{flex:1,marginLeft:SPACING.sm},legalText:{color:COLORS.textSecondary,fontSize:FONTS.sizes.sm,lineHeight:20},legalLink:{color:COLORS.primary,fontWeight:'700',textDecorationLine:'underline'},loginLinkContainer:{paddingVertical:SPACING.lg,alignItems:'center'},loginText:{color:COLORS.textSecondary,fontSize:FONTS.sizes.sm},
});
