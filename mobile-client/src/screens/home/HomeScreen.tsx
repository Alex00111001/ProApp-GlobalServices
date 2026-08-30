import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ProfessionalCard } from '@/components/ui';
import { useAppStore } from '@/store/appStore';
import { COLORS, SPACING, FONTS } from '@/constants/theme';
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
    <TouchableOpacity
      style={styles.categoryCard}
      onPress={() => router.push(`/(tabs)/search?categoryId=${item.id}`)}
    >
      <View style={styles.categoryIcon}>
        <Ionicons name={iconName} size={24} color={COLORS.primary} />
      </View>
      <Text style={styles.categoryName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {translateCategory(t, item)}
      </Text>
    </TouchableOpacity>
    );
  };

  const renderProfessional = ({ item }: { item: ProfessionalProfile }) => (
    <ProfessionalCard
      professional={item}
      onPress={() => router.push(`/professional/${item.id}`)}
    />
  );

  if (isLoadingCategories || isLoadingProfessionals) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
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
        <Text style={styles.sectionTitle}>{t('home.top')}</Text>
        <TouchableOpacity>
          <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={professionals}
        renderItem={renderProfessional}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.professionalsList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={COLORS.gray400} />
            <Text style={styles.emptyText}>{t('home.empty')}</Text>
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
  },
  header: {
    padding: SPACING.lg,
    paddingTop: SPACING.md,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  categoriesScroller: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 112,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  categoriesList: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  categoryCard: {
    alignItems: 'center',
    marginRight: SPACING.lg,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.lg,
    width: 104,
    ...require('@/constants/theme').SHADOWS.sm,
  },
  categoryIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primaryTransparent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  categoryName: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.medium,
    color: COLORS.textPrimary,
    textAlign: 'center',
    minHeight: 34,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  seeAll: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: FONTS.weights.medium,
  },
  professionalsList: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 110,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxx,
  },
  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textTertiary,
    marginTop: SPACING.md,
  },
});
