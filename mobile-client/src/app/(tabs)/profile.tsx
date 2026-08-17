import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, FONTS } from '@/constants/theme';
import { Button } from '@/components/ui';

// Datos mock del usuario (reemplazar con datos reales del store o contexto)
const mockUser = {
  firstName: 'Juan',
  lastName: 'Pérez',
  email: 'juan.perez@email.com',
  phone: '+34 600 000 000',
  avatar: null, // URL de la imagen de perfil
};

type MenuItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress?: () => void;
  showArrow?: boolean;
};

const MenuItem: React.FC<MenuItemProps> = ({ icon, title, onPress, showArrow = true }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} disabled={!onPress}>
    <View style={styles.menuItemLeft}>
      <Ionicons name={icon} size={22} color={COLORS.textSecondary} />
      <Text style={styles.menuItemTitle}>{title}</Text>
    </View>
    {showArrow && <Ionicons name="chevron-forward" size={20} color={COLORS.border} />}
  </TouchableOpacity>
);

export default function ProfileScreen() {
  const router = useRouter();

  const handleLogout = async () => {
    // TODO: Implementar lógica de logout
    // await authStore.logout();
    router.replace('/auth/login');
  };

  const handleEditProfile = () => {
    router.push('/profile/edit'); // Crear esta ruta si es necesario
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header con información del usuario */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {mockUser.avatar ? (
              <Image source={{ uri: mockUser.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color={COLORS.primary} />
              </View>
            )}
            <TouchableOpacity style={styles.editAvatarButton} onPress={handleEditProfile}>
              <Ionicons name="camera" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.userName}>
            {mockUser.firstName} {mockUser.lastName}
          </Text>
          <Text style={styles.userEmail}>{mockUser.email}</Text>
          
          <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
            <Ionicons name="pencil" size={18} color={COLORS.primary} />
            <Text style={styles.editButtonText}>Editar Perfil</Text>
          </TouchableOpacity>
        </View>

        {/* Sección de Información */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información</Text>
          <View style={styles.menuContainer}>
            <MenuItem icon="mail-outline" title="Correo Electrónico" />
            <MenuItem icon="call-outline" title="Teléfono" />
            <MenuItem icon="location-outline" title="Dirección" />
          </View>
        </View>

        {/* Sección de Reservas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reservas</Text>
          <View style={styles.menuContainer}>
            <MenuItem
              icon="calendar-outline"
              title="Mis Reservas"
              onPress={() => router.push('/(tabs)/bookings')}
            />
            <MenuItem icon="time-outline" title="Historial" />
          </View>
        </View>

        {/* Sección de Configuración */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuración</Text>
          <View style={styles.menuContainer}>
            <MenuItem icon="notifications-outline" title="Notificaciones" />
            <MenuItem icon="lock-closed-outline" title="Privacidad y Seguridad" />
            <MenuItem icon="language-outline" title="Idioma" />
            <MenuItem icon="moon-outline" title="Tema Oscuro" />
          </View>
        </View>

        {/* Sección de Soporte */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Soporte</Text>
          <View style={styles.menuContainer}>
            <MenuItem icon="help-circle-outline" title="Ayuda y FAQ" />
            <MenuItem icon="chatbubble-ellipses-outline" title="Contactar Soporte" />
            <MenuItem icon="star-outline" title="Calificar App" />
            <MenuItem icon="document-text-outline" title="Términos y Privacidad" />
          </View>
        </View>

        {/* Botón de Logout */}
        <View style={styles.logoutSection}>
          <Button
            title="Cerrar Sesión"
            onPress={handleLogout}
            variant="outline"
          />
          <Text style={styles.versionText}>Versión 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.border,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    ...FONTS.heading,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 20,
  },
  editButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: 4,
  },
  section: {
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  menuContainer: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  menuItemTitle: {
    fontSize: 16,
    color: COLORS.text,
  },
  logoutSection: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginTop: SPACING.md,
  },
});
