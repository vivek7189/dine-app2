// ECR / card-terminal purchase for the mobile app.
//
// Mirrors dine-frontend's useEcr/ecrService but only the portable, backend-routed paths that
// work on a phone with no local hardware access:
//   • Sadad Cloud (Qatar) — fully backend-routed (/api/sadad/*): create-order → poll → result.
//   • NAPS Direct — routed through the backend proxy (/api/ecr/proxy); a device can't reach the
//     terminal's local self-signed HTTPS directly without a native module.
//
// doEcrPurchase resolves to a normalized response where ResponseCode '00' === APPROVED,
// matching how the web checks ECR_RESPONSE_CODES.APPROVED.

import apiClient from './api';

export const ECR_APPROVED = '00';
const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 120000; // 2 min, same as web ECR_TIMEOUT_MS

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Normalize a Sadad Cloud poll result into the NAPS-shaped response the UI expects.
function normalizeSadad(poll) {
  const st = poll?.status;
  const approved = st === 'success';
  return {
    ResponseCode: approved ? ECR_APPROVED : (st === 'cancelled' ? '17' : '05'),
    ResponseMessage: approved ? 'Approved' : st === 'failed' ? 'Declined' : st === 'cancelled' ? 'Cancelled' : 'Pending',
    CardType: poll?.cardNetwork || '',
    CardNumber: poll?.payUserAccountId || '',
    ApprovalCode: poll?.authNo || '',
    RRN: poll?.transNo || '',
    Amount: poll?.orderAmount,
    TransactionId: poll?.merchantOrderNo,
    Provider: 'sadad-cloud',
    _status: st,
  };
}

/**
 * Run a card-terminal purchase.
 * @param ecrSettings restaurant.ecrSettings (must include restaurantId)
 * @param amount      number
 * @param merchantOrderNo unique txn id
 * @param onStatus    (status:string) => void  — 'connecting'|'waiting_for_card'|'polling'
 * @returns normalized response; ResponseCode '00' = approved
 */
export async function doEcrPurchase(ecrSettings, amount, merchantOrderNo, onStatus = () => {}) {
  const provider = ecrSettings?.provider || 'naps-direct';
  const restaurantId = ecrSettings?.restaurantId;

  if (provider === 'sadad-cloud') {
    onStatus('connecting');
    await apiClient.ecrSadadCreateOrder({ restaurantId, amount, merchantOrderNo, description: `Order ${merchantOrderNo}` });
    onStatus('waiting_for_card');
    const start = Date.now();
    while (Date.now() - start < TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      let poll;
      try {
        poll = await apiClient.ecrSadadPoll(merchantOrderNo, restaurantId);
      } catch (e) {
        continue; // transient poll error — keep trying until timeout
      }
      onStatus('polling');
      const st = poll?.status;
      if (st === 'success' || st === 'failed' || st === 'cancelled') {
        return normalizeSadad(poll);
      }
    }
    try { await apiClient.ecrSadadCloseOrder({ restaurantId, merchantOrderNo }); } catch (_) {}
    return { ResponseCode: '91', ResponseMessage: 'Timeout — no response from terminal', Provider: 'sadad-cloud' };
  }

  // NAPS Direct via backend proxy
  onStatus('waiting_for_card');
  const payload = {
    Amount: Number(amount).toFixed(2),
    CurrencyCode: '634', // QAR
    TransactionId: merchantOrderNo,
    MerchantId: ecrSettings?.merchantId,
    TerminalId: ecrSettings?.terminalId,
  };
  try {
    const resp = await apiClient.ecrProxy({
      terminalIp: ecrSettings?.terminalIp,
      port: ecrSettings?.port || 8443,
      endpoint: '/purchase',
      payload,
      restaurantId,
    });
    return resp || { ResponseCode: '06', ResponseMessage: 'No response from terminal' };
  } catch (e) {
    return { ResponseCode: '06', ResponseMessage: e?.message || 'Terminal error' };
  }
}
