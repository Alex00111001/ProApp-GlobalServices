import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';


import { ProfessionalCard } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { apiClient } from '@/services/api';
import { ProfessionalProfile } from '@/types';
import { useTranslation } from 'react-i18next';
import { translateCategory } from '@/i18n/entities';
import { smartSearchScore } from '@/utils/smartSearch';

interface FilterState {
  category: string;
  minRating: number;
  maxPrice: number;
  sortBy: 'rating' | 'price' | 'distance';
}

export const SearchScreen: React.FC = () => {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const { t } = useTranslation();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [professionals, setProfessionals] = useState<ProfessionalProfile[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState<FilterState>({
    category: categoryId || '',
    minRating: 0,
    maxPrice: 500,
    sortBy: 'rating',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setFilters(current => ({ ...current, category: categoryId || '' }));
  }, [categoryId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [profData, catData] = await Promise.all([
        apiClient.getProfessionals(),
        apiClient.getCategories(),
      ]);
      setProfessionals(profData);
      setCategories(catData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      setFilters(current => current.category ? { ...current, category: '' } : current);
    }
  };

  const filteredProfessionals = professionals
    .map(professional => {
      const details = professional as ProfessionalProfile & { services?: Array<{ name?: string; description?: string }> };
      const relevance = smartSearchScore(searchQuery, [
        professional.user.name,
        professional.bio,
        ...professional.categories.flatMap(category => [category.name, translateCategory(t, category)]),
        ...(details.services ?? []).flatMap(service => [service.name, service.description]),
      ]);
      return { professional, relevance };
    })
    .filter(({ professional, relevance }) => {
      const matchesCategory = !filters.category ||
        professional.categories.some(category => category.id === filters.category);
      const matchesRating = professional.rating >= filters.minRating;
      return relevance >= 0 && matchesCategory && matchesRating;
    })
    .sort((left, right) => {
      if (searchQuery.trim() && left.relevance !== right.relevance) {
        return right.relevance - left.relevance;
      }

      const a = left.professional;
      const b = right.professional;
    switch (filters.sortBy) {
      case 'rating':
        return b.rating - a.rating;
      case 'price':
        return (a.hourlyRate || 0) - (b.hourlyRate || 0);
      default:
        return 0;
    }
    })
    .map(({ professional }) => professional);

  const renderFilterChip = (label: string, value: any, onPress: () => void) => (
    <TouchableOpacity
      style={[styles.filterChip, value && styles.filterChipActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, value && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('search.title')}</Text>
        <TouchableOpacity 
          style={styles.filterToggleButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons 
            name={showFilters ? 'close' : 'filter'} 
            size={24} 
            color={COLORS.textPrimary} 
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={COLORS.gray400} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search.placeholder')}
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholderTextColor={COLORS.gray400}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>{t('search.category')}</Text>
            <FlatList
              data={categories}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => renderFilterChip(
                translateCategory(t, item),
                filters.category === item.id,
                () => setFilters({ ...filters, category: filters.category === item.id ? '' : item.id })
              )}
            />
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>{t('search.minimumRating')}</Text>
            <View style={styles.ratingChips}>
              {[0, 3, 4, 4.5].map((rating) => renderFilterChip(
                rating === 0 ? t('search.any') : `${rating}+ ★`,
                filters.minRating === rating,
                () => setFilters({ ...filters, minRating: filters.minRating === rating ? 0 : rating })
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>{t('search.sortBy')}</Text>
            <View style={styles.sortChips}>
              {renderFilterChip(t('search.rating'), filters.sortBy === 'rating', () => setFilters({ ...filters, sortBy: 'rating' }))}
              {renderFilterChip(t('search.price'), filters.sortBy === 'price', () => setFilters({ ...filters, sortBy: 'price' }))}
            </View>
          </View>
        </View>
      )}

      {/* Results Count */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsCount}>
          {t(filteredProfessionals.length === 1 ? 'search.foundOne' : 'search.foundMany', {
            count: filteredProfessionals.length,
          })}
        </Text>
      </View>

      {/* Professionals List */}
      <FlatList
        data={filteredProfessionals}
        renderItem={({ item }) => (
          <ProfessionalCard
            professional={item}
            onPress={() => router.push(`/professional/${item.id}`)}
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={COLORS.gray400} />
            <Text style={styles.emptyTitle}>{t('search.empty')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('search.adjust')}
            </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  filterToggleButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.md,
    marginLeft: SPACING.sm,
  },
  filtersPanel: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterSection: {
    marginBottom: SPACING.md,
  },
  filterSectionTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.gray100,
    marginRight: SPACING.sm,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.medium,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  ratingChips: {
    flexDirection: 'row',
  },
  sortChips: {
    flexDirection: 'row',
  },
  resultsHeader: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  resultsCount: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textTertiary,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxx,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  emptySubtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textTertiary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
});
