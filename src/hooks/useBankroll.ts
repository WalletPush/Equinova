import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { callSupabaseFunction } from '@/lib/supabase'

interface UserBankroll {
  user_id: string
  current_amount: number
  created_at: string
  updated_at: string
  has_bankroll: boolean
}

export function useBankroll() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-bankroll'],
    queryFn: async () => {
      const res = await callSupabaseFunction('get-user-bankroll', {})
      return res?.data as UserBankroll
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const addFundsMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await callSupabaseFunction('add-bankroll-amount', { amount })
      return res?.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-bankroll'] })
    },
  })

  const bankroll = data?.current_amount ?? 0
  const needsSetup = !isLoading && !!user && (!data?.has_bankroll || bankroll <= 0)

  return {
    bankroll,
    needsSetup,
    isLoading,
    error,
    addFunds: addFundsMutation.mutateAsync,
    isAddingFunds: addFundsMutation.isPending,
    refetch,
  }
}
