/**
 * useOfferEngine (React Native)
 *
 * Thin RN-friendly port of dine-frontend/src/hooks/useOfferEngine.js.
 * Uses the pure engine in services/offerEngine.js plus apiClient.getOffers.
 *
 * Inputs:  { restaurantId, cart, subtotal, customerContext?, options? }
 *   customerContext: { customerId?, customerPhone?, isFirstOrder?, customerGroupIds? }
 *   options: { autoApply?: boolean }   // default false
 *
 * Returns: { applicableOffers, selectedOfferId, setSelectedOfferId,
 *            offerDiscount, freeItems, isLoadingOffers, customerGroupIds,
 *            recomputeWithPhone, autoApplied }
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
  const { autoApply = false } = options;

  const [allOffers, setAllOffers] = useState([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [selectedOfferId, setSelectedOfferIdInternal] = useState(null);
  const [autoApplied, setAutoApplied] = useState(false);

  const [phoneOverride, setPhoneOverride] = useState(null);
  const [customerGroupIds, setCustomerGroupIds] = useState([]);
  const groupLookupCacheRef = useRef({}); // phone -> groupIds
  const wasManuallySelectedRef = useRef(false);

  // -------- load offers --------
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    (async () => {
      setIsLoadingOffers(true);
      try {
        // Prefer admin endpoint (full fields); fall back to POS/public.
        let resp = null;
        try {
          resp = await apiClient.getOffers(restaurantId);
        } catch (_) {
          try {
            resp = await apiClient.getActiveOffersForPOS(restaurantId);
          } catch (__) {
            resp = await apiClient.getActiveOffers(restaurantId);
          }
        }
        const offers = (resp?.offers || (Array.isArray(resp) ? resp : []))
          .filter(o => o && o.isActive !== false);
        if (!cancelled) setAllOffers(offers);
      } catch (err) {
        if (!cancelled) setAllOffers([]);
        if (__DEV__) console.warn('[useOfferEngine] load offers failed:', err?.message);
      } finally {
        if (!cancelled) setIsLoadingOffers(false);
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
    if (!restaurantId) { setCustomerGroupIds([]); return; }
    const phone = resolvedContext?.customerPhone;
    const cid = resolvedContext?.customerId;
    if (!phone && !cid) { setCustomerGroupIds([]); return; }

    const cacheKey = `${restaurantId}|${normalizePhone(phone) || ''}|${cid || ''}`;
    if (groupLookupCacheRef.current[cacheKey]) {
      setCustomerGroupIds(groupLookupCacheRef.current[cacheKey]);
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
        ).catch(() => null);
        const groups = res?.groups || [];
        const ids = groups.map(g => g.id).filter(Boolean);
        groupLookupCacheRef.current[cacheKey] = ids;
        if (!cancelled) setCustomerGroupIds(ids);
      } catch (_) {
        if (!cancelled) setCustomerGroupIds([]);
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

    // First pass: base filter (schedule/date/minOrder/scope) ignoring audience.
    const baseFiltered = filterApplicableOffers(
      allOffers.map(o => ({ ...o, audience: { type: 'all' } })), // bypass audience
      { subtotal, cart, context: {}, now }
    );
    // Re-map to original offers
    const baseIds = new Set(baseFiltered.map(o => getOfferId(o)));
    const base = allOffers.filter(o => baseIds.has(getOfferId(o)));

    const out = [];
    for (const offer of base) {
      const audienceType = offer.audience?.type || (offer.isFirstOrderOnly ? 'first_order' : 'all');
      const isPublicAudience = audienceType === 'all' || audienceType === 'first_order';

      if (hasContext) {
        if (matchesAudience(offer, ctxForFilter)) out.push(offer);
        else if (!isPublicAudience) out.push({ ...offer, _requiresLogin: true });
      } else {
        if (isPublicAudience) out.push(offer);
        else out.push({ ...offer, _requiresLogin: true });
      }
    }
    return out;
  }, [allOffers, subtotal, cart, resolvedContext]);

  // -------- auto-apply best --------
  useEffect(() => {
    if (!autoApply) return;
    if (wasManuallySelectedRef.current) return;
    const eligible = applicableOffers.filter(o => !o._requiresLogin);
    if (eligible.length === 0) {
      if (selectedOfferId) {
        setSelectedOfferIdInternal(null);
        setAutoApplied(false);
      }
      return;
    }
    const best = pickBestOffer(eligible, subtotal, cart, resolvedContext || {});
    if (best) {
      const bid = getOfferId(best);
      if (bid !== selectedOfferId) {
        setSelectedOfferIdInternal(bid);
        setAutoApplied(true);
      }
    }
  }, [autoApply, applicableOffers, subtotal, cart, resolvedContext, selectedOfferId]);

  // Clear selection when cart emptied
  useEffect(() => {
    if (cart.length === 0 && selectedOfferId) {
      setSelectedOfferIdInternal(null);
      setAutoApplied(false);
      wasManuallySelectedRef.current = false;
    }
  }, [cart.length, selectedOfferId]);

  // -------- discount + freeItems for current selection --------
  const { offerDiscount, freeItems } = useMemo(() => {
    if (!selectedOfferId) return { offerDiscount: 0, freeItems: [] };
    const offer = allOffers.find(o => getOfferId(o) === selectedOfferId);
    if (!offer) return { offerDiscount: 0, freeItems: [] };
    const res = calculateOfferResult(offer, subtotal, cart, resolvedContext || {});
    return { offerDiscount: res.discount || 0, freeItems: res.freeItems || [] };
  }, [selectedOfferId, allOffers, subtotal, cart, resolvedContext]);

  // -------- public setter --------
  const setSelectedOfferId = useCallback((offerId) => {
    wasManuallySelectedRef.current = !!offerId;
    setAutoApplied(false);
    setSelectedOfferIdInternal(offerId);
  }, []);

  // -------- recompute with phone (for login-to-unlock flow) --------
  const recomputeWithPhone = useCallback((phone) => {
    const n = normalizePhone(phone);
    if (!n) return;
    setPhoneOverride(n);
    // Clear manual selection so auto-apply can re-pick best after group lookup.
    wasManuallySelectedRef.current = false;
  }, []);

  return {
    applicableOffers,
    selectedOfferId,
    setSelectedOfferId,
    offerDiscount,
    freeItems,
    isLoadingOffers,
    customerGroupIds,
    recomputeWithPhone,
    autoApplied,
  };
};

export default useOfferEngine;
