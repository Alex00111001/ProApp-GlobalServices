import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '@/constants/theme';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

type MenuItemProps = { icon: keyof typeof Ionicons.glyphMap; title: string; value?: string; onPress: () => void };
const MenuItem = ({ icon, title, value, onPress }: MenuItemProps) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress}>
    <View style={styles.menuItemLeft}><Ionicons name={icon} size={22} color={COLORS.textSecondary} /><View style={styles.menuText}><Text style={styles.menuItemTitle}>{title}</Text>{value ? <Text style={styles.menuValue} numberOfLines={2}>{value}</Text> : null}</View></View>
    <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
  </TouchableOpacity>
);

export default function ProfileTab() {
  const router = useRouter();
  const { user, profile, loadUser, logout, isLoading } = useAuthStore();
  useFocusEffect(useCallback(() => { loadUser(); }, [loadUser]));
  const currentUser = user as any;
  const currentProfile = profile as any;
  const name = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
  const avatarUrl = currentUser?.avatarUrl || currentUser?.avatar;
  const handleLogout = () => Alert.alert('Cerrar sesión', '¿Deseas cerrar tu sesión?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: async () => { await logout(); router.replace('/auth/login'); } },
  ]);

  return <SafeAreaView style={styles.container} edges={['top']}><ScrollView>
    <View style={styles.header}>
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Ionicons name="person" size={44} color={COLORS.primary} /></View>}
      <Text style={styles.userName}>{name || 'Mi perfil'}</Text><Text style={styles.userEmail}>{currentUser?.email}</Text>
      <TouchableOpacity style={styles.editButton} onPress={() => router.push('/profile/edit' as any)}><Ionicons name="pencil" size={17} color={COLORS.primary} /><Text style={styles.editText}>Editar perfil</Text></TouchableOpacity>
    </View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Información personal</Text><View style={styles.card}>
      <MenuItem icon="call-outline" title="Teléfono" value={currentUser?.phone || 'Sin registrar'} onPress={() => router.push('/profile/edit' as any)} />
      <MenuItem icon="location-outline" title="Dirección" value={currentProfile?.address || 'Sin registrar'} onPress={() => router.push('/profile/edit' as any)} />
    </View></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Cuenta</Text><View style={styles.card}>
      <MenuItem icon="lock-closed-outline" title="Cambiar contraseña" onPress={() => router.push('/profile/security' as any)} />
      <MenuItem icon="notifications-outline" title="Notificaciones" onPress={() => router.push('/notifications')} />
      <MenuItem icon="calendar-outline" title="Mis reservas" onPress={() => router.push('/(tabs)/bookings')} />
    </View></View>
    <View style={styles.logout}><Button title="Cerrar sesión" variant="outline" loading={isLoading} onPress={handleLogout} fullWidth /><Text style={styles.version}>Versión 1.0.0</Text></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.background},header:{alignItems:'center',padding:SPACING.xxl},avatar:{width:96,height:96,borderRadius:48},avatarPlaceholder:{width:96,height:96,borderRadius:48,backgroundColor:COLORS.primaryTransparent,alignItems:'center',justifyContent:'center'},userName:{fontSize:FONTS.sizes.xxl,fontWeight:'700',color:COLORS.textPrimary,marginTop:SPACING.md,textAlign:'center'},userEmail:{color:COLORS.textSecondary,marginTop:SPACING.xs,textAlign:'center',flexShrink:1},editButton:{flexDirection:'row',gap:SPACING.xs,marginTop:SPACING.md,paddingHorizontal:SPACING.lg,paddingVertical:SPACING.sm,backgroundColor:COLORS.primaryTransparent,borderRadius:BORDER_RADIUS.full},editText:{color:COLORS.primary,fontWeight:'600'},section:{paddingHorizontal:SPACING.lg,marginBottom:SPACING.lg},sectionTitle:{fontSize:FONTS.sizes.sm,fontWeight:'600',color:COLORS.textSecondary,textTransform:'uppercase',marginBottom:SPACING.sm},card:{backgroundColor:COLORS.surface,borderRadius:BORDER_RADIUS.lg,overflow:'hidden'},menuItem:{minHeight:68,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:SPACING.lg,borderBottomWidth:1,borderBottomColor:COLORS.border},menuItemLeft:{flexDirection:'row',alignItems:'center',gap:SPACING.md,flex:1,minWidth:0},menuText:{flex:1,minWidth:0},menuItemTitle:{fontSize:FONTS.sizes.md,color:COLORS.textPrimary,flexShrink:1},menuValue:{fontSize:FONTS.sizes.sm,color:COLORS.textSecondary,marginTop:2,flexShrink:1},logout:{padding:SPACING.lg,marginBottom:100},version:{textAlign:'center',color:COLORS.textTertiary,fontSize:FONTS.sizes.xs,marginTop:SPACING.md}
});
