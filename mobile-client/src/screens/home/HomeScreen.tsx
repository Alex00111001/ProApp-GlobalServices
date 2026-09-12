import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ProfessionalCard } from '@/components/ui';
import { useAppStore } from '@/store/appStore';
import { BORDER_RADIUS, COLORS, FONTS, LAYOUT, SHADOWS, SPACING } from '@/constants/theme';
import { ProfessionalProfile } from '@/types';
import { useTranslation } from 'react-i18next';
import { translateCategory } from '@/i18n/entities';

export const HomeScreen: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { categories, professionals, isLoadingCategories, isLoadingProfessionals, fetchCategories, fetchProfessionals } = useAppStore();

  useEffect(() => {
    fetchCategories();
    fetchProfessionals();
  }, []);

  const renderCategory = ({ item }: { item: any }) => {
    const iconName = item.icon && item.icon in Ionicons.glyphMap
      ? item.icon as keyof typeof Ionicons.glyphMap
      : 'construct-outline';

    return (
    <Pressable
      style={styles.categoryCard}
      onPress={() => router.push(`/(tabs)/search?categoryId=${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={t('home.categoryA11y', { category: translateCategory(t, item) })}
    >
      <View style={styles.categoryIcon}>
        <Ionicons name={iconName} size={24} color={COLORS.primary} />
      </View>
      <Text style={styles.categoryName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {translateCategory(t, item)}
      </Text>
    </Pressable>
    );
  };

  const renderProfessional = ({ item }: { item: ProfessionalProfile }) => (
    <ProfessionalCard
      professional={item}
      onPress={() => router.push(`/professional/${item.id}`)}
      style={styles.professionalCard}
    />
  );

  if (isLoadingCategories || isLoadingProfessionals) {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar">
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const listHeader = (
    <>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Ionicons name="home" size={18} color={COLORS.white} /></View>
          <Text style={styles.eyebrow}>{t('home.eyebrow')}</Text>
        </View>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
        <Pressable
          style={({ pressed }) => [styles.searchAction, pressed && styles.searchActionPressed]}
          onPress={() => router.push('/(tabs)/search')}
          accessibilityRole="search"
          accessibilityLabel={t('search.placeholder')}
        >
          <Ionicons name="search" size={21} color={COLORS.primary} />
          <Text style={styles.searchActionText}>{t('search.placeholder')}</Text>
          <View style={styles.searchArrow}><Ionicons name="arrow-forward" size={18} color={COLORS.white} /></View>
        </Pressable>
        <View style={styles.trustRow}>
          <View style={styles.trustItem}><Ionicons name="shield-checkmark" size={17} color={COLORS.accentSoft} /><Text style={styles.trustText}>{t('home.trustVerified')}</Text></View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}><Ionicons name="star" size={16} color="#FFD37A" /><Text style={styles.trustText}>{t('home.trustReviews')}</Text></View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View><Text style={styles.sectionEyebrow}>{t('home.categoriesEyebrow')}</Text><Text style={styles.sectionTitle}>{t('home.categoriesTitle')}</Text></View>
      </View>
      <FlatList
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesList}
        style={styles.categoriesScroller}
      />

      <View style={styles.sectionHeader}>
        <View><Text style={styles.sectionEyebrow}>{t('home.trustedEyebrow')}</Text><Text style={styles.sectionTitle}>{t('home.top')}</Text></View>
        <Pressable style={styles.seeAllButton} onPress={() => router.push('/(tabs)/search')} accessibilityRole="button">
          <Text style={styles.seeAll}>{t('home.seeAll')}</Text><Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
        </Pressable>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={professionals}
        renderItem={renderProfessional}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.professionalsList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}><Ionicons name="people-outline" size={28} color={COLORS.primary} /></View>
            <Text style={styles.emptyTitle}>{t('home.empty')}</Text>
            <Text style={styles.emptyText}>{t('home.emptyHint')}</Text>
            <Pressable style={styles.emptyAction} onPress={() => router.push('/(tabs)/search')}><Text style={styles.emptyActionText}>{t('tabs.search')}</Text></Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
  },
  hero: {
    overflow: 'hidden',
    marginHorizontal: LAYOUT.screenPadding,
    marginTop: SPACING.md,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xxl,
    backgroundColor: COLORS.ink,
    ...SHADOWS.md,
  },
  heroGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(92, 133, 234, 0.22)',
    right: -72,
    top: -95,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  eyebrow: {
    color: '#CFE0E8',
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    maxWidth: 360,
    fontSize: FONTS.sizes.xxxl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.white,
    lineHeight: 38,
  },
  categoriesScroller: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 112,
  },
  subtitle: {
    maxWidth: 430,
    fontSize: FONTS.sizes.sm,
    color: '#CFE0E8',
    lineHeight: 21,
    marginTop: SPACING.sm,
  },
  searchAction: {
    minHeight: 56,
    marginTop: SPACING.xl,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  searchActionPressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  searchActionText: { flex: 1, color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  searchArrow: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
  trustRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.lg, gap: SPACING.md },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexShrink: 1 },
  trustDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.22)' },
  trustText: { color: '#DDE9EE', fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium, flexShrink: 1 },
  sectionEyebrow: { color: COLORS.accent, fontSize: 11, fontWeight: FONTS.weights.bold, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 3 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  seeAll: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: FONTS.weights.medium,
  },
  seeAllButton: { minHeight: LAYOUT.touchTarget, flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingLeft: SPACING.md },
  professionalsList: {
    paddingBottom: 112,
  },
  professionalCard: { marginHorizontal: LAYOUT.screenPadding },
  categoriesList: { paddingHorizontal: LAYOUT.screenPadding, paddingVertical: SPACING.xs },
  categoryCard: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginRight: SPACING.md,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 112,
    minHeight: 116,
    ...SHADOWS.sm,
  },
  categoryIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  categoryName: { fontSize: FONTS.sizes.sm, lineHeight: 18, fontWeight: FONTS.weights.semibold, color: COLORS.textPrimary, minHeight: 36 },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: LAYOUT.screenPadding,
    padding: SPACING.xxl,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: SPACING.md, color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold },
  emptyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  emptyAction: { minHeight: LAYOUT.touchTarget, marginTop: SPACING.lg, paddingHorizontal: SPACING.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md },
  emptyActionText: { color: COLORS.white, fontWeight: FONTS.weights.semibold },
});
