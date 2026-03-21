/**
 * useContractResolution
 *
 * Manages member card lookup state for the OPD booking form.
 * Calls /api/clinic-opd/member-lookup (clinic.book permission, no CONTRACTS_VIEW needed).
 *
 * Safety rules:
 *   - Only fires when cardNumber.length >= 3
 *   - Resets resolved state when paymentType changes
 *   - Falls back to today on missing appointmentDate
 *   - Never exposes lookup logic in the page component
 */

import { useState, useCallback, useRef } from "react";

export interface ResolvedContractMember {
  memberId: string;
  memberCardNumber: string;
  memberName: string;
  contractId: string;
  contractName: string;
  companyId: string;
  companyName: string;
  coverageUntil: string;
}

export interface ContractResolutionState {
  cardNumber: string;
  resolved: ResolvedContractMember | null;
  isLooking: boolean;
  error: string | null;
}

export interface UseContractResolutionReturn {
  state: ContractResolutionState;
  setCardNumber: (v: string) => void;
  lookup: (appointmentDate?: string) => Promise<void>;
  clear: () => void;
}

const INITIAL_STATE: ContractResolutionState = {
  cardNumber: "",
  resolved:   null,
  isLooking:  false,
  error:      null,
};

export function useContractResolution(): UseContractResolutionReturn {
  const [state, setState] = useState<ContractResolutionState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const setCardNumber = useCallback((v: string) => {
    setState(prev => ({ ...prev, cardNumber: v, error: null, resolved: prev.resolved?.memberCardNumber === v ? prev.resolved : null }));
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const lookup = useCallback(async (appointmentDate?: string) => {
    const card = state.cardNumber.trim();
    if (card.length < 3) {
      setState(prev => ({ ...prev, error: "أدخل 3 أحرف على الأقل للبحث", resolved: null }));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState(prev => ({ ...prev, isLooking: true, error: null, resolved: null }));

    try {
      const date = appointmentDate && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
        ? appointmentDate
        : new Date().toISOString().slice(0, 10);

      const res = await fetch(
        `/api/clinic-opd/member-lookup?cardNumber=${encodeURIComponent(card)}&date=${date}`,
        { credentials: "include", signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      if (res.status === 404) {
        setState(prev => ({ ...prev, isLooking: false, resolved: null, error: "لم يُعثر على بطاقة منتسب نشطة بهذا الرقم — تحقق من الرقم والتاريخ" }));
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState(prev => ({ ...prev, isLooking: false, resolved: null, error: body.message ?? "خطأ في البحث" }));
        return;
      }

      const data: ResolvedContractMember = await res.json();
      setState(prev => ({ ...prev, isLooking: false, resolved: data, error: null }));
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setState(prev => ({ ...prev, isLooking: false, resolved: null, error: "فشل الاتصال بالخادم — حاول مجدداً" }));
    }
  }, [state.cardNumber]);

  return { state, setCardNumber, lookup, clear };
}
