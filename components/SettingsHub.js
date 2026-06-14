import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';

// Settings components
import TaxSettings from './TaxSettings';
import BusinessSettings from './BusinessSettings';
import StaffManagement from './StaffManagement';
import RestaurantManagement from './RestaurantManagement';
import PrintSettings from './PrintSettings';
import PrinterSetup from './PrinterSetup';
import ZonePricingSettings from './ZonePricingSettings';
import CurrencySettings from './CurrencySettings';
import OrderManagementSettings from './OrderManagementSettings';
import BillingSettings from './BillingSettings';
import MultiTierPricingSettings from './MultiTierPricingSettings';

const SETTINGS_CATEGORIES = [
  {
    key: 'restaurants',
    title: 'Restaurants',
    subtitle: 'Manage your restaurants',
    icon: 'storefront-outline',
    roles: ['owner', 'admin'],
  },
  {
    key: 'staff',
    title: 'Staff',
    subtitle: 'Manage staff members & permissions',
    icon: 'people-outline',
    roles: ['owner', 'admin'],
  },
  {
    key: 'print',
    title: 'Print Settings',
    subtitle: 'Configure KOT & bill printing',
    icon: 'print-outline',
    roles: ['owner', 'admin', 'manager', 'cashier', 'waiter', 'employee', 'sales', 'kitchen', 'delivery'],
  },
  {
    key: 'printerSetup',
    title: 'Printer Setup',
    subtitle: 'Connect Bluetooth/WiFi thermal printer',
    icon: 'hardware-chip-outline',
    roles: ['owner', 'admin', 'manager', 'cashier', 'waiter', 'employee', 'sales', 'kitchen', 'delivery'],
  },
  {
    key: 'tax',
    title: 'Tax Management',
    subtitle: 'Tax rates & configuration',
    icon: 'calculator-outline',
    roles: ['owner', 'admin', 'cashier', 'manager'],
  },
  {
    key: 'business',
    title: 'Business Info',
    subtitle: 'Legal name, GSTIN for invoices',
    icon: 'business-outline',
    roles: ['owner', 'admin', 'cashier', 'manager'],
  },
  {
    key: 'zonePricing',
    title: 'Zone Pricing',
    subtitle: 'Zone-based pricing surcharges',
    icon: 'layers-outline',
    roles: ['owner', 'admin'],
  },
  {
    key: 'multiPricing',
    title: 'Multi-Tier Pricing',
    subtitle: 'Zone & channel pricing',
    icon: 'pricetags-outline',
    roles: ['owner', 'admin'],
  },
  {
    key: 'currency',
    title: 'Currency',
    subtitle: 'Currency, locale & symbol',
    icon: 'cash-outline',
    roles: ['owner', 'admin'],
  },
  {
    key: 'orderMgmt',
    title: 'Order Management',
    subtitle: 'Numbering, auto-accept, prep time',
    icon: 'receipt-outline',
    roles: ['owner', 'admin'],
  },
  {
    key: 'billing',
    title: 'Billing Settings',
    subtitle: 'Service charge, tips, split pay & more',
    icon: 'card-outline',
    roles: ['owner', 'admin'],
  },
];

export default function SettingsHub({ restaurantId, user, restaurant, onRestaurantChange }) {
  const [activeSection, setActiveSection] = useState(null);

  const userRole = (user?.role || '').toLowerCase();

  const visibleCategories = SETTINGS_CATEGORIES.filter((cat) => {
    if (!cat.roles.includes(userRole)) return false;
    // Respect pageAccess.printer for print/printerSetup categories
    if ((cat.key === 'print' || cat.key === 'printerSetup') && user?.pageAccess?.printer === false) return false;
    return true;
  });

  if (visibleCategories.length === 0) return null;

  const getActiveTitle = () => {
    const cat = SETTINGS_CATEGORIES.find((c) => c.key === activeSection);
    return cat?.title || 'Settings';
  };

  const renderSettingsContent = () => {
    switch (activeSection) {
      case 'restaurants':
        return <RestaurantManagement restaurantId={restaurantId} />;
      case 'staff':
        return <StaffManagement restaurantId={restaurantId} />;
      case 'print':
        return <PrintSettings restaurantId={restaurantId} />;
      case 'printerSetup':
        return <PrinterSetup restaurantId={restaurantId} />;
      case 'tax':
        return (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <TaxSettings
              restaurantId={restaurantId}
              onTaxSettingsChange={(settings) => console.log('Tax updated:', settings)}
            />
          </ScrollView>
        );
      case 'business':
        return (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <BusinessSettings
              restaurantId={restaurantId}
              countryCode={restaurant?.currencySettings?.countryCode || 'IN'}
              onBusinessSettingsChange={(settings) => {
                if (onRestaurantChange) onRestaurantChange(settings);
              }}
            />
          </ScrollView>
        );
      case 'zonePricing':
        return (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <ZonePricingSettings restaurantId={restaurantId} />
          </ScrollView>
        );
      case 'multiPricing':
        return (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <MultiTierPricingSettings restaurantId={restaurantId} />
          </ScrollView>
        );
      case 'currency':
        return (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <CurrencySettings restaurantId={restaurantId} />
          </ScrollView>
        );
      case 'orderMgmt':
        return (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <OrderManagementSettings restaurantId={restaurantId} />
          </ScrollView>
        );
      case 'billing':
        return (
          <BillingSettings restaurantId={restaurantId} />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Category List */}
      <View style={styles.categoryCard}>
        {visibleCategories.map((cat, index) => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.categoryRow,
              index < visibleCategories.length - 1 && styles.categoryRowBorder,
            ]}
            onPress={() => setActiveSection(cat.key)}
            activeOpacity={0.6}
          >
            <View style={styles.categoryIconWrap}>
              <Ionicons name={cat.icon} size={20} color={Colors.primary} />
            </View>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryTitle}>{cat.title}</Text>
              <Text style={styles.categorySubtitle}>{cat.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Full-Screen Settings Modal */}
      <Modal
        visible={!!activeSection}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveSection(null)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setActiveSection(null)}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{getActiveTitle()}</Text>
            <View style={styles.backButton} />
          </View>

          {/* Modal Body */}
          <View style={styles.modalBody}>
            {renderSettingsContent()}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
  categoryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  categoryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  categorySubtitle: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textDark,
    textAlign: 'center',
  },
  modalBody: {
    flex: 1,
  },
  scrollPadding: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
});
