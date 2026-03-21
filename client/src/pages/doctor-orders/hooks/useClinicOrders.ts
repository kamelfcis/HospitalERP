import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const GROUPED_KEY = "/api/clinic-orders/grouped";

export function useClinicOrders() {
  const { toast } = useToast();

  const executeMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/clinic-orders/${orderId}/execute`, {}).then((r) => r.json()),
    onSuccess: (data) => {
      toast({ title: "تم تنفيذ الأمر بنجاح", description: `رقم الفاتورة: ${data.invoiceNumber}` });
      queryClient.invalidateQueries({ queryKey: [GROUPED_KEY] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطأ في التنفيذ", description: err.message });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("PATCH", `/api/clinic-appointments/${orderId}/status`, { status: "cancelled" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GROUPED_KEY] });
    },
  });

  return { executeMutation, cancelMutation };
}
