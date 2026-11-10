import { useQuery } from "@tanstack/react-query";
import { lotService, healthService, adminService } from "../services/api";
import { hasPermission } from "../utils/permissions";
import { useAuth } from "../context/AuthContext";
export function useLots() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["lots", user?.username],
    queryFn: lotService.list,
  });
}
export function useLot(id: string) {
  return useQuery({
    queryKey: ["lot", id],
    queryFn: () => lotService.get(id),
    enabled: !!id,
  });
}
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: healthService,
    staleTime: 30000,
  });
}
export function useAllDetails(enabled = true) {
  const lots = useLots();
  const details = useQuery({
    queryKey: [
      "lot-details",
      lots.data?.map((l) => `${l.lotId}:${l.lastEventId}`).join("|"),
    ],
    queryFn: async () => {
      const result = [];
      // shortcut: detail API needs one read per lot, replace with a paginated aggregate API for large datasets.
      for (let i = 0; i < (lots.data?.length || 0); i += 6) {
        result.push(
          ...(await Promise.all(
            lots.data!.slice(i, i + 6).map((lot) => lotService.get(lot.lotId)),
          )),
        );
      }
      return result;
    },
    enabled: enabled && !!lots.data,
  });
  return {
    ...details,
    isPending: lots.isPending || details.isPending,
    error: lots.error || details.error,
    refetch: async () => {
      await lots.refetch();
      return details.refetch();
    },
  };
}

export function useOrganizations() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["organizations"], queryFn: adminService.organizations, enabled: !!user && hasPermission(user, "ORGANIZATION_READ") });
}
