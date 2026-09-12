import React from 'react';
import { View, Text, StyleSheet, Image, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, LAYOUT, SHADOWS } from '@/constants/theme';
import { ProfessionalProfile } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { translateCategory } from '@/i18n/entities';

interface ProfessionalCardProps {
  professional: ProfessionalProfile;
  onPress?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const ProfessionalCard: React.FC<ProfessionalCardProps> = ({
  professional,
  onPress,
  isFavorite = false,
  onToggleFavorite,
  style,
}) => {
  const { t } = useTranslation();

  return (
    <Pressable
      style={({ pressed }) => [styles.card, SHADOWS.sm, style, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${professional.user.name}, ${professional.rating.toFixed(1)}, ${t('home.years', { count: professional.yearsOfExperience || 0 })}`}
    >
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          <Image
            source={professional.user.avatar
              ? { uri: professional.user.avatar }
              : require('../../../assets/icon.png')}
            style={styles.avatar}
          />
          {(professional.isVerified || professional.isApproved) && <View style={styles.avatarBadge}><Ionicons name="checkmark" size={12} color={COLORS.white} /></View>}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{professional.user.name}</Text>
          <Text style={styles.specialty} numberOfLines={1}>
            {translateCategory(t, professional.categories[0]) || t('home.defaultProfessional')}
          </Text>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={14} color={COLORS.warning} />
            <Text style={styles.ratingText}>{professional.rating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>· {t('home.reviews', { count: professional.totalReviews })}</Text>
          </View>
        </View>
        {onToggleFavorite && (
          <Pressable
            onPress={(event) => { event.stopPropagation(); onToggleFavorite(); }}
            style={styles.favoriteButton}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? t('home.removeFavorite') : t('home.addFavorite')}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={22}
              color={isFavorite ? COLORS.error : COLORS.gray400}
            />
          </Pressable>
        )}
      </View>
      
      {professional.bio && (
        <Text style={styles.bio} numberOfLines={2}>
          {professional.bio}
        </Text>
      )}
      
      <View style={styles.footer}>
        <View style={styles.rateBlock}>
          <Text style={styles.rateLabel}>{t('home.rateLabel')}</Text>
          <Text style={styles.rateText}>
            €{professional.hourlyRate?.toFixed(2) || '0'}{t('home.perHour')}
          </Text>
        </View>
        <View style={styles.experienceContainer}>
          <View style={styles.experienceIcon}><Ionicons name="briefcase-outline" size={16} color={COLORS.textSecondary} /></View>
          <Text style={styles.experienceText}>
            {t('home.years', { count: professional.yearsOfExperience || 0 })}
          </Text>
        </View>
        <View style={styles.chevron}><Ionicons name="chevron-forward" size={18} color={COLORS.primary} /></View>
      </View>
      {(professional.isVerified || professional.isApproved) && (
        <View style={styles.trustLine}>
          <Ionicons name="shield-checkmark" size={15} color={COLORS.success} />
          <Text style={styles.trustText}>{professional.isVerified ? t('home.verified') : t('home.approved')}</Text>
          <Text style={styles.trustHint}>{t('home.trustHint')}</Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatarWrap: { marginRight: SPACING.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceMuted,
  },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.success, borderWidth: 3, borderColor: COLORS.surface },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xxs,
  },
  specialty: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.warningSoft,
    gap: 4,
  },
  ratingText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
    marginLeft: 1,
  },
  reviewCount: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
  },
  bio: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  rateBlock: { flex: 1, minWidth: 0 },
  rateLabel: { color: COLORS.textTertiary, fontSize: 11, fontWeight: FONTS.weights.medium, marginBottom: 2 },
  rateText: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
    color: COLORS.primary,
    flexShrink: 1,
  },
  experienceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  experienceIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted },
  experienceText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
  favoriteButton: { width: LAYOUT.touchTarget, height: LAYOUT.touchTarget, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted, marginLeft: SPACING.xs },
  chevron: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  trustLine: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 5 },
  trustText: { color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  trustHint: { flex: 1, color: COLORS.textTertiary, fontSize: 11 },
});
