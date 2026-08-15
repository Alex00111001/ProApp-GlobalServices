import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';

import { Button } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { ProfessionalProfile, Portfolio, Certification } from '@/types';

type RootStackParamList = {
  ProfessionalDetail: { id: string };
  BookingFlow: { professionalId: string; serviceId?: string };
};

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'ProfessionalDetail'>;

interface ProfessionalDetailScreenProps {
  professional: ProfessionalProfile & {
    services?: any[];
    reviews?: any[];
  };
}

export const ProfessionalDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const { id } = route.params;

  // Mock data - will be replaced with API call
  const professional: ProfessionalDetailScreenProps['professional'] = {
    id,
    userId: '1',
    bio: 'Professional electrician with over 10 years of experience. Specialized in residential and commercial electrical installations, repairs, and maintenance. Licensed and insured.',
    hourlyRate: 45,
    yearsOfExperience: 10,
    serviceRadius: 25,
    rating: 4.8,
    totalReviews: 127,
    totalJobs: 350,
    isVerified: true,
    isApproved: true,
    user: {
      id: '1',
      email: 'john@example.com',
      name: 'John Martinez',
      phone: '+1234567890',
      role: 'PROFESSIONAL',
      avatar: 'https://via.placeholder.com/150',
      createdAt: '2023-01-01',
      updatedAt: '2024-01-01',
    },
    categories: [
      { id: '1', name: 'Electricity', description: 'Electrical services', icon: 'flash-outline', isActive: true, subcategories: [] },
    ],
    portfolio: [
      { id: '1', professionalId: '1', imageUrl: 'https://via.placeholder.com/300', caption: 'Kitchen installation', createdAt: '2024-01-01' },
      { id: '2', professionalId: '1', imageUrl: 'https://via.placeholder.com/300', caption: 'Bathroom renovation', createdAt: '2024-01-02' },
    ],
    certifications: [
      { id: '1', professionalId: '1', name: 'Licensed Electrician', issuingOrganization: 'State Board', issueDate: '2020-01-01', expiryDate: '2025-01-01', certificateUrl: '' },
    ],
    availability: [],
    services: [
      { id: '1', name: 'Electrical Installation', description: 'Complete electrical installation for homes', price: 150, duration: 120 },
      { id: '2', name: 'Electrical Repair', description: 'Fix any electrical issues', price: 75, duration: 60 },
      { id: '3', name: 'Lighting Installation', description: 'Install indoor/outdoor lighting', price: 50, duration: 45 },
    ],
    reviews: [
      { id: '1', clientId: '1', professionalId: '1', rating: 5, comment: 'Excellent work! Very professional and punctual.', createdAt: '2024-01-15' },
      { id: '2', clientId: '2', professionalId: '1', rating: 4, comment: 'Good service, would recommend.', createdAt: '2024-01-10' },
    ],
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, index) => (
      <Ionicons
        key={index}
        name={index < Math.floor(rating) ? 'star' : 'star-outline'}
        size={16}
        color={COLORS.warning}
      />
    ));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Image */}
        <View style={styles.headerImageContainer}>
          <Image
            source={{ uri: professional.user.avatar || 'https://via.placeholder.com/400x200' }}
            style={styles.headerImage}
          />
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.favoriteButton}>
            <Ionicons name="heart-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Profile Info */}
        <View style={styles.profileInfo}>
          <Image
            source={{ uri: professional.user.avatar || 'https://via.placeholder.com/100' }}
            style={styles.avatar}
          />
          <View style={styles.nameContainer}>
            <Text style={styles.name}>{professional.user.name}</Text>
            <View style={styles.ratingContainer}>
              <View style={styles.stars}>{renderStars(professional.rating)}</View>
              <Text style={styles.ratingText}>{professional.rating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({professional.totalReviews} reviews)</Text>
            </View>
          </View>
        </View>

        {/* Badges */}
        <View style={styles.badgeContainer}>
          {professional.isVerified && (
            <View style={[styles.badge, styles.verifiedBadge]}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={[styles.badgeText, styles.verifiedText]}>Verified</Text>
            </View>
          )}
          {professional.isApproved && (
            <View style={[styles.badge, styles.approvedBadge]}>
              <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
              <Text style={[styles.badgeText, styles.approvedText]}>Approved</Text>
            </View>
          )}
          <View style={[styles.badge, styles.experienceBadge]}>
            <Ionicons name="briefcase" size={16} color={COLORS.primary} />
            <Text style={[styles.badgeText, styles.experienceText]}>
              {professional.yearsOfExperience}+ years
            </Text>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.sectionContent}>{professional.bio}</Text>
        </View>

        {/* Services Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>
          {professional.services?.map((service) => (
            <TouchableOpacity key={service.id} style={styles.serviceCard}>
              <View style={styles.serviceHeader}>
                <Text style={styles.serviceName}>{service.name}</Text>
                <Text style={styles.servicePrice}>${service.price}</Text>
              </View>
              <Text style={styles.serviceDescription}>{service.description}</Text>
              <View style={styles.serviceMeta}>
                <Ionicons name="time-outline" size={14} color={COLORS.gray400} />
                <Text style={styles.serviceDuration}>{service.duration} min</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Portfolio Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Portfolio</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {professional.portfolio.map((item) => (
              <View key={item.id} style={styles.portfolioItem}>
                <Image source={{ uri: item.imageUrl }} style={styles.portfolioImage} />
                {item.caption && (
                  <Text style={styles.portfolioCaption} numberOfLines={1}>
                    {item.caption}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Reviews Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews ({professional.totalReviews})</Text>
          {professional.reviews?.slice(0, 3).map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View style={styles.stars}>{renderStars(review.rating)}</View>
                <Text style={styles.reviewDate}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.reviewComment}>{review.comment}</Text>
            </View>
          ))}
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Starting at</Text>
          <Text style={styles.priceValue}>${professional.hourlyRate}/hr</Text>
        </View>
        <Button
          title="Book Now"
          onPress={() => navigation.navigate('BookingFlow' as never, { professionalId: professional.id })}
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
  headerImageContainer: {
    position: 'relative',
    height: 200,
  },
  headerImage: {
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
  favoriteButton: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BORDER_RADIUS.full,
    padding: SPACING.sm,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  nameContainer: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  name: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stars: {
    flexDirection: 'row',
    marginRight: SPACING.xs,
  },
  ratingText: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
    marginRight: SPACING.xxs,
  },
  reviewCount: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textTertiary,
  },
  badgeContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
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
  experienceBadge: {
    backgroundColor: COLORS.gray100,
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
  experienceText: {
    color: COLORS.textSecondary,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.sm,
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
  serviceCard: {
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  serviceName: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  servicePrice: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.primary,
  },
  serviceDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  serviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceDuration: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
    marginLeft: SPACING.xs,
  },
  portfolioItem: {
    marginRight: SPACING.md,
    width: 150,
  },
  portfolioImage: {
    width: 150,
    height: 150,
    borderRadius: BORDER_RADIUS.md,
  },
  portfolioCaption: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  reviewCard: {
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  reviewDate: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
  reviewComment: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
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
  priceContainer: {
    flex: 1,
  },
  priceLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
  priceValue: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  bookButton: {
    flex: 2,
    marginLeft: SPACING.md,
  },
});
