export default {
  expo: {
    name: "HomeServices Client",
    slug: "proapp-globalservices",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.homeservices.client",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      package: "com.homeservices.client",
      permissions: [
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.READ_CALENDAR",
        "android.permission.WRITE_CALENDAR",
        "android.permission.RECORD_AUDIO",
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
    },
    plugins: [
      "expo-router",
      "expo-asset",
      "expo-secure-store",
      "expo-notifications",
      [
        "expo-image-picker",
        {
          photosPermission: "The app needs access to your photos to upload profile pictures and service requests.",
          cameraPermission: "The app needs access to your camera to take photos for service requests.",
        },
      ],
      [
        "expo-calendar",
        {
          calendarPermission: "The app needs access to your calendar to schedule services.",
        },
      ],
      "expo-font",
      [
        "@stripe/stripe-react-native",
        {
          merchantIdentifier: "merchant.com.homeservices.client",
          publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
        },
      ],
      "@react-native-community/datetimepicker",
    ],
    scheme: "homeservices-client",
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "df1cf42e-5be9-40d6-bafb-be3c90803b01",
      },
    },
    owner: "shinobi1824s-team",
  },
};
