import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';


import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { apiClient } from '@/services/api';

  ServiceDetail: { serviceId: string };
};


interface Service {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  duration: number;
  categoryId: string;
  subcategoryId?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
}

export const ServicesCatalogScreen: React.FC = () => {
  const router = useRouter();
  const route = useRoute<RoutePropType>();
  const { categoryId, categoryName } = route.params || {};

  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(categoryId);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load categories
      const categoriesData = await apiClient.getCategories();
      setCategories(categoriesData);

      // Load services for selected category
      if (selectedCategory) {
        // In real app, filter by category
        const servicesData = await apiClient.getProfessionals({ categoryId: selectedCategory });
        // Transform to services format
        setServices([]);
      } else {
        setServices([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredServices = services.filter(service =>
    service.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCategory = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={[
        styles.categoryCard,
        selectedCategory === item.id && styles.categoryCardSelected,
      ]}
      onPress={() => setSelectedCategory(item.id)}
    >
      <View style={[styles.categoryIcon, selectedCategory === item.id && styles.categoryIconSelected]}>
        <Ionicons 
          name={item.iconUrl ? item.iconUrl.replace('ion-', '') as any : 'construct-outline'} 
          size={24} 
          color={selectedCategory === item.id ? COLORS.white : COLORS.primary} 
        />
      </View>
      <Text 
        style={[
          styles.categoryName,
          selectedCategory === item.id && styles.categoryNameSelected,
        ]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderService = ({ item }: { item: Service }) => (
    <TouchableOpacity
      style={styles.serviceCard}
      onPress={() => router.push(`/services/${item.id}`)}
    >
      <View style={styles.serviceHeader}>
        <View style={styles.serviceIcon}>
          <Ionicons name="sparkles-outline" size={24} color={COLORS.primary} />
        </View>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName}>{item.name}</Text>
          {item.description && (
            <Text style={styles.serviceDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.serviceFooter}>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>From</Text>
          <Text style={styles.price}>${item.basePrice}</Text>
        </View>
        <View style={styles.durationContainer}>
          <Ionicons name="time-outline" size={14} color={COLORS.gray400} />
          <Text style={styles.durationText}>{item.duration} min</Text>
        </View>
      </View>
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
        <Text style={styles.headerTitle}>
          {categoryName || 'All Services'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={COLORS.gray400} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search services..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        )}
      </View>

      {/* Categories Horizontal Scroll */}
      <FlatList
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesList}
      />

      {/* Services List */}
      <FlatList
        data={filteredServices}
        renderItem={renderService}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.servicesList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="apps-outline" size={48} color={COLORS.gray400} />
            <Text style={styles.emptyText}>No services found</Text>
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
    justifyContent: 'space-between',
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
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
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
  categoriesList: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  categoryCard: {
    alignItems: 'center',
    marginRight: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
    minWidth: 80,
    ...SHADOWS.sm,
  },
  categoryCardSelected: {
    backgroundColor: COLORS.primary,
  },
  categoryIcon: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primaryTransparent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  categoryIconSelected: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  categoryName: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: FONTS.weights.medium,
  },
  categoryNameSelected: {
    color: COLORS.white,
  },
  servicesList: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  serviceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  serviceHeader: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryTransparent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  serviceDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  serviceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
    marginRight: SPACING.xxs,
  },
  price: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.primary,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  durationText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
    marginLeft: SPACING.xs,
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
