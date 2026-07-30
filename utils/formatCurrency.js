import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Consistent currency formatting across the app.
 * Reads currency settings from a cached config (set at login / restaurant switch).
 * Falls back to Indian Rupee if no config is loaded yet.
 */

// Module-level cache — updated once at login and on restaurant switch
let _currencyConfig = {
  currencySymbol: '₹',
  symbolPosition: 'before',
  decimalPlaces: 0,
  locale: 'en-IN',
  thousandSeparator: ',',
  decimalSeparator: '.',
  countryCode: 'IN',
};

/**
 * Set currency config from restaurant settings.
 * Call this after login and after restaurant switch.
 */
export function setCurrencyConfig(config) {
  if (!config) return;
  _currencyConfig = {
    currencySymbol: config.currencySymbol || '₹',
    symbolPosition: config.symbolPosition || 'before',
    decimalPlaces: config.decimalPlaces ?? 0,
    locale: config.locale || 'en-IN',
    thousandSeparator: config.thousandSeparator || ',',
    decimalSeparator: config.decimalSeparator || '.',
    countryCode: (config.countryCode || (config.locale || '').split('-')[1] || 'IN').toUpperCase(),
  };
}

/** Current restaurant country code (e.g. 'IN', 'AE') — set at login / switch. */
export function getCountryCode() {
  return _currencyConfig.countryCode;
}

/**
 * Get the current currency symbol.
 */
export function getCurrencySymbol() {
  return _currencyConfig.currencySymbol;
}

/**
 * Load currency config from AsyncStorage (call on app startup).
 */
export async function loadCurrencyConfig() {
  try {
    const cached = await AsyncStorage.getItem('currencySettings');
    if (cached) {
      setCurrencyConfig(JSON.parse(cached));
    }
  } catch {}
}

/**
 * Format an amount with the restaurant's currency symbol and locale.
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const { currencySymbol, symbolPosition, decimalPlaces, locale } = _currencyConfig;

  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });

  return symbolPosition === 'after'
    ? `${formatted}${currencySymbol}`
    : `${currencySymbol}${formatted}`;
}
