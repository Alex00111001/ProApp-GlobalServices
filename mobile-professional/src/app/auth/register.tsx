import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type DivisionOption, type MarketSummary, type RegistrationSchema } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { LEGAL_DOCUMENT_VERSION } from '@/constants/legal';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

export default function ProfessionalRegisterScreen() {
  const { register, loading } = useAuthStore();
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [marketCode, setMarketCode] = useState<MarketSummary['code'] | null>(null);
  const [schema, setSchema] = useState<RegistrationSchema | null>(null);
  const [identityType, setIdentityType] = useState('');
  const [identityValue, setIdentityValue] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', line1: '', line2: '', locality: '', postalCode: '' });
  const [options, setOptions] = useState<Record<number, DivisionOption[]>>({});
  const [selected, setSelected] = useState<Record<number, DivisionOption>>({});
  const [accepted, setAccepted] = useState(false);
  const market = useMemo(() => markets.find((item) => item.code === marketCode) || null, [markets, marketCode]);

  useEffect(() => { api.markets().then(({ items }) => { setMarkets(items); setMarketCode(items[0]?.code || null); }).catch(() => setMarkets([])); }, []);
  useEffect(() => {
    if (!market) { setSchema(null); return; }
    let active = true; setSchema(null); setSelected({}); setOptions({});
    api.registrationSchema(market.code).then(async (next) => { if (!active) return; setSchema(next); setIdentityType(next.identityDocuments[0]?.type || ''); const root = await api.divisions(market.code); if (active) setOptions({ 1: root.items }); }).catch(() => { if (active) setSchema(null); });
    return () => { active = false; };
  }, [market]);

  const selectDivision = async (level: number, division: DivisionOption) => {
    if (!market || !schema) return;
    const next = Object.fromEntries(Object.entries(selected).filter(([key]) => Number(key) < level)) as Record<number, DivisionOption>;
    next[level] = division; setSelected(next);
    setOptions(Object.fromEntries(Object.entries(options).filter(([key]) => Number(key) <= level)) as Record<number, DivisionOption[]>);
    if (level < schema.geography.levels.length) {
      const children = await api.divisions(market.code, division.id);
      setOptions((current) => ({ ...current, [level + 1]: children.items }));
    }
  };

  const submit = async () => {
    if (!market || !schema) return Alert.alert('Mercado no disponible', 'El servidor no ofrece ningún mercado profesional activo.');
    if (!accepted || !identityValue || Object.keys(selected).length !== schema.geography.levels.length || !form.firstName || !form.lastName || !form.email || !form.phone || form.password.length < 8 || !form.line1) return Alert.alert('Datos incompletos', 'Completa todos los campos, la geografía y la aceptación legal.');
    try {
      await register({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.replace(/[\s()-]/g, ''), password: form.password,
        role: 'PROFESSIONAL', countryCode: market.countryCode, marketCode: market.code, registrationSchemaVersion: schema.schemaVersion,
        identityDocument: { type: identityType, value: identityValue },
        normalizedAddress: { line1: form.line1, line2: form.line2 || undefined, locality: form.locality || undefined, postalCode: form.postalCode || undefined, divisionIds: Object.values(selected).sort((a, b) => a.level - b.level).map((division) => division.id) },
        locale: schema.locale,
        acceptTerms: true, acceptPrivacy: true, marketingConsent: false, termsVersion: LEGAL_DOCUMENT_VERSION, privacyVersion: LEGAL_DOCUMENT_VERSION,
      });
      router.replace('/(tabs)');
    } catch (error) { Alert.alert('Registro fallido', error instanceof Error ? error.message : 'No se pudo registrar la cuenta'); }
  };

  const field = (key: keyof typeof form, label: string, secure = false) => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={form[key]} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} secureTextEntry={secure} autoCapitalize={key === 'email' ? 'none' : 'sentences'} /></View>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Volver</Text></Pressable><Text style={styles.title}>Crear cuenta profesional</Text><Text style={styles.subtitle}>El formulario y la jerarquía territorial provienen del mercado activo en el servidor.</Text>
    <Text style={styles.label}>Mercado</Text><View style={styles.options}>{markets.map((item) => <Pressable key={item.code} onPress={() => setMarketCode(item.code)} style={[styles.option, marketCode === item.code && styles.selected]}><Text>{item.code} · {item.currencyCode}</Text></Pressable>)}</View>{markets.length === 0 && <View style={styles.notice}><Text>No hay mercados activos para registro.</Text></View>}
    {schema && <>{field('firstName', 'Nombre')}{field('lastName', 'Apellidos')}{field('email', 'Correo')}{field('phone', 'Teléfono internacional')}{field('password', 'Contraseña', true)}<Text style={styles.label}>Documento</Text><View style={styles.options}>{schema.identityDocuments.map((document) => <Pressable key={document.type} onPress={() => setIdentityType(document.type)} style={[styles.option, identityType === document.type && styles.selected]}><Text>{document.type}</Text></Pressable>)}</View><TextInput style={styles.input} value={identityValue} onChangeText={setIdentityValue} autoCapitalize="characters" />{field('line1', 'Dirección')}{schema.address.fields.some((item) => item.key === 'line2') && field('line2', 'Dirección adicional')}{schema.address.fields.some((item) => item.key === 'postalCode') && field('postalCode', 'Código postal')}{schema.geography.levels.map((level) => <View key={level.level}><Text style={styles.label}>{level.type}</Text><View style={styles.options}>{(options[level.level] || []).map((division) => <Pressable key={division.id} onPress={() => void selectDivision(level.level, division)} style={[styles.option, selected[level.level]?.id === division.id && styles.selected]}><Text>{division.canonicalName}</Text></Pressable>)}</View></View>)}<Pressable style={styles.accept} onPress={() => setAccepted((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }}><Text>{accepted ? '☑' : '☐'} Acepto los términos y el aviso de privacidad vigentes.</Text></Pressable><Pressable style={[styles.submit, (!accepted || loading) && styles.disabled]} disabled={!accepted || loading} onPress={() => void submit()}><Text style={styles.submitText}>{loading ? 'Registrando…' : 'Crear cuenta'}</Text></Pressable></>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:COLORS.background},content:{padding:SPACING.lg,paddingBottom:SPACING.xxl},back:{color:COLORS.primary,fontWeight:'700',marginBottom:SPACING.lg},title:{fontSize:28,fontWeight:'800',color:COLORS.text},subtitle:{color:COLORS.muted,lineHeight:21,marginVertical:SPACING.md},field:{marginBottom:SPACING.md},label:{color:COLORS.text,fontWeight:'700',marginBottom:SPACING.sm,marginTop:SPACING.sm},input:{minHeight:52,borderWidth:1,borderColor:COLORS.border,borderRadius:RADIUS.md,paddingHorizontal:SPACING.md,backgroundColor:COLORS.surface,color:COLORS.text},options:{flexDirection:'row',flexWrap:'wrap',gap:SPACING.sm,marginBottom:SPACING.md},option:{minHeight:42,paddingHorizontal:SPACING.md,justifyContent:'center',borderWidth:1,borderColor:COLORS.border,borderRadius:RADIUS.md,backgroundColor:COLORS.surface},selected:{borderColor:COLORS.primary,backgroundColor:'#EEF5FF'},notice:{padding:SPACING.md,backgroundColor:'#FFF7E6',borderRadius:RADIUS.md},accept:{paddingVertical:SPACING.lg},submit:{minHeight:54,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.primary,borderRadius:RADIUS.md},disabled:{opacity:.5},submitText:{color:COLORS.white,fontWeight:'800'} });
