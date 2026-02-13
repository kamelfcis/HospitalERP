import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useRef } from "react";

interface UseApiMutationOptions<TData = unknown, TVariables = unknown> {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string | ((variables: TVariables) => string);
  successMessage?: string;
  invalidateKeys?: string[][];
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  parseResponse?: boolean;
}

export function useApiMutation<TData = unknown, TVariables = unknown>(
  options: UseApiMutationOptions<TData, TVariables>
) {
  const { toast } = useToast();
  const submittingRef = useRef(false);

  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      if (submittingRef.current) {
        throw new Error("العملية قيد التنفيذ بالفعل");
      }
      submittingRef.current = true;

      try {
        const url =
          typeof options.url === "function"
            ? options.url(variables)
            : options.url;

        const hasBody = options.method !== "DELETE";
        const res = await apiRequest(
          options.method,
          url,
          hasBody ? variables : undefined
        );

        if (options.parseResponse !== false) {
          const text = await res.text();
          if (text) {
            try {
              return JSON.parse(text) as TData;
            } catch {
              return text as unknown as TData;
            }
          }
        }
        return undefined as unknown as TData;
      } finally {
        submittingRef.current = false;
      }
    },
    onSuccess: (data, variables) => {
      if (options.successMessage) {
        toast({
          title: options.successMessage,
        });
      }

      if (options.invalidateKeys) {
        for (const key of options.invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }

      options.onSuccess?.(data, variables);
    },
    onError: (error: Error, variables) => {
      toast({
        title: error.message,
        variant: "destructive",
      });

      options.onError?.(error, variables);
    },
  });

  return {
    ...mutation,
    isSubmitting: mutation.isPending,
  };
}
