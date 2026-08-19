import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';


import { ProfessionalCard } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { apiClient } from '@/services/api';
import { ProfessionalProfile } from '@/types';

interface FilterState {
  category: string;
  minRating: number;
  maxPrice: number;
  sortBy: 'rating' | 'price' | 'distance';
}

export const SearchScreen: React.FC = () => {
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [professionals, setProfessionals] = useState<ProfessionalProfile[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState<FilterState>({
    category: '',
    minRating: 0,
    maxPrice: 500,
    sortBy: 'rating',
  });

  useEffect(() => {
    loadData();
  }, []);

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

  const filteredProfessionals = professionals.filter(pro => {
    const matchesSearch = pro.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pro.categories.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = !filters.category || 
      pro.categories.some(c => c.id === filters.category);
    
    const matchesRating = pro.rating >= filters.minRating;
    
    return matchesSearch && matchesCategory && matchesRating;
  }).sort((a, b) => {
    switch (filters.sortBy) {
      case 'rating':
        return b.rating - a.rating;
      case 'price':
        return (a.hourlyRate || 0) - (b.hourlyRate || 0);
      default:
        return 0;
    }
  });

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
        <Text style={styles.headerTitle}>Search</Text>
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
          placeholder="Search professionals or services..."
          value={searchQuery}
          onChangeText={setSearchQuery}
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
            <Text style={styles.filterSectionTitle}>Category</Text>
            <FlatList
              data={categories}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => renderFilterChip(
                item.name,
                filters.category === item.id,
                () => setFilters({ ...filters, category: filters.category === item.id ? '' : item.id })
              )}
            />
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Minimum Rating</Text>
            <View style={styles.ratingChips}>
              {[0, 3, 4, 4.5].map((rating) => renderFilterChip(
                rating === 0 ? 'Any' : `${rating}+ ★`,
                filters.minRating === rating,
                () => setFilters({ ...filters, minRating: filters.minRating === rating ? 0 : rating })
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Sort By</Text>
            <View style={styles.sortChips}>
              {renderFilterChip('Rating', filters.sortBy === 'rating', () => setFilters({ ...filters, sortBy: 'rating' }))}
              {renderFilterChip('Price', filters.sortBy === 'price', () => setFilters({ ...filters, sortBy: 'price' }))}
            </View>
          </View>
        </View>
      )}

      {/* Results Count */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsCount}>
          {filteredProfessionals.length} professional{filteredProfessionals.length !== 1 ? 's' : ''} found
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
            <Text style={styles.emptyTitle}>No professionals found</Text>
            <Text style={styles.emptySubtitle}>
              Try adjusting your search or filters
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
