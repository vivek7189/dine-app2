// "Add Items" to a running order: what Tables (and Orders) hand to the Menu tab through AsyncStorage
// `pendingAddItems` — the Menu tab opens that order with its lines in the cart, then Update (send to
// kitchen) or Complete Billing of THAT order.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderItemsSignature } from './orderSignature';

const offerIdsOf = (order) => (Array.isArray(order.offerIds) && order.offerIds.length ? order.offerIds
  : (Array.isArray(order.appliedOffers) ? order.appliedOffers.map(o => o && o.id).filter(Boolean) : []));

// table: { id, name, floorName, floorId } of the order's table (Tables knows it; Orders passes the
// order's own table number).
export function buildPendingAddItems(order, cartItems, table = {}) {
  return {
    tableId: table.id,
    tableNumber: table.name,
    floorName: table.floorName || '',
    floorId: table.floorId || '',
    orderId: order.id,
    dailyOrderId: order.dailyOrderId || order.orderNumber || null,
    chairNumber: order.chairNumber || null,
    // offers already on the order — re-selected in the cart they are not a cashier change
    orderOfferIds: offerIdsOf(order),
    // the order's stored discounts — the cart keeps each one unless the cashier changes it there
    orderDiscounts: {
      offerDiscount: Number(order.offerDiscount ?? order.discountAmount) || 0,
      offerIds: offerIdsOf(order),
      appliedOffers: Array.isArray(order.appliedOffers) ? order.appliedOffers : [],
      selectedOfferName: order.selectedOfferName || null,
      manualDiscount: Number(order.manualDiscount) || 0,
      manualDiscountType: order.manualDiscountType || null,
      manualDiscountValue: order.manualDiscountValue != null ? order.manualDiscountValue : null,
      couponDiscount: Number(order.couponDiscount) || 0,
      couponCode: order.couponCode || null,
      couponId: order.couponId || null,
      loyaltyDiscount: Number(order.loyaltyDiscount) || 0,
      redeemLoyaltyPoints: Number(order.redeemLoyaltyPoints) || 0,
    },
    cartItems,
    // Fingerprint of the items as loaded — sent with the update so the server can refuse (409)
    // if another device changed this order meanwhile, instead of overwriting its items.
    baseItemsSignature: orderItemsSignature(order.items),
    timestamp: Date.now(),
  };
}

export async function storePendingAddItems(order, cartItems, table) {
  await AsyncStorage.setItem('pendingAddItems', JSON.stringify(buildPendingAddItems(order, cartItems, table)));
}
