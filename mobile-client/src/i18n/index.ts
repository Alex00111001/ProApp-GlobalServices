import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import es from './locales/es'; import en from './locales/en'; import pt from './locales/pt';

export type AppLanguage = 'es' | 'en' | 'pt';
export const LANGUAGE_STORAGE_KEY = 'app_language';
const supported: AppLanguage[] = ['es','en','pt'];
const deviceCode = Localization.getLocales()[0]?.languageCode as AppLanguage | undefined;
const initialLanguage: AppLanguage = deviceCode && supported.includes(deviceCode) ? deviceCode : 'es';

i18n.use(initReactI18next).init({ resources:{es:{translation:es},en:{translation:en},pt:{translation:pt}}, lng:initialLanguage, fallbackLng:'es', interpolation:{escapeValue:false}, compatibilityJSON:'v4' });
AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then(value=>{if(value&&supported.includes(value as AppLanguage))i18n.changeLanguage(value);});

export async function setAppLanguage(language: AppLanguage){ await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY,language); await i18n.changeLanguage(language); }
export default i18n;
