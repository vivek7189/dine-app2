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
import apiClient from '../services/api';
import {
  calculateOfferResult,
  filterApplicableOffers,
  matchesAudience,
  normalizePhone,
  pickBestOffer,
} from '../services/offerEngine';

const getOfferId = (o) => o?.id || o?._id;

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
  const [offerDiscount, setOfferDiscount] = useState(0);
  const [selectedOfferName, setSelectedOfferName] = useState('');

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
      if (!cancelled.value) setAllOffers(offers);
    } catch (err) {
      if (!cancelled.value) setAllOffers([]);
      if (__DEV__) console.warn('[useOfferEngine] load offers failed:', err?.message);
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

  // -------- load offerSettings + loyaltySettings --------
  useEffect(() => {
    if (!restaurantId || settingsLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const settingsRes = await apiClient.getPublicCustomerAppSettings(restaurantId);
        if (cancelled) return;
        settingsLoadedRef.current = true;
        if (settingsRes?.settings?.offerSettings) {
          setOfferSettings(prev => ({ ...prev, ...settingsRes.settings.offerSettings }));
        }
        if (settingsRes?.settings?.loyaltySettings) {
          setLoyaltySettings(prev => ({ ...prev, ...settingsRes.settings.loyaltySettings }));
        }
      } catch (e) {
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
  useEffect(() => {
    if (__DEV__) console.warn('[useOfferEngine] group lookup effect - restaurantId:', restaurantId, 'resolvedContext:', JSON.stringify(resolvedContext));
    if (!restaurantId) { setCustomerGroupIds(prev => prev.length ? [] : prev); return; }
    const phone = resolvedContext?.customerPhone;
    const cid = resolvedContext?.customerId;
    if (!phone && !cid) { if (__DEV__) console.warn('[useOfferEngine] no phone/cid, skipping group lookup'); setCustomerGroupIds(prev => prev.length ? [] : prev); setCustomerGroups(prev => prev.length ? [] : prev); return; }

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
          if (__DEV__) console.warn('[useOfferEngine] group lookup failed:', err?.message, 'URL:', `/api/customer-groups/lookup/${restaurantId}${qs}`);
          return null;
        });
        if (__DEV__) console.warn('[useOfferEngine] group lookup result:', JSON.stringify(res));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, resolvedContext?.customerPhone, resolvedContext?.customerId]);

  // -------- applicable offers --------
  const applicableOffers = useMemo(() => {
    if (!allOffers.length) return [];
    const hasContext = !!resolvedContext;
    const now = new Date();
    const ctxForFilter = resolvedContext || {};

    if (__DEV__) console.warn('[useOfferEngine] allOffers:', allOffers.length, 'hasContext:', hasContext, 'resolvedContext:', JSON.stringify(resolvedContext));
    if (__DEV__) allOffers.forEach(o => console.log('[useOfferEngine] offer:', o.name, 'audience:', JSON.stringify(o.audience), 'isFirstOrderOnly:', o.isFirstOrderOnly));

    // First pass: base filter (schedule/date/minOrder/scope) ignoring audience.
    const baseFiltered = filterApplicableOffers(
      allOffers.map(o => ({ ...o, audience: { type: 'all' } })), // bypass audience
      { subtotal, cart, context: ctxForFilter, now }
    );
    // Re-map to original offers
    const baseIds = new Set(baseFiltered.map(o => getOfferId(o)));
    const base = allOffers.filter(o => baseIds.has(getOfferId(o)));

    if (__DEV__) console.warn('[useOfferEngine] baseFiltered:', baseFiltered.length, 'base:', base.length);

    const out = [];
    for (const offer of base) {
      // Skip first-order-only offers for repeat customers
      if (offer.isFirstOrderOnly && hasContext && resolvedContext?.isFirstOrder === false) continue;

      const audienceType = offer.audience?.type || (offer.isFirstOrderOnly ? 'first_order' : 'all');
      const isPublicAudience = audienceType === 'all' || audienceType === 'first_order';

      if (hasContext) {
        const matches = matchesAudience(offer, ctxForFilter);
        if (__DEV__) console.warn('[useOfferEngine] offer:', offer.name, 'audienceType:', audienceType, 'matches:', matches);
        if (matches) out.push(offer);
      } else {
        if (isPublicAudience) out.push(offer);
      }
    }
    if (__DEV__) console.warn('[useOfferEngine] applicable:', out.length, out.map(o => o.name));
    return out;
  }, [allOffers, subtotal, cart, resolvedContext]);

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
      const offer = allOffers.find(o => getOfferId(o) === oid);
      if (!offer) continue;
      const res = calculateOfferResult(offer, subtotal, cart, resolvedContext || {});
      if (res.freeItems && res.freeItems.length) all.push(...res.freeItems);
    }
    return all;
  }, [selectedOfferId, selectedOfferIds, allOffers, subtotal, cart, offerSettings.allowMultipleOffers, resolvedContext]);

  // -------- update discount when selection or subtotal changes --------
  useEffect(() => {
    // Multi-offer mode
    if (offerSettings.allowMultipleOffers && selectedOfferIds.length > 0) {
      let totalDisc = 0;
      const names = [];
      for (const oid of selectedOfferIds) {
        const offer = allOffers.find(o => getOfferId(o) === oid);
        if (offer) {
          totalDisc += calculateDiscountForOffer(offer, subtotal, cart);
          names.push(offer.name);
        }
      }
      totalDisc = Math.min(totalDisc, subtotal);
      setOfferDiscount(Math.round(totalDisc * 100) / 100);
      setSelectedOfferName(names.join(', '));
      return;
    }

    // Single offer mode
    if (!selectedOfferId) {
      setOfferDiscount(0);
      setSelectedOfferName('');
      return;
    }

    const offer = allOffers.find(o => getOfferId(o) === selectedOfferId);
    if (!offer) {
      setOfferDiscount(0);
      setSelectedOfferName('');
      return;
    }

    setSelectedOfferName(offer.name);
    const disc = calculateDiscountForOffer(offer, subtotal, cart);
    setOfferDiscount(disc);
  }, [selectedOfferId, selectedOfferIds, subtotal, cart, allOffers, offerSettings.allowMultipleOffers, calculateDiscountForOffer]);

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
      // Single offer: pick best
      const best = pickBestOffer(eligible, subtotal, cart, resolvedContext || {});
      if (best) {
        const bid = getOfferId(best);
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
      setOfferDiscount(0);
      setSelectedOfferName('');
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
    setOfferDiscount(0);
    setSelectedOfferName('');
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
