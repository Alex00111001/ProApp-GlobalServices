import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading, error } = useAuthStore();
  const submit = async () => {
    if (!email.trim() || password.length < 8) return;
    try { await login(email, password); router.replace('/(tabs)'); } catch { /* store exposes message */ }
  };
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brandIcon}><Ionicons name="briefcase" size={34} color={COLORS.white} /></View>
        <Text style={styles.brand}>Home Services</Text><Text style={styles.brandAccent}>Para profesionales</Text>
        <Text style={styles.title}>Accede a tu cuenta profesional</Text>
        <Text style={styles.subtitle}>Consulta tu verificación y gestiona servicios, reservas e ingresos desde un solo lugar.</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Correo electrónico</Text>
          <View style={styles.inputWrap}><Ionicons name="mail-outline" size={20} color={COLORS.muted} /><TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="profesional@correo.com" placeholderTextColor="#9CA3AF" /></View>
          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.inputWrap}><Ionicons name="lock-closed-outline" size={20} color={COLORS.muted} /><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder="Mínimo 8 caracteres" placeholderTextColor="#9CA3AF" /><Pressable onPress={() => setShowPassword(!showPassword)}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.muted} /></Pressable></View>
          {!!error && <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} /><Text style={styles.error}>{error}</Text></View>}
          <Pressable style={[styles.button, (loading || !email.trim() || password.length < 8) && styles.buttonDisabled]} onPress={submit} disabled={loading || !email.trim() || password.length < 8}>
            {loading ? <ActivityIndicator color={COLORS.white} /> : <><Text style={styles.buttonText}>Iniciar sesión</Text><Ionicons name="arrow-forward" size={20} color={COLORS.white} /></>}
          </Pressable>
        </View>
        <Text style={styles.help}>Acceso seguro para profesionales registrados</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background }, container: { flex: 1, padding: SPACING.xl, justifyContent: 'center' },
  brandIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg }, brand: { fontSize: 30, fontWeight: '800', color: COLORS.text }, brandAccent: { color: COLORS.primary, fontWeight: '700', fontSize: 16, marginTop: -4, marginBottom: SPACING.xxl },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text }, subtitle: { color: COLORS.muted, fontSize: 15, lineHeight: 22, marginTop: SPACING.sm, marginBottom: SPACING.xl }, form: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border }, label: { color: COLORS.text, fontSize: 13, fontWeight: '700', marginBottom: SPACING.sm, marginTop: SPACING.sm },
  inputWrap: { minHeight: 54, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FBFCFE' }, input: { flex: 1, color: COLORS.text, fontSize: 15, marginLeft: SPACING.sm, paddingVertical: 0 },
  errorBox: { flexDirection: 'row', backgroundColor: '#FEECEC', borderRadius: RADIUS.sm, padding: SPACING.md, marginTop: SPACING.md }, error: { color: COLORS.danger, flex: 1, marginLeft: SPACING.sm, fontSize: 13 },
  button: { minHeight: 54, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg }, buttonDisabled: { opacity: 0.5 }, buttonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' }, help: { color: COLORS.muted, textAlign: 'center', fontSize: 12, marginTop: SPACING.xl },
});
