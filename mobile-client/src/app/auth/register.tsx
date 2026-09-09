import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Href, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { LEGAL_DOCUMENT_VERSION } from '@/constants/legal';
import { apiClient, type DivisionOption, type MarketSummary, type RegistrationSchema } from '@/services/api';
import { orderedDivisionIds, registrationSections } from '@/features/registration/schema-renderer';

export default function RegisterScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { register, isLoading } = useAuthStore();
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [marketCode, setMarketCode] = useState<MarketSummary['code'] | null>(null);
  const [schema, setSchema] = useState<RegistrationSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [identityType, setIdentityType] = useState('');
  const [identityValue, setIdentityValue] = useState('');
  const [address, setAddress] = useState<Record<string, string>>({});
  const [divisionOptions, setDivisionOptions] = useState<Record<number, DivisionOption[]>>({});
  const [selectedDivisions, setSelectedDivisions] = useState<Record<number, DivisionOption>>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [marketingPolicy, setMarketingPolicy] = useState<{ id: string; key: string; version: number; documentReference: string; effectiveAt: string } | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const selectedMarket = useMemo(() => markets.find((market) => market.code === marketCode) || null, [markets, marketCode]);
  const renderedSections = useMemo(() => schema ? registrationSections(schema) : [], [schema]);
  const locale = (['es', 'en', 'pt'].includes(i18n.language) ? i18n.language : 'es') as 'es' | 'en' | 'pt';

  useEffect(() => {
    let active = true;
    apiClient.getMarkets().then(({ items }) => {
      if (!active) return;
      setMarkets(items);
      setMarketCode(items[0]?.code || null);
    }).catch(() => { if (active) setMarkets([]); }).finally(() => { if (active) setSchemaLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedMarket) { setSchema(null); return; }
    let active = true;
    setSchemaLoading(true); setSchema(null); setSelectedDivisions({}); setDivisionOptions({}); setIdentityValue('');
    apiClient.getRegistrationSchema(selectedMarket.code, 'CLIENT', selectedMarket.defaultLocale).then(async (nextSchema) => {
      if (!active) return;
      setSchema(nextSchema); setIdentityType(nextSchema.identityDocuments[0]?.type || '');
      const root = await apiClient.getDivisions(selectedMarket.code);
      if (active) setDivisionOptions({ 1: root.items });
    }).catch(() => { if (active) setSchema(null); }).finally(() => { if (active) setSchemaLoading(false); });
    return () => { active = false; };
  }, [selectedMarket]);

  useEffect(() => {
    if (!selectedMarket) { setMarketingPolicy(null); return; }
    let active = true; setPolicyLoading(true); setMarketingPolicy(null); setMarketingConsent(false);
    apiClient.getConsentPolicies(selectedMarket.countryCode, locale).then(({ policies }) => { if (active) setMarketingPolicy(policies.find((item) => item.purpose === 'marketing_attribution') || null); }).catch(() => { if (active) setMarketingPolicy(null); }).finally(() => { if (active) setPolicyLoading(false); });
    return () => { active = false; };
  }, [selectedMarket, locale]);

  const selectDivision = async (level: number, division: DivisionOption) => {
    if (!selectedMarket || !schema) return;
    const nextSelected = Object.fromEntries(Object.entries(selectedDivisions).filter(([key]) => Number(key) < level)) as Record<number, DivisionOption>;
    nextSelected[level] = division;
    setSelectedDivisions(nextSelected);
    setDivisionOptions(Object.fromEntries(Object.entries(divisionOptions).filter(([key]) => Number(key) <= level)) as Record<number, DivisionOption[]>);
    if (level < schema.geography.levels.length) {
      try {
        const children = await apiClient.getDivisions(selectedMarket.code, division.id);
        setDivisionOptions((current) => ({ ...current, [level + 1]: children.items }));
      } catch { Alert.alert(t('common.error'), 'No se pudo cargar la siguiente división territorial.'); }
    }
  };

  const handleRegister = async () => {
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = formData.email.trim().toLowerCase();
    const phone = formData.phone.replace(/[\s()-]/g, '');
    if (!selectedMarket || !schema) return Alert.alert(t('common.error'), 'No hay un mercado de registro disponible.');
    if (!firstName || !lastName || !email || !phone || !formData.password || !formData.confirmPassword || !identityValue) return Alert.alert(t('common.error'), t('auth.required'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Alert.alert(t('common.error'), t('auth.invalidEmail'));
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return Alert.alert(t('common.error'), 'Usa el formato telefónico internacional.');
    if (formData.password.length < 8) return Alert.alert(t('common.error'), t('auth.passwordLength'));
    if (formData.password !== formData.confirmPassword) return Alert.alert(t('common.error'), t('auth.passwordsMismatch'));
    if (!acceptTerms || !acceptPrivacy) return Alert.alert(t('common.error'), t('auth.legalRequired'));
    if (orderedDivisionIds(schema, selectedDivisions).length !== schema.geography.levels.length) return Alert.alert(t('common.error'), 'Completa la jerarquía territorial.');
    for (const field of renderedSections.find((section) => section.key === 'address')?.fields || []) if (field.required && !address[field.key]?.trim()) return Alert.alert(t('common.error'), `Completa ${field.key}.`);
    try {
      await register({
        firstName, lastName, email, phone, password: formData.password, role: 'CLIENT', countryCode: selectedMarket.countryCode, marketCode: selectedMarket.code,
        registrationSchemaVersion: schema.schemaVersion, identityDocument: { type: identityType, value: identityValue },
        normalizedAddress: { line1: address.line1 || '', line2: address.line2, locality: address.locality, postalCode: address.postalCode, divisionIds: orderedDivisionIds(schema, selectedDivisions) },
        locale, acceptTerms: true, acceptPrivacy: true, marketingConsent, termsVersion: LEGAL_DOCUMENT_VERSION, privacyVersion: LEGAL_DOCUMENT_VERSION,
        ...(marketingPolicy ? { marketingPolicyId: marketingPolicy.id, marketingPolicyVersion: marketingPolicy.version } : {}),
      });
      router.replace('/(tabs)');
    } catch (error) { Alert.alert(t('auth.registrationFailed'), error instanceof Error ? error.message : t('common.error')); }
  };

  const Checkbox = ({ checked, onPress, children }: { checked: boolean; onPress: () => void; children: React.ReactNode }) => <TouchableOpacity style={styles.checkboxRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }}><View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Ionicons name="checkmark" size={16} color={COLORS.white} />}</View><View style={styles.checkboxLabel}>{children}</View></TouchableOpacity>;

  return <SafeAreaView style={styles.container} edges={['top', 'bottom']}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}><ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
    <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel={t('common.goBack')}><Ionicons name="arrow-back" size={24} color={COLORS.primary} /></TouchableOpacity>
    <Text style={styles.title}>{t('auth.createAccount')}</Text><Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>
    <Text style={styles.sectionLabel}>Mercado disponible</Text>
    <View style={styles.optionRow}>{markets.map((market) => <TouchableOpacity key={market.code} onPress={() => setMarketCode(market.code)} style={[styles.option, marketCode === market.code && styles.optionSelected]} accessibilityRole="radio" accessibilityState={{ selected: marketCode === market.code }}><Text>{market.code} · {market.currencyCode}</Text></TouchableOpacity>)}</View>
    {!schemaLoading && markets.length === 0 && <View style={styles.notice}><Text>No hay mercados activos para registro. La disponibilidad la controla el servidor.</Text></View>}
    {schema && <>
      <View style={styles.nameRow}><Input style={styles.halfInput} label={t('auth.firstName')} value={formData.firstName} onChangeText={(firstName) => setFormData((v) => ({ ...v, firstName }))} /><Input style={styles.halfInput} label={t('auth.lastName')} value={formData.lastName} onChangeText={(lastName) => setFormData((v) => ({ ...v, lastName }))} /></View>
      <Input label={t('auth.email')} value={formData.email} onChangeText={(email) => setFormData((v) => ({ ...v, email }))} keyboardType="email-address" autoCapitalize="none" />
      <Input label={t('auth.phone')} placeholder="+…" value={formData.phone} onChangeText={(phone) => setFormData((v) => ({ ...v, phone }))} keyboardType="phone-pad" />
      <Input label={t('auth.password')} value={formData.password} onChangeText={(password) => setFormData((v) => ({ ...v, password }))} secureTextEntry />
      <Input label={t('auth.confirmPassword')} value={formData.confirmPassword} onChangeText={(confirmPassword) => setFormData((v) => ({ ...v, confirmPassword }))} secureTextEntry />
      <Text style={styles.sectionLabel}>Documento de identidad</Text><View style={styles.optionRow}>{schema.identityDocuments.map((document) => <TouchableOpacity key={document.type} onPress={() => setIdentityType(document.type)} style={[styles.option, identityType === document.type && styles.optionSelected]}><Text>{document.type}</Text></TouchableOpacity>)}</View>
      <Input label={identityType} value={identityValue} onChangeText={setIdentityValue} autoCapitalize="characters" />
      <Text style={styles.sectionLabel}>Dirección</Text>{schema.address.fields.map((field) => <Input key={field.key} label={`${field.key}${field.required ? ' *' : ''}`} value={address[field.key] || ''} onChangeText={(value) => setAddress((current) => ({ ...current, [field.key]: value }))} />)}
      <Text style={styles.sectionLabel}>Geografía oficial</Text>{schema.geography.levels.map((level) => <View key={level.level} style={styles.level}><Text style={styles.levelTitle}>{level.type}</Text><View style={styles.optionRow}>{(divisionOptions[level.level] || []).map((division) => <TouchableOpacity key={division.id} onPress={() => void selectDivision(level.level, division)} style={[styles.option, selectedDivisions[level.level]?.id === division.id && styles.optionSelected]}><Text>{division.canonicalName}</Text></TouchableOpacity>)}</View></View>)}
      <Checkbox checked={acceptTerms} onPress={() => setAcceptTerms((v) => !v)}><Text style={styles.legalText}>{t('auth.acceptTermsPrefix')} <Text style={styles.legalLink} onPress={() => router.push('/legal/terms' as Href)}>{t('auth.terms')}</Text>.</Text></Checkbox>
      <Checkbox checked={acceptPrivacy} onPress={() => setAcceptPrivacy((v) => !v)}><Text style={styles.legalText}>{t('auth.acceptPrivacyPrefix')} <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy' as Href)}>{t('auth.privacy')}</Text>.</Text></Checkbox>
      {marketingPolicy ? <Checkbox checked={marketingConsent} onPress={() => setMarketingConsent((v) => !v)}><Text style={styles.legalText}>{t('auth.marketingOptional')} <Text style={styles.legalLink} onPress={() => void Linking.openURL(marketingPolicy.documentReference)}>{marketingPolicy.key} v{marketingPolicy.version}</Text>.</Text></Checkbox> : <View style={styles.notice}><Text>{t(policyLoading ? 'auth.marketingPolicyLoading' : 'auth.marketingUnavailable')}</Text></View>}
      <Button title={t('auth.register')} onPress={handleRegister} loading={isLoading} disabled={isLoading || !acceptTerms || !acceptPrivacy} fullWidth size="large" />
    </>}
    <TouchableOpacity onPress={() => router.replace('/auth/login')} style={styles.loginLinkContainer}><Text style={styles.loginText}>{t('auth.hasAccount')} <Text style={styles.legalLink}>{t('auth.signIn')}</Text></Text></TouchableOpacity>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.background},keyboardView:{flex:1},scrollContent:{flexGrow:1,padding:SPACING.lg,paddingBottom:SPACING.xxl},backButton:{width:40,height:40,borderRadius:20,backgroundColor:COLORS.primaryLight,justifyContent:'center',alignItems:'center',marginBottom:SPACING.md},title:{fontSize:28,fontWeight:'700',color:COLORS.textPrimary,fontFamily:FONTS.bold},subtitle:{fontSize:16,color:COLORS.textSecondary,marginTop:SPACING.xs,marginBottom:SPACING.lg},sectionLabel:{fontSize:FONTS.sizes.sm,fontWeight:'700',color:COLORS.textPrimary,marginBottom:SPACING.sm,marginTop:SPACING.sm},optionRow:{flexDirection:'row',flexWrap:'wrap',gap:SPACING.sm,marginBottom:SPACING.lg},option:{minHeight:44,paddingHorizontal:SPACING.md,borderWidth:1,borderColor:COLORS.border,borderRadius:BORDER_RADIUS.md,justifyContent:'center',backgroundColor:COLORS.surface},optionSelected:{borderColor:COLORS.primary,backgroundColor:COLORS.primaryLight},nameRow:{flexDirection:'row',gap:SPACING.md},halfInput:{flex:1,minWidth:0},notice:{backgroundColor:COLORS.primaryLight,borderRadius:BORDER_RADIUS.md,padding:SPACING.md,marginBottom:SPACING.lg},level:{marginBottom:SPACING.sm},levelTitle:{fontSize:FONTS.sizes.xs,color:COLORS.textSecondary,marginBottom:SPACING.xs},checkboxRow:{flexDirection:'row',alignItems:'flex-start',marginBottom:SPACING.md,minHeight:28},checkbox:{width:22,height:22,borderRadius:6,borderWidth:1.5,borderColor:COLORS.gray400,alignItems:'center',justifyContent:'center',marginTop:1},checkboxChecked:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},checkboxLabel:{flex:1,marginLeft:SPACING.sm},legalText:{color:COLORS.textSecondary,fontSize:FONTS.sizes.sm,lineHeight:20},legalLink:{color:COLORS.primary,fontWeight:'700',textDecorationLine:'underline'},loginLinkContainer:{paddingVertical:SPACING.lg,alignItems:'center'},loginText:{color:COLORS.textSecondary,fontSize:FONTS.sizes.sm},
});
