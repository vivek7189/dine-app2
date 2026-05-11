/**
 * useOfferEngine (React Native)
 *
 * Port of dine-frontend/src/hooks/useOfferEngine.js with multi-offer support.
 * Uses the pure engine in services/offerEngine.js plus apiClient.
 *
 * Inputs:  { restaurantId, cart, subtotal, customerContext?, options? }
 *   customerContext: { customerId?, customerPhone?, isFirstOrder?, customerGroupIds? }
 *   options: { autoApply?: boolean }   // default false — overridden by offerSettings.autoApplyBestOffer
 *
 * Returns: { applicableOffers, selectedOfferId, setSelectedOfferId,
 *            selectedOfferIds, toggleOffer, offerDiscount, selectedOfferName,
 *            freeItems, isLoadingOffers, customerGroupIds,
 *            recomputeWithPhone, autoApplied, resetOffers,
 *            offerSettings, loyaltySettings, calculateDiscountForOffer }
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Pusher from 'pusher-js/react-native';
import apiClient from '../services/api';
import * as offlineStore from '../services/offlineStore';
import {
  calculateOfferResult,
  filterApplicableOffers,
  matchesAudience,
  normalizePhone,
  pickBestOffer,
} from '../services/offerEngine';

const getOfferId = (o) => o?.id || o?._id;

/**
 * Compute ms until the next schedule transition (offer activates or deactivates).
 * Returns null if no scheduled offers exist.
 */
const getNextScheduleTransition = (offers) => {
  const now = new Date();
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let minMs = null;

  for (const offer of offers) {
    if (offer.schedule?.type === 'recurring') {
      const days = offer.schedule.days || [];
      const [startH, startM] = (offer.schedule.startTime || '00:00').split(':').map(Number);
      const [endH, endM] = (offer.schedule.endTime || '23:59').split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (days.includes(currentDay)) {
        if (currentMinutes < startMinutes) {
          const ms = (startMinutes - currentMinutes) * 60000 - (now.getSeconds() * 1000);
          if (minMs === null || ms < minMs) minMs = ms;
        } else if (currentMinutes < endMinutes) {
          const ms = (endMinutes - currentMinutes) * 60000 - (now.getSeconds() * 1000);
          if (minMs === null || ms < minMs) minMs = ms;
        }
      }

      if (!days.includes(currentDay) || currentMinutes >= endMinutes) {
        for (let i = 1; i <= 7; i++) {
          const nextDay = (currentDay + i) % 7;
          if (days.includes(nextDay)) {
            const msToMidnight = ((24 * 60) - currentMinutes) * 60000 - (now.getSeconds() * 1000);
            const msFromMidnight = (i - 1) * 24 * 60 * 60000 + startMinutes * 60000;
            const ms = msToMidnight + msFromMidnight;
            if (minMs === null || ms < minMs) minMs = ms;
            break;
          }
        }
      }
    }

    if (offer.validFrom) {
      const from = new Date(offer.validFrom);
      if (from > now) {
        const ms = from.getTime() - now.getTime();
        if (minMs === null || ms < minMs) minMs = ms;
      }
    }
    if (offer.validUntil) {
      const until = new Date(offer.validUntil);
      until.setHours(23, 59, 59, 999);
      if (until > now) {
        const ms = until.getTime() - now.getTime();
        if (minMs === null || ms < minMs) minMs = ms;
      }
    }
  }

  return minMs;
};

const useOfferEngine = ({
  restaurantId,
  cart = [],
  subtotal = 0,
  customerContext = null,
  options = {},
} = {}) => {
  const { autoApply: autoApplyProp = false } = options;

  const [allOffers, setAllOffers] = useState([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [selectedOfferId, setSelectedOfferIdInternal] = useState(null);
  const [selectedOfferIds, setSelectedOfferIdsInternal] = useState([]);
  const [autoApplied, setAutoApplied] = useState(false);
  const [scheduleCheckKey, setScheduleCheckKey] = useState(0);

  const [offerSettings, setOfferSettings] = useState({
    autoApplyBestOffer: false,
    allowMultipleOffers: false,
    maxOffersAllowed: 1,
  });
  const [loyaltySettings, setLoyaltySettings] = useState({
    enabled: false,
    earnPerAmount: 100,
    pointsEarned: 4,
    redemptionRate: 1,
    maxRedemptionPercent: 20,
    earnPointsOnRedemption: false,
    earnOnFullAmount: false,
  });

  const [phoneOverride, setPhoneOverride] = useState(null);
  const [customerGroupIds, setCustomerGroupIds] = useState([]);
  const [customerGroups, setCustomerGroups] = useState([]); // full objects { id, name, color }
  const groupLookupCacheRef = useRef({}); // phone -> { ids, groups }
  const wasManuallySelectedRef = useRef(false);
  const settingsLoadedRef = useRef(false);

  // -------- load offers --------
  const isFirstOrder = customerContext?.isFirstOrder;
  const loadOffers = useCallback(async (cancelled = { value: false }) => {
    setIsLoadingOffers(true);
    try {
      let resp = null;
      try {
        resp = await apiClient.getOffers(restaurantId);
      } catch (_) {
        try {
          resp = await apiClient.getActiveOffersForPOS(restaurantId, isFirstOrder);
        } catch (__) {
          resp = await apiClient.getActiveOffers(restaurantId);
        }
      }
      const offers = (resp?.offers || (Array.isArray(resp) ? resp : []))
        .filter(o => o && o.isActive !== false);
      if (!cancelled.value) {
        setAllOffers(offers);
        // Cache to SQLite for offline use
        try { offlineStore.saveOffers(restaurantId, offers); } catch (_) {}
      }
    } catch (err) {
      // API failed — try SQLite cache (offline fallback)
      try {
        const cached = offlineStore.getOffers(restaurantId);
        if (cached && cached.length > 0) {
          const active = cached.filter(o => o && o.isActive !== false);
          if (!cancelled.value) setAllOffers(active);
          if (__DEV__) console.warn('[useOfferEngine] using cached offers:', active.length);
        } else {
          if (!cancelled.value) setAllOffers([]);
        }
      } catch (_) {
        if (!cancelled.value) setAllOffers([]);
      }
      if (__DEV__) console.warn('[useOfferEngine] load offers failed, fell back to cache:', err?.message);
    } finally {
      if (!cancelled.value) setIsLoadingOffers(false);
    }
  }, [restaurantId, isFirstOrder]);

  useEffect(() => {
    if (!restaurantId) return;
    const cancelled = { value: false };
    loadOffers(cancelled);
    return () => { cancelled.value = true; };
  }, [loadOffers]);

  // -------- Pusher: real-time offer sync --------
  useEffect(() => {
    if (!restaurantId) return;

    const pusher = new Pusher(process.env.EXPO_PUBLIC_PUSHER_KEY || '4e1f74ae05c66bbc4eec', {
      cluster: process.env.EXPO_PUBLIC_PUSHER_CLUSTER || 'ap2',
    });

    const channel = pusher.subscribe(`restaurant-${restaurantId}`);

    let debounceTimer = null;
    channel.bind('offer-updated', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        // Invalidate in-memory cache so loadOffers fetches fresh data from server
        apiClient.invalidateCache(`/api/offers/`);
        apiClient.invalidateCache(`/api/public/offers/`);
        // Re-fetch offers
        loadOffers({ value: false });
        // Re-fetch offer settings (auto-apply, multi-offer, loyalty)
        try {
          const settingsRes = await apiClient.getCustomerAppSettings(restaurantId);
          if (settingsRes?.settings?.offerSettings) {
            setOfferSettings(prev => ({ ...prev, ...settingsRes.settings.offerSettings }));
          }
          if (settingsRes?.settings?.loyaltySettings) {
            setLoyaltySettings(prev => ({ ...prev, ...settingsRes.settings.loyaltySettings }));
          }
          // Cache updated settings
          try {
            offlineStore.saveOfferSettings(restaurantId, {
              offerSettings: settingsRes?.settings?.offerSettings || null,
              loyaltySettings: settingsRes?.settings?.loyaltySettings || null,
            });
          } catch (_) {}
        } catch (e) {
          if (__DEV__) console.warn('[useOfferEngine] Pusher settings re-fetch failed:', e?.message);
        }
      }, 1000);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channel.unbind_all();
      pusher.unsubscribe(`restaurant-${restaurantId}`);
      pusher.disconnect();
    };
  }, [restaurantId, loadOffers]);

  // -------- load offerSettings + loyaltySettings --------
  useEffect(() => {
    if (!restaurantId || settingsLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const settingsRes = await apiClient.getCustomerAppSettings(restaurantId);
        if (cancelled) return;
        settingsLoadedRef.current = true;
        if (settingsRes?.settings?.offerSettings) {
          setOfferSettings(prev => ({ ...prev, ...settingsRes.settings.offerSettings }));
        }
        if (settingsRes?.settings?.loyaltySettings) {
          setLoyaltySettings(prev => ({ ...prev, ...settingsRes.settings.loyaltySettings }));
        }
        // Cache to SQLite for offline use
        try {
          offlineStore.saveOfferSettings(restaurantId, {
            offerSettings: settingsRes?.settings?.offerSettings || null,
            loyaltySettings: settingsRes?.settings?.loyaltySettings || null,
          });
        } catch (_) {}
      } catch (e) {
        // API failed — try SQLite cache (offline fallback)
        try {
          const cached = offlineStore.getOfferSettings(restaurantId);
          if (cached && !cancelled) {
            settingsLoadedRef.current = true;
            if (cached.offerSettings) setOfferSettings(prev => ({ ...prev, ...cached.offerSettings }));
            if (cached.loyaltySettings) setLoyaltySettings(prev => ({ ...prev, ...cached.loyaltySettings }));
            if (__DEV__) console.warn('[useOfferEngine] using cached offer settings');
          }
        } catch (_) {}
        if (__DEV__) console.warn('[useOfferEngine] settings load failed:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  // -------- resolved context (merge phone override) --------
  const resolvedContext = useMemo(() => {
    const base = customerContext ? { ...customerContext } : null;
    if (phoneOverride) {
      if (base) base.customerPhone = phoneOverride;
      else return { customerPhone: phoneOverride, customerGroupIds };
    }
    if (!base) return null;
    base.customerGroupIds = customerGroupIds;
    return base;
  }, [customerContext, phoneOverride, customerGroupIds]);

  // -------- customer group lookup --------
  // Use customerContext + phoneOverride directly (not resolvedContext) to avoid
  // circular dependency: resolvedContext depends on customerGroupIds which this effect sets.
  // This mirrors the web useOfferEngine approach.
  const groupLookupPhone = phoneOverride || customerContext?.customerPhone;
  const groupLookupCid = customerContext?.customerId;

  useEffect(() => {
    if (!restaurantId) { setCustomerGroupIds(prev => prev.length ? [] : prev); return; }
    const phone = groupLookupPhone;
    const cid = groupLookupCid;
    if (!phone && !cid) { setCustomerGroupIds(prev => prev.length ? [] : prev); setCustomerGroups(prev => prev.length ? [] : prev); return; }

    const cacheKey = `${restaurantId}|${normalizePhone(phone) || ''}|${cid || ''}`;
    if (groupLookupCacheRef.current[cacheKey]) {
      setCustomerGroupIds(groupLookupCacheRef.current[cacheKey].ids);
      setCustomerGroups(groupLookupCacheRef.current[cacheKey].groups);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = [];
        if (phone) params.push(`phone=${encodeURIComponent(phone)}`);
        if (cid) params.push(`customerId=${encodeURIComponent(cid)}`);
        const qs = params.length ? `?${params.join('&')}` : '';
        const res = await apiClient.request(
          `/api/customer-groups/lookup/${restaurantId}${qs}`,
          { method: 'GET' }
        ).catch((err) => {
          if (__DEV__) console.warn('[useOfferEngine] group lookup failed:', err?.message);
          return null;
        });
        const groups = res?.groups || [];
        const ids = groups.map(g => g.id).filter(Boolean);
        const groupObjs = groups.map(g => ({ id: g.id, name: g.name, color: g.color })).filter(g => g.id);
        groupLookupCacheRef.current[cacheKey] = { ids, groups: groupObjs };
        if (!cancelled) {
          setCustomerGroupIds(ids);
          setCustomerGroups(groupObjs);
        }
      } catch (_) {
        if (!cancelled) {
          setCustomerGroupIds(prev => prev.length ? [] : prev);
          setCustomerGroups(prev => prev.length ? [] : prev);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantId, groupLookupPhone, groupLookupCid]);

  // -------- smart schedule timer --------
  // Sets a precise timeout for the next schedule transition (offer activates/deactivates)
  useEffect(() => {
    if (allOffers.length === 0) return;
    const msToNext = getNextScheduleTransition(allOffers);
    if (!msToNext || msToNext <= 0) return;
    // Cap at 1 hour to handle edge cases (app left open overnight)
    const timeout = Math.min(msToNext + 1000, 3600000);
    const timer = setTimeout(() => setScheduleCheckKey(prev => prev + 1), timeout);
    return () => clearTimeout(timer);
  }, [allOffers, scheduleCheckKey]);

  // -------- applicable offers --------
  const applicableOffers = useMemo(() => {
    if (!allOffers.length) return [];
    const hasContext = !!resolvedContext;
    const now = new Date();
    const ctxForFilter = resolvedContext || {};

    // First pass: base filter (schedule/date/minOrder/scope) ignoring audience.
    const baseFiltered = filterApplicableOffers(
      allOffers.map(o => ({ ...o, audience: { type: 'all' } })), // bypass audience
      { subtotal, cart, context: ctxForFilter, now }
    );
    // Re-map to original offers
    const baseIds = new Set(baseFiltered.map(o => getOfferId(o)));
    const base = allOffers.filter(o => baseIds.has(getOfferId(o)));

    const out = [];
    for (const offer of base) {
      // Skip first-order-only offers for repeat customers
      if (offer.isFirstOrderOnly && hasContext && resolvedContext?.isFirstOrder === false) continue;

      const audienceType = offer.audience?.type || (offer.isFirstOrderOnly ? 'first_order' : 'all');
      const isPublicAudience = audienceType === 'all' || audienceType === 'first_order';

      if (hasContext) {
        const matches = matchesAudience(offer, ctxForFilter);
        if (matches) out.push(offer);
      } else {
        if (isPublicAudience) out.push(offer);
      }
    }
    return out;
  }, [allOffers, subtotal, cart, resolvedContext, scheduleCheckKey]);

  // Split applicable offers into generic (everyone/first-order) and personalized (group/customer-targeted)
  const { genericOffers, personalizedOffers } = useMemo(() => {
    const generic = [];
    const personalized = [];
    for (const offer of applicableOffers) {
      const audienceType = offer.audience?.type || (offer.isFirstOrderOnly ? 'first_order' : 'all');
      if (audienceType === 'all' || audienceType === 'first_order') {
        generic.push(offer);
      } else {
        personalized.push(offer);
      }
    }
    if (__DEV__) console.warn('[useOfferEngine] generic:', generic.length, 'personalized:', personalized.length, 'total applicable:', applicableOffers.length, 'customerGroupIds:', customerGroupIds);
    return { genericOffers: generic, personalizedOffers: personalized };
  }, [applicableOffers, customerGroupIds]);

  // -------- helper: calculate discount for a single offer --------
  const calculateDiscountForOffer = useCallback((offer, sub, c, ctx) => {
    if (!offer) return 0;
    const res = calculateOfferResult(offer, sub || subtotal, c || cart, ctx || resolvedContext || {});
    return res?.discount || 0;
  }, [subtotal, cart, resolvedContext]);

  // -------- free items for current selection --------
  const freeItems = useMemo(() => {
    const activeIds = offerSettings.allowMultipleOffers && selectedOfferIds.length > 0
      ? selectedOfferIds
      : (selectedOfferId ? [selectedOfferId] : []);
    if (activeIds.length === 0) return [];
    const all = [];
    for (const oid of activeIds) {
      // Search applicableOffers (not allOffers) so ineligible offers (e.g., first-order for repeat customer) are excluded
      const offer = applicableOffers.find(o => getOfferId(o) === oid);
      if (!offer) continue;
      const res = calculateOfferResult(offer, subtotal, cart, resolvedContext || {});
      if (res.freeItems && res.freeItems.length) all.push(...res.freeItems);
    }
    return all;
  }, [selectedOfferId, selectedOfferIds, applicableOffers, subtotal, cart, offerSettings.allowMultipleOffers, resolvedContext]);

  // -------- compute discount synchronously (useMemo, no stale-render lag) --------
  const { offerDiscount, selectedOfferName } = useMemo(() => {
    // Multi-offer mode
    if (offerSettings.allowMultipleOffers && selectedOfferIds.length > 0) {
      let totalDisc = 0;
      const names = [];
      for (const oid of selectedOfferIds) {
        // Search applicableOffers so ineligible offers are excluded
        const offer = applicableOffers.find(o => getOfferId(o) === oid);
        if (offer) {
          totalDisc += calculateDiscountForOffer(offer, subtotal, cart);
          names.push(offer.name);
        }
      }
      totalDisc = Math.min(totalDisc, subtotal);
      return {
        offerDiscount: Math.round(totalDisc * 100) / 100,
        selectedOfferName: names.join(', '),
      };
    }

    // Single offer mode
    if (!selectedOfferId) {
      return { offerDiscount: 0, selectedOfferName: '' };
    }

    const offer = applicableOffers.find(o => getOfferId(o) === selectedOfferId);
    if (!offer) {
      return { offerDiscount: 0, selectedOfferName: '' };
    }

    const disc = calculateDiscountForOffer(offer, subtotal, cart);
    return { offerDiscount: disc, selectedOfferName: offer.name };
  }, [selectedOfferId, selectedOfferIds, subtotal, cart, applicableOffers, offerSettings.allowMultipleOffers, calculateDiscountForOffer]);

  // -------- auto-apply best offer(s) --------
  useEffect(() => {
    const shouldAutoApply = offerSettings.autoApplyBestOffer || autoApplyProp;
    if (!shouldAutoApply) return;
    if (wasManuallySelectedRef.current) return;

    const eligible = applicableOffers;
    if (eligible.length === 0) {
      if (selectedOfferId) {
        setSelectedOfferIdInternal(null);
        setSelectedOfferIdsInternal([]);
        setAutoApplied(false);
      }
      return;
    }

    if (offerSettings.allowMultipleOffers) {
      // Multi-offer: auto-apply top N by discount
      const maxOffers = offerSettings.maxOffersAllowed || 1;
      const scored = eligible.map(offer => ({
        offer,
        discount: calculateDiscountForOffer(offer, subtotal, cart, resolvedContext || {}),
      })).filter(s => s.discount > 0);
      scored.sort((a, b) => b.discount - a.discount);
      const topN = scored.slice(0, maxOffers);

      if (topN.length > 0) {
        const newIds = topN.map(s => getOfferId(s.offer));
        const currentIds = selectedOfferIds.join(',');
        if (newIds.join(',') !== currentIds) {
          setSelectedOfferIdsInternal(newIds);
          setSelectedOfferIdInternal(newIds[0]);
          setAutoApplied(true);
        }
      }
    } else {
      // Single offer mode: pick the one with maximum discount (priority tiebreaking)
      let bestOffer = null;
      let bestDiscount = 0;
      for (const offer of eligible) {
        const disc = calculateDiscountForOffer(offer, subtotal, cart, resolvedContext || {});
        if (disc > bestDiscount || (disc === bestDiscount && disc > 0 && (offer.priority || 0) > (bestOffer?.priority || 0))) {
          bestDiscount = disc;
          bestOffer = offer;
        }
      }
      if (bestOffer) {
        const bid = getOfferId(bestOffer);
        if (bid !== selectedOfferId) {
          setSelectedOfferIdInternal(bid);
          setAutoApplied(true);
        }
      }
    }
  }, [autoApplyProp, offerSettings.autoApplyBestOffer, offerSettings.allowMultipleOffers, offerSettings.maxOffersAllowed,
      applicableOffers, subtotal, cart, resolvedContext, selectedOfferId, selectedOfferIds, calculateDiscountForOffer]);

  // Clear selection when cart emptied
  useEffect(() => {
    if (cart.length === 0 && (selectedOfferId || selectedOfferIds.length > 0)) {
      setSelectedOfferIdInternal(null);
      setSelectedOfferIdsInternal([]);
      setAutoApplied(false);
      wasManuallySelectedRef.current = false;
    }
  }, [cart.length, selectedOfferId, selectedOfferIds.length]);

  // -------- public setter (single offer) --------
  const setSelectedOfferId = useCallback((offerId) => {
    if (offerId) {
      wasManuallySelectedRef.current = true;
      setAutoApplied(false);
    } else {
      wasManuallySelectedRef.current = false;
    }
    setSelectedOfferIdInternal(offerId);
  }, []);

  // -------- toggle offer in multi-select mode --------
  const toggleOffer = useCallback((offerId) => {
    wasManuallySelectedRef.current = true;
    setAutoApplied(false);
    setSelectedOfferIdsInternal(prev => {
      if (prev.includes(offerId)) {
        const next = prev.filter(id => id !== offerId);
        if (next.length === 0) {
          setSelectedOfferIdInternal(null);
          wasManuallySelectedRef.current = false;
        } else {
          setSelectedOfferIdInternal(next[0]);
        }
        return next;
      }
      // Check max offers cap
      const max = offerSettings.maxOffersAllowed || 1;
      if (prev.length >= max) return prev;
      const next = [...prev, offerId];
      setSelectedOfferIdInternal(next[0]);
      return next;
    });
  }, [offerSettings.maxOffersAllowed]);

  // -------- reset --------
  const resetOffers = useCallback(() => {
    setSelectedOfferIdInternal(null);
    setSelectedOfferIdsInternal([]);
    setAutoApplied(false);
    wasManuallySelectedRef.current = false;
  }, []);

  // -------- recompute with phone (for login-to-unlock flow) --------
  const recomputeWithPhone = useCallback((phone) => {
    const n = normalizePhone(phone);
    if (!n) return;
    setPhoneOverride(n);
    wasManuallySelectedRef.current = false;
  }, []);

  return {
    applicableOffers,
    genericOffers,
    personalizedOffers,
    selectedOfferId,
    setSelectedOfferId,
    selectedOfferIds,
    toggleOffer,
    offerDiscount,
    selectedOfferName,
    freeItems,
    isLoadingOffers,
    customerGroupIds,
    customerGroups,
    recomputeWithPhone,
    autoApplied,
    resetOffers,
    offerSettings,
    loyaltySettings,
    calculateDiscountForOffer,
  };
};

export default useOfferEngine;
