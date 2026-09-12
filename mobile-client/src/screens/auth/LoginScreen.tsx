import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, LAYOUT, SHADOWS } from '@/constants/theme';
import { LoginCredentials } from '@/types';
import { useTranslation } from 'react-i18next';

export const LoginScreen: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { login, isLoading, error } = useAuthStore();
  
  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleLogin = async () => {
    setLocalError('');
    
    if (!formData.email || !formData.password) {
      setLocalError(t('auth.required'));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setLocalError(t('auth.invalidEmail'));
      return;
    }

    try {
      await login(formData.email, formData.password);
      router.replace('/(tabs)');
    } catch (err) {
      // Error is handled by the store
    }
  };


  return (
    <KeyboardAvoidingView
      style={styles.container as StyleProp<ViewStyle>}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent as StyleProp<ViewStyle>} keyboardShouldPersistTaps="handled">
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <View style={styles.brandIcon}><Ionicons name="home" size={28} color={COLORS.white} /><View style={styles.brandVerified}><Ionicons name="checkmark" size={10} color={COLORS.white} /></View></View>
            <Text style={styles.title}>ServicePro</Text>
            <Text style={styles.eyebrow}>{t('authUi.clientAccess')}</Text>
            <Text style={styles.subtitle}>{t('auth.tagline')}</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>{t('authUi.welcomeBack')}</Text>
            <Text style={styles.formSubtitle}>{t('authUi.accessHint')}</Text>
            <Input
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              value={formData.email}
              onChangeText={(text) => setFormData({ ...formData, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              icon={<Ionicons name="mail-outline" size={20} color={COLORS.gray400} />}
            />

            <Input
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              value={formData.password}
              onChangeText={(text) => setFormData({ ...formData, password: text })}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              icon={<Ionicons name="lock-closed-outline" size={20} color={COLORS.gray400} />}
              rightIcon={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} accessibilityRole="button" accessibilityLabel={showPassword ? t('authUi.hidePassword') : t('authUi.showPassword')}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={COLORS.gray400}
                  />
                </TouchableOpacity>
              }
            />

            {(localError || error) && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{localError || error}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>{t('auth.forgot')}</Text>
            </TouchableOpacity>

            <Button
              title={t('auth.signIn')}
              onPress={handleLogin}
              disabled={isLoading}
              fullWidth
            />

            {isLoading && (
              <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />
            )}
            <View style={styles.securityNote}><Ionicons name="shield-checkmark-outline" size={18} color={COLORS.success} /><Text style={styles.securityText}>{t('authUi.secureAccess')}</Text></View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
            <TouchableOpacity onPress={() => router.push('/auth/register')}>
              <Text style={styles.linkText}>{t('auth.signUp')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: LAYOUT.contentMaxWidth,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.xl,
    paddingHorizontal: LAYOUT.screenPadding,
  },
  brandIcon: { width: 64, height: 64, borderRadius: 21, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', ...SHADOWS.md },
  brandVerified: { position: 'absolute', width: 20, height: 20, right: -4, bottom: -4, borderRadius: 10, backgroundColor: COLORS.success, borderWidth: 3, borderColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
  },
  eyebrow: { marginTop: 3, color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, letterSpacing: 0.9, textTransform: 'uppercase' },
  subtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 380,
  },
  form: {
    marginHorizontal: LAYOUT.screenPadding,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xxl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    ...SHADOWS.sm,
  },
  formTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold },
  formSubtitle: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, marginTop: SPACING.xs, marginBottom: SPACING.xl },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  forgotPasswordText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: FONTS.weights.medium,
  },
  loader: {
    marginTop: SPACING.md,
  },
  securityNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  securityText: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, flexShrink: 1 },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorTransparent,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  errorText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginVertical: SPACING.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textTertiary,
    paddingHorizontal: SPACING.md,
  },
  socialButtons: {
    paddingHorizontal: SPACING.lg,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  socialButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.medium,
    color: COLORS.textPrimary,
    marginLeft: SPACING.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  footerText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
  },
  linkText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    fontWeight: FONTS.weights.semibold,
  },
});
