import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { ProfessionalProfile } from '@/types';
import { Ionicons } from '@expo/vector-icons';

interface ProfessionalCardProps {
  professional: ProfessionalProfile;
  onPress?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export const ProfessionalCard: React.FC<ProfessionalCardProps> = ({
  professional,
  onPress,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, index) => (
      <Ionicons
        key={index}
        name={index < Math.floor(rating) ? 'star' : 'star-outline'}
        size={14}
        color={COLORS.warning}
      />
    ));
  };

  return (
    <TouchableOpacity style={[styles.card, SHADOWS.md]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <Image
          source={{
            uri: professional.user.avatar || 'https://via.placeholder.com/100',
          }}
          style={styles.avatar}
        />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{professional.user.name}</Text>
          <Text style={styles.specialty} numberOfLines={1}>
            {professional.categories[0]?.name || 'Professional'}
          </Text>
          <View style={styles.ratingContainer}>
            <View style={styles.stars}>{renderStars(professional.rating)}</View>
            <Text style={styles.ratingText}>{professional.rating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({professional.totalReviews})</Text>
          </View>
        </View>
        {onToggleFavorite && (
          <TouchableOpacity onPress={onToggleFavorite} style={styles.favoriteButton}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? COLORS.error : COLORS.gray400}
            />
          </TouchableOpacity>
        )}
      </View>
      
      {professional.bio && (
        <Text style={styles.bio} numberOfLines={2}>
          {professional.bio}
        </Text>
      )}
      
      <View style={styles.footer}>
        <View style={styles.rateContainer}>
          <Ionicons name="cash-outline" size={16} color={COLORS.primary} />
          <Text style={styles.rateText}>
            ${professional.hourlyRate?.toFixed(2) || '0'}/hour
          </Text>
        </View>
        <View style={styles.experienceContainer}>
          <Ionicons name="briefcase-outline" size={16} color={COLORS.gray500} />
          <Text style={styles.experienceText}>
            {professional.yearsOfExperience || 0} years
          </Text>
        </View>
      </View>
      
      <View style={styles.badgeContainer}>
        {professional.isVerified && (
          <View style={[styles.badge, styles.verifiedBadge]}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
            <Text style={[styles.badgeText, styles.verifiedText]}>Verified</Text>
          </View>
        )}
        {professional.isApproved && (
          <View style={[styles.badge, styles.approvedBadge]}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.primary} />
            <Text style={[styles.badgeText, styles.approvedText]}>Approved</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginVertical: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.full,
    marginRight: SPACING.md,
  },
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
    marginBottom: SPACING.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  stars: {
    flexDirection: 'row',
    marginRight: SPACING.xs,
  },
  ratingText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
    marginRight: SPACING.xxs,
  },
  reviewCount: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
  favoriteButton: {
    padding: SPACING.xs,
  },
  bio: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  rateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  rateText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.primary,
    marginLeft: SPACING.xs,
    flexShrink: 1,
  },
  experienceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  experienceText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  verifiedBadge: {
    backgroundColor: COLORS.successTransparent,
  },
  approvedBadge: {
    backgroundColor: COLORS.primaryTransparent,
  },
  badgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.medium,
    marginLeft: SPACING.xxs,
  },
  verifiedText: {
    color: COLORS.success,
  },
  approvedText: {
    color: COLORS.primary,
  },
});
