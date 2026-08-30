import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { apiClient } from '@/services/api';
import { PAYMENT_CURRENCY } from '@/constants/config';
import { useTranslation } from 'react-i18next';

export const ServiceDetailScreen: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [service, setService] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const money = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency: PAYMENT_CURRENCY }), []);

  useEffect(() => {
    let active = true;
    apiClient.getServiceById(id)
      .then((data) => { if (active) setService(data); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (isLoading) return <SafeAreaView style={styles.container}><ActivityIndicator style={{ flex: 1 }} size="large" color={COLORS.primary} /></SafeAreaView>;
  if (!service) return <SafeAreaView style={styles.container}><View style={styles.content}><Text style={styles.title}>{t('common.notFound')}</Text><Button title={t('common.goBack')} onPress={() => router.back()} /></View></SafeAreaView>;
  const imageSource = service.imageUrl ? { uri: service.imageUrl } : require('../../../assets/icon.png');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <View style={styles.imageGallery}>
          <Image source={imageSource} style={styles.mainImage} resizeMode="cover" />
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Service Info */}
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.category}>{service.category?.name}</Text>
              <Text style={styles.title}>{service.name}</Text>
            </View>
            <View style={styles.priceBadge}>
              <Text style={styles.priceLabel}>{t('professionalDetail.startingAt')}</Text>
              <Text style={styles.price}>{money.format(Number(service.basePrice))}</Text>
            </View>
          </View>

          {/* Duration */}
          <View style={styles.metaInfo}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={20} color={COLORS.primary} />
              <Text style={styles.metaText}>{service.duration} minutes</Text>
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.sectionContent}>{service.description}</Text>
          </View>

          {/* Bottom Spacing */}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.infoContainer}>
          <Text style={styles.durationLabel}>Duration</Text>
          <Text style={styles.durationValue}>{service.duration} min</Text>
        </View>
        <Button
          title="Book This Service"
          onPress={() => service.professionalId
            ? router.push(`/booking/new?professionalId=${service.professionalId}&serviceId=${service.id}`)
            : router.push(`/search?categoryId=${service.categoryId}`)}
          style={styles.bookButton}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  imageGallery: {
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: 300,
  },
  thumbnailContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BORDER_RADIUS.full,
    padding: SPACING.sm,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  category: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: FONTS.weights.medium,
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: SPACING.md,
  },
  priceBadge: {
    backgroundColor: COLORS.primaryTransparent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: FONTS.sizes.xxs,
    color: COLORS.primary,
    fontWeight: FONTS.weights.medium,
  },
  price: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.primary,
  },
  metaInfo: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.lg,
  },
  metaText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  sectionContent: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  includeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  includeText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  infoContainer: {
    flex: 1,
  },
  durationLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
  durationValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  bookButton: {
    flex: 2,
    marginLeft: SPACING.md,
  },
});
